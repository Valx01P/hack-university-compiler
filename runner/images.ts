import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Docker from "dockerode";
import { LABEL } from "./docker.ts";

/**
 * The hu/* images (architecture §2.4, PLAN.md 9.3). Each is built locally from
 * docker/<name>/Dockerfile with the docker/ folder as its context, natively
 * for this machine, and tagged hu/<name>:<sha12> of the Dockerfile and every
 * file it copies, so a rebuild happens only when content changes. The
 * previous tag is kept and older ones are pruned. Building needs the internet
 * once. Running never does.
 *
 * Builds go through the docker CLI, which drives BuildKit (the Engine API's
 * build endpoint is the legacy builder), with the runner's own DOCKER_HOST so
 * both reach the same daemon.
 *
 * A stack image may build FROM another hu image (hu/web on hu/node): the
 * parent is built first, its tag is part of the child's hash, and the child's
 * Dockerfile gets it as the HU_BASE build argument. A stack image also bakes
 * its courses' template lockfiles into its offline cache, so they are part of
 * its hash too: they reach the build as the `templates` build context, staged
 * from content/workspaces/<course>/ with their paths kept.
 *
 *   node runner/images.ts                        # build hu/node and hu/bash when missing
 *   node runner/images.ts build bash             # just one
 *   node runner/images.ts build --stacks=express # a course's image (and its parent)
 *   node runner/images.ts build --stacks=all     # every image
 *   node runner/images.ts build --force          # rebuild even when the tag exists
 *   node runner/images.ts status                 # tags, states, and sizes
 */

interface ImageSpec {
  dockerfile: string;
  /** Folders under the repo the build copies from, hashed into the tag. */
  inputs: readonly string[];
  /** The hu image this one is built FROM. */
  from?: string;
  /** The template files this image bakes in: these names, under content/workspaces/<course>/. */
  templates?: { courses: readonly string[]; files: readonly string[] };
  /** The runner's recipes that run in it. */
  recipes: readonly string[];
  /** Built by npm run up (and by npm run images with no names). The rest wait for Prepare this course. */
  core?: boolean;
}

export const IMAGES = {
  node: { dockerfile: "docker/node/Dockerfile", inputs: ["docker/node", "docker/shared"], recipes: ["typescript"], core: true },
  bash: { dockerfile: "docker/bash/Dockerfile", inputs: ["docker/bash", "docker/shared"], recipes: ["bash"], core: true },
  web: {
    dockerfile: "docker/web/Dockerfile",
    inputs: ["docker/web", "docker/pgdg"],
    from: "node",
    templates: { courses: ["web", "react", "nextjs", "express"], files: ["package.json", "package-lock.json"] },
    recipes: [],
  },
  python: {
    dockerfile: "docker/python/Dockerfile",
    inputs: ["docker/python", "docker/pgdg", "docker/shared"],
    templates: { courses: ["fastapi"], files: ["pyproject.toml", "uv.lock", ".python-version"] },
    recipes: [],
  },
  java: {
    dockerfile: "docker/java/Dockerfile",
    inputs: ["docker/java", "docker/pgdg", "docker/shared"],
    templates: { courses: ["spring"], files: ["pom.xml"] },
    recipes: [],
  },
  go: {
    dockerfile: "docker/go/Dockerfile",
    inputs: ["docker/go", "docker/pgdg", "docker/shared"],
    templates: { courses: ["go-api"], files: ["go.mod", "go.sum"] },
    recipes: [],
  },
} as const satisfies Record<string, ImageSpec>;

export type ImageName = keyof typeof IMAGES;

/** An image's spec, typed as the interface (so optional fields read as such). */
export function spec(name: ImageName): ImageSpec {
  return IMAGES[name];
}

/** The images npm run up builds. */
export const CORE_IMAGES = (Object.keys(IMAGES) as ImageName[]).filter((n) => spec(n).core);
export type ImageState = "ready" | "missing" | "building";

export function isImageName(name: string): name is ImageName {
  return Object.hasOwn(IMAGES, name);
}

