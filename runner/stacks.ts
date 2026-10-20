import type { ImageName } from "./images.ts";

/**
 * Each course that runs in the runner, keyed by its slug in
 * content/courses.json: the image its workspaces, checks, and single-file
 * runs use (architecture §2.4), the commands a template's tasks default to
 * (§6.7), how its dependencies install (§4.4), and what its containers mount
 * beyond a workspace's own files. The six Piston and PGlite courses have no
 * entry. "Prepare this course" (POST /v1/stacks/:stack/prepare) and
 * npm run images -- --stacks=<slug> build a course's image from here.
 *
 * Commands are shell strings for a task (sh -c, in the workdir), with the
 * workspace's environment: PORT is the port it leased, and HOST is 0.0.0.0.
 */
export interface Stack {
  image: ImageName;
  /** Where the files are, and where terminals and tasks start. */
  workdir: string;
  /** What a template's dev, test, and install tasks default to. null: the course has none. */
  commands: { dev: string | null; test: string | null; install: string | null };
  /**
   * Dependencies, by lockfile (§4.4). `target` is where a shared, read-only
   * dependency volume (hu-deps-<kind>-<lockhash>) or a workspace's own one
   * mounts, filled once by a job running `install` from the image's cache.
   */
  deps: { kind: "npm" | "uv" | "maven" | "go" | "none"; lockfile?: string; target?: string };
  /** Variables a workspace adds to the image's own. */
  env?: Record<string, string>;
  /** Volumes every container of the course mounts, shared by them all (§4.4, §5.3). */
  volumes?: { name: string; target: string }[];
  /**
   * Single-file runs (the course's recipe): the tmpfs work folder, which sits
   * inside the image's baked environment so its packages resolve by walking
   * up, the compile step when there is one, and the program's command there.
   */
  script?: { workdir: string; compile?: readonly string[]; run: readonly string[] };
}

const npm = {
  commands: { dev: "npm run dev", test: "npm test", install: "npm ci --offline --ignore-scripts" },
  deps: { kind: "npm", lockfile: "package-lock.json", target: "/workspace/node_modules" },
} as const;

export const STACKS = {
  typescript: { image: "node", workdir: "/workspace", ...npm },
  bash: {
    image: "bash",
    workdir: "/home/learner",
    commands: { dev: null, test: "bats test", install: null },
    deps: { kind: "none" },
  },
  web: { image: "web", workdir: "/workspace", ...npm },
  react: { image: "web", workdir: "/workspace", ...npm },
  nextjs: {
    image: "web",
    workdir: "/workspace",
    ...npm,
    script: { workdir: "/opt/hu/env/nextjs/work", run: ["node", "main.ts"] },
  },
  express: {
    image: "web",
    workdir: "/workspace",
    ...npm,
    script: { workdir: "/opt/hu/env/express/work", run: ["node", "main.ts"] },
  },
  fastapi: {
    image: "python",
    workdir: "/workspace",
    commands: {
      dev: "uv run fastapi dev --host 0.0.0.0 --port \"$PORT\"",
      test: "uv run pytest",
      install: "uv sync --frozen --offline",
    },
    deps: { kind: "uv", lockfile: "uv.lock", target: "/deps/venv" },
    env: { UV_PROJECT_ENVIRONMENT: "/deps/venv" },
    script: { workdir: "/opt/hu/env/fastapi/work", run: ["/opt/hu/env/fastapi/.venv/bin/python", "main.py"] },
  },
  spring: {
    image: "java",
    workdir: "/workspace",
    commands: { dev: "./mvnw spring-boot:run", test: "./mvnw test", install: "./mvnw -q compile" },
    deps: { kind: "maven", lockfile: "pom.xml" },
    // The web profile. core, boot, data, and secure swap the folder, and java
    // compiles and runs with no jars at all (outlines/spring.md 3.1).
    script: {
      workdir: "/work",
      compile: ["javac", "-parameters", "-proc:none", "--release", "25", "-d", "out", "-cp", "/opt/hu/spring/profiles/web/*", "Main.java"],
      run: ["java", "-cp", "out:/opt/hu/spring/profiles/web/*", "app.Main"],
    },
  },
  "go-api": {
    image: "go",
    workdir: "/workspace",
    commands: { dev: "go run ./cmd/api", test: "go test ./...", install: "go mod download" },
    deps: { kind: "go", lockfile: "go.sum" },
    volumes: [{ name: "hu-go-build", target: "/opt/hu/go-build" }],
    script: { workdir: "/opt/hu/env/go-api/work", compile: ["go", "build", "-o", "app", "."], run: ["./app"] },
  },
} as const satisfies Record<string, Stack>;

export type StackName = keyof typeof STACKS;

export function isStack(name: string): name is StackName {
  return Object.hasOwn(STACKS, name);
}

/** The course's stack, typed as the interface (so optional fields read as such). */
export function stack(name: StackName): Stack {
  return STACKS[name];
}