/** Every file an image is built from, sorted, skipping dotfiles like .DS_Store. */
function inputFiles(root: string, name: ImageName): string[] {
  const files: string[] = [];
  const walk = (rel: string) => {
    const full = path.join(root, rel);
    if (statSync(full).isDirectory()) {
      for (const entry of readdirSync(full).sort()) if (!entry.startsWith(".")) walk(path.posix.join(rel, entry));
    } else {
      files.push(rel);
    }
  };
  for (const input of IMAGES[name].inputs) walk(input);
  return [...new Set(files)].sort();
}

/** Folders a template's dependency files never sit in. */
const SKIP_DIRS = new Set(["node_modules", ".venv", "target", ".git", ".next", "dist", "build"]);

/** Every template file an image bakes in, relative to content/workspaces, sorted. */
export function templateFiles(root: string, name: ImageName): string[] {
  const templates = spec(name).templates;
  if (!templates) return [];
  const base = path.join(root, "content", "workspaces");
  const files: string[] = [];
  const walk = (rel: string) => {
    for (const entry of readdirSync(path.join(base, rel), { withFileTypes: true })) {
      const child = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(child);
      } else if (entry.isFile() && templates.files.includes(entry.name)) {
        files.push(child);
      }
    }
  };
  for (const course of templates.courses) if (existsSync(path.join(base, course))) walk(course);
  return files.sort();
}

/**
 * The first 12 hex characters of SHA-256 over each input's path, mode, and
 * bytes, the parent image's tag, and each template file's path and bytes.
 */
export function imageHash(root: string, name: ImageName): string {
  const hash = createHash("sha256");
  for (const rel of inputFiles(root, name)) {
    const full = path.join(root, rel);
    const executable = (statSync(full).mode & 0o111) !== 0;
    hash.update(`${rel}\0${executable ? "x" : "-"}\0`);
    hash.update(readFileSync(full));
    hash.update("\0");
  }
  const from = spec(name).from;
  if (from) hash.update(`from\0${imageTag(root, from as ImageName)}\0`);
  for (const rel of templateFiles(root, name)) {
    hash.update(`template\0${rel}\0`);
    hash.update(readFileSync(path.join(root, "content", "workspaces", rel)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}

/** Copies an image's template files into a fresh folder for the templates build context. */
function stageTemplates(root: string, name: ImageName): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hu-templates-${name}-`));
  writeFileSync(path.join(dir, "README"), `The template files hu/${name} bakes in, staged by runner/images.ts.\n`);
  for (const rel of templateFiles(root, name)) {
    mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    copyFileSync(path.join(root, "content", "workspaces", rel), path.join(dir, rel));
  }
  return dir;
}

export function imageTag(root: string, name: ImageName): string {
  return `hu/${name}:${imageHash(root, name)}`;
}

/** The versions an image's Dockerfile pins, from its hu.versions label. */
export type Versions = Record<string, string>;

export class Images {
  private readonly root: string;
  private readonly docker: Docker;
  private readonly dockerHost: string;
  private readonly tags = new Map<ImageName, string>();
  private readonly states = new Map<ImageName, ImageState>();
  private readonly versions = new Map<ImageName, Versions>();
  private readonly builds = new Map<ImageName, Promise<void>>();

  constructor(root: string, docker: Docker, dockerHost: string) {
    this.root = root;
    this.docker = docker;
    this.dockerHost = dockerHost;
    for (const name of Object.keys(IMAGES) as ImageName[]) this.states.set(name, "missing");
  }

  /** The tag the current sources build, computed once per runner start. */
  tag(name: ImageName): string {
    let tag = this.tags.get(name);
    if (!tag) this.tags.set(name, (tag = imageTag(this.root, name)));
    return tag;
  }

  state(name: ImageName): ImageState {
    return this.states.get(name) ?? "missing";
  }

  versionsOf(name: ImageName): Versions {
    return this.versions.get(name) ?? {};
  }

  /** Looks each image up in Docker, except those building, which look themselves up when done. */
  async refresh(): Promise<void> {
    for (const name of Object.keys(IMAGES) as ImageName[]) {
      if (!this.builds.has(name)) await this.lookup(name);
    }
  }

  /** Reads one image's state, and its versions from its hu.versions label. */
  private async lookup(name: ImageName): Promise<void> {
    try {
      const info = await this.docker.getImage(this.tag(name)).inspect();
      this.states.set(name, "ready");
      try {
        this.versions.set(name, JSON.parse(info.Config?.Labels?.["hu.versions"] ?? "{}"));
      } catch {
        this.versions.set(name, {});
      }
    } catch {
      this.states.set(name, "missing");
    }
  }

  /** Builds an image, at most one build per image at a time. `onLine` gets BuildKit's progress. */
  build(name: ImageName, onLine: (line: string) => void = () => {}): Promise<void> {
    const running = this.builds.get(name);
    if (running) return running;
    const build = this.runBuild(name, onLine).finally(() => this.builds.delete(name));
    this.builds.set(name, build);
    this.states.set(name, "building");
    return build;
  }

  private async runBuild(name: ImageName, onLine: (line: string) => void): Promise<void> {
    const { dockerfile, from, templates } = spec(name);
    if (from && this.state(from as ImageName) !== "ready") {
      await this.lookup(from as ImageName);
      if (this.state(from as ImageName) !== "ready") await this.build(from as ImageName, onLine);
    }
    const tag = this.tag(name);
    const hash = tag.split(":")[1];
    const args = [
      "build",
      "--progress=plain",
      "--provenance=false",
      "--tag", tag,
      "--label", `${LABEL.managed}=1`,
      "--label", `${LABEL.image}=${name}`,
      "--label", `${LABEL.hash}=${hash}`,
      "--file", dockerfile,
    ];
    if (from) args.push("--build-arg", `HU_BASE=${this.tag(from as ImageName)}`);
    const staged = templates ? stageTemplates(this.root, name) : null;
    if (staged) args.push("--build-context", `templates=${staged}`);
    args.push("docker");
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn("docker", args, {
          cwd: this.root,
          env: { ...process.env, DOCKER_HOST: this.dockerHost, DOCKER_CLI_HINTS: "false" },
          stdio: ["ignore", "pipe", "pipe"],
        });
        const tail: string[] = [];
        const lines = (chunk: Buffer) => {
          for (const line of chunk.toString("utf8").split("\n")) {
            if (!line) continue;
            onLine(line);
            tail.push(line);
            if (tail.length > 20) tail.shift();
          }
        };
        child.stdout.on("data", lines);
        child.stderr.on("data", lines);
        child.on("error", (err) => reject(new Error(`Couldn't run docker build (${err.message}). Is the docker CLI installed?`)));
        child.on("close", (code) =>
          code === 0 ? resolve() : reject(new Error(`docker build for hu/${name} failed:\n${tail.join("\n")}`))
        );
      });
    } catch (err) {
      this.states.set(name, "missing");
      throw err;
    } finally {
      if (staged) rmSync(staged, { recursive: true, force: true });
    }
    // refresh() skips an image while it builds, so the new tag is read here:
    // /v1/health has its versions for the sandbox badge at once.
    await this.lookup(name);
    await this.prune(name);
  }

  /** The current tag's size in bytes (0 when it isn't built), and the older tags still kept. */
  async describe(name: ImageName): Promise<{ size: number; previous: string[] }> {
    const current = this.tag(name);
    const images = await this.docker.listImages({ filters: { label: [`${LABEL.managed}=1`, `${LABEL.image}=${name}`] } });
    let size = 0;
    const previous: string[] = [];
    for (const img of images.sort((a, b) => b.Created - a.Created)) {
      for (const tag of img.RepoTags ?? []) {
        if (tag === current) size = img.Size;
        else if (tag.startsWith(`hu/${name}:`)) previous.push(tag);
      }
    }
    return { size, previous };
  }

  /** Removes this image's older tags, keeping the current one and the one before it. */
  async prune(name: ImageName): Promise<string[]> {
    const current = this.tag(name);
    const images = await this.docker.listImages({ filters: { label: [`${LABEL.managed}=1`, `${LABEL.image}=${name}`] } });
    const older = images
      .filter((img) => !(img.RepoTags ?? []).includes(current))
      .sort((a, b) => b.Created - a.Created)
      .slice(1);
    const removed: string[] = [];
    for (const img of older) {
      for (const tag of img.RepoTags ?? []) {
        if (!tag.startsWith(`hu/${name}:`)) continue;
        try {
          await this.docker.getImage(tag).remove();
          removed.push(tag);
        } catch {
          /* in use by a container: next time */
        }
      }
    }
    return removed;
  }
}

// The command line: npm run images, npm run images:status, and npm run up.
if (import.meta.main) {
  const { resolveEndpoint, connect } = await import("./docker.ts");
  const { ROOT } = await import("./config.ts");
  const { STACKS, isStack } = await import("./stacks.ts");
  const argv = process.argv.slice(2);
  const command = argv[0] === "status" || argv[0] === "build" ? argv.shift() : "build";
  const force = argv.includes("--force");
  const verbose = argv.includes("--verbose");
  const names = argv.filter((a) => !a.startsWith("--"));
  for (const name of names) {
    if (!isImageName(name)) {
      console.error(`There is no image named ${name}. The images are: ${Object.keys(IMAGES).join(", ")}.`);
      process.exit(2);
    }
  }
  // --stacks=express,fastapi names courses, and builds the image each one runs in.
  const stacksArg = argv.find((a) => a.startsWith("--stacks="))?.slice("--stacks=".length);
  const stacks = stacksArg === "all" ? Object.keys(STACKS) : (stacksArg?.split(",").map((s) => s.trim()).filter(Boolean) ?? []);
  for (const stack of stacks) {
    if (!isStack(stack)) {
      console.error(`There is no course named ${stack}. The courses are: ${Object.keys(STACKS).join(", ")}.`);
      process.exit(2);
    }
  }
  const all = Object.keys(IMAGES) as ImageName[];
  const named = new Set<string>([...names, ...stacks.map((s) => STACKS[s as keyof typeof STACKS].image)]);
  // Building with no names builds the core images. Status with no names lists every image.
  const wanted = named.size ? all.filter((n) => named.has(n)) : command === "status" ? all : CORE_IMAGES;
  const endpoint = resolveEndpoint();
  const docker = connect(endpoint);
  try {
    await docker.ping();
  } catch {
    console.error("Docker isn't running. Start Docker Desktop, then try again.");
    process.exit(1);
  }
  const images = new Images(ROOT, docker, endpoint.dockerHost);
  await images.refresh();
  const gb = (bytes: number) => `${(bytes / 1e9).toFixed(2)} GB`;
  if (command === "status") {
    for (const name of wanted) {
      const { size, previous } = await images.describe(name);
      const kept = previous.length ? `  (kept: ${previous.join(", ")})` : "";
      console.log(`${images.tag(name)}  ${images.state(name)}${size ? `  ${gb(size)}` : ""}${kept}`);
    }
    process.exit(0);
  }
  for (const name of wanted) {
    if (images.state(name) === "ready" && !force) {
      console.log(`   ✓ ${images.tag(name)} is up to date`);
      continue;
    }
    console.log(`   Building ${images.tag(name)} (the first time takes a minute or three)...`);
    const started = Date.now();
    try {
      await images.build(name, (line) => {
        if (verbose) console.log(`     ${line}`);
      });
    } catch (err) {
      console.error(`\n✗ ${(err as Error).message}`);
      process.exit(1);
    }
    const { size } = await images.describe(name);
    console.log(`   ✓ ${images.tag(name)} built in ${Math.round((Date.now() - started) / 1000)} s (${gb(size)})`);
  }
}
