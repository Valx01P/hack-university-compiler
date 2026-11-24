// What npm run up can install, piece by piece (lib/components.json): which
// pieces are here, how much disk a choice takes, and installing and removing
// them. npm run up, npm run add, npm run remove, and npm run status all use
// this. Only Node's own modules here: npm run up loads it before npm install.
import { execFile, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { ROOT, dataDir, npmCommand } from "./servers.mjs";

export const CATALOG = JSON.parse(readFileSync(path.join(ROOT, "lib", "components.json"), "utf8"));
export const COMPONENTS = CATALOG.components;
const BY_ID = new Map(COMPONENTS.map((c) => [c.id, c]));
const windows = process.platform === "win32";
const npm = windows ? "npm.cmd" : "npm";

export const GROUPS = [{ id: "compilers", label: "Compilers" }];

/** Other names people type: course slugs and package names. */
const ALIASES = {
  "c++": "cpp",
  gcc: "cpp",
  node: "javascript",
  js: "javascript",
  ts: "typescript",
  py: "python",
  golang: "go",
};

const REGISTRY = JSON.parse(readFileSync(path.join(ROOT, "content", "courses.json"), "utf8")).courses;

/**
 * The courses with no compiler page whose lessons run in another course's
 * compiler (`runsIn` in content/courses.json): Math's are Python programs,
 * so Math needs Python installed and has nothing of its own. Each one's id,
 * label, and the component it runs on.
 */
export const HOSTED_COURSES = REGISTRY.filter((c) => !c.page && c.runsIn && BY_ID.has(c.runsIn)).map((c) => ({ id: c.slug, label: c.label, host: c.runsIn }));
const HOSTED = new Map(HOSTED_COURSES.map((c) => [c.id, c]));

/**
 * The project courses (web, React, Spring Boot…): read lessons in Learn, so
 * there's nothing of theirs to install any more. Their slugs (the courses
 * without a compiler page or one to run in), the names people used for
 * them, and the group they were in, so asking for one says so instead of
 * "there's nothing named".
 */
const PROJECT_COURSES = new Set([
  ...REGISTRY.filter((c) => !c.page && !HOSTED.has(c.slug)).map((c) => c.slug),
  "courses",
  "html",
  "css",
  "next",
  "spring-boot",
  "springboot",
  "go-apis",
  "goapi",
]);

/** The component ids a name stands for: an id, an alias, a group, or all.
    `courses` are the project courses named, which need nothing installed,
    and `hosted` the courses named that run on a compiler (HOSTED_COURSES),
    which the caller adds that compiler for, or leaves be. */
export function resolveNames(names) {
  const ids = [];
  const unknown = [];
  const courses = [];
  const hosted = [];
  for (const raw of names) {
    const name = raw.toLowerCase();
    if (name === "all" || name === "everything") ids.push(...COMPONENTS.map((c) => c.id));
    else if (GROUPS.some((g) => g.id === name)) ids.push(...COMPONENTS.filter((c) => c.group === name).map((c) => c.id));
    else if (BY_ID.has(name)) ids.push(name);
    else if (ALIASES[name]) ids.push(ALIASES[name]);
    else if (HOSTED.has(name)) hosted.push(HOSTED.get(name));
    else if (PROJECT_COURSES.has(name)) courses.push(raw);
    else unknown.push(raw);
  }
  return { ids: [...new Set(ids)], unknown, courses, hosted };
}

/** What asking to install or remove a project course gets. */
export const projectCourseNote = (names) =>
  `${and(names)} ${names.length > 1 ? "are project courses" : "is a project course"}: read lessons in Learn, with nothing to install. To try the code, the playground (/playground) is a folder on this computer with an editor and a terminal.`;

/** What naming a course that runs on a compiler gets. Adding it adds that
    compiler. Removing it removes nothing, so naming Math never takes
    Python away: that's Python's own name to say. */
export function hostedNote(hosted, command) {
  return hosted
    .map((c) => {
      const host = shortName(c.host);
      return command === "remove"
        ? `${c.label}'s lessons run on ${host}, so ${c.label} has nothing of its own to remove. To remove ${host}, which ${c.label} needs: npm run remove -- ${c.host}`
        : `${c.label}'s lessons run on ${host}, so that's what adding ${c.label} adds (npm run add -- ${c.host}).`;
    })
    .join("\n");
}

export const component = (id) => BY_ID.get(id);
export const defaults = () => COMPONENTS.filter((c) => c.default).map((c) => c.id);

/** MB on disk for a set of components: each one's own, plus every part they
    need, each part once. */
export function sizeMB(ids) {
  const parts = new Set();
  let mb = 0;
  for (const id of ids) {
    const c = BY_ID.get(id);
    if (!c) continue;
    mb += c.mb;
    for (const p of c.parts ?? []) parts.add(p);
  }
  for (const p of parts) mb += CATALOG.parts[p]?.mb ?? 0;
  return mb;
}

/** "2.8 GB" or "215 MB". */
export function formatMB(mb) {
  if (mb >= 950) return `${(mb / 1000).toFixed(1)} GB`;
  return `${Math.max(0, Math.round(mb))} MB`;
}

/** Free disk where Docker and this folder keep their files (the home disk),
    in MB, or null where it can't be read. */
export function freeMB() {
  try {
    const disk = statfsSync(os.homedir());
    return (disk.bavail * disk.bsize) / 1e6;
  } catch {
    return null;
  }
}

// --- What's here ----------------------------------------------------------------

function quiet(cmd, args, timeout = 60_000) {
  const [file, argv, shell] = cmd === npm ? npmCommand(args) : [cmd, args, false];
  return spawnSync(file, argv, { cwd: ROOT, stdio: "pipe", shell, encoding: "utf8", timeout });
}

/** A Node script's output, like quiet's, without waiting on it, so the
    checks that each start one can run at once. */
function nodeOutput(args, timeout = 60_000) {
  return new Promise((resolve) => {
    execFile(process.execPath, args, { cwd: ROOT, encoding: "utf8", timeout }, (_err, stdout) => resolve(String(stdout ?? "")));
  });
}

export function dockerUp() {
  const r = quiet("docker", ["info", "--format", "{{.ServerVersion}}"], 15_000);
  return !r.error && r.status === 0;
}

/** Piston's installed runtimes, as language ids from lib/runtimes.json, or
    null when the sandbox isn't answering. */
function pistonLanguages() {
  const runtimes = JSON.parse(readFileSync(path.join(ROOT, "lib", "runtimes.json"), "utf8"));
  const url = (process.env.PISTON_URL ?? "http://127.0.0.1:2000/api/v2").replace(/\/+$/, "") + "/runtimes";
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 4000 }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try {
          const list = JSON.parse(raw);
          const have = new Set(list.map((r) => r.language));
          resolve(new Set(Object.entries(runtimes).filter(([, r]) => have.has(r.runtime)).map(([id]) => id)));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

/** The runner's images that are built and current ("ready"). */
async function readyImages() {
  if (!existsSync(path.join(ROOT, "runner", "node_modules"))) return new Set();
  const out = await nodeOutput([path.join("runner", "images.ts"), "status"]);
  const ready = new Set();
  for (const line of out.split("\n")) {
    const m = /^hu\/([a-z-]+):\S+\s+ready\b/.exec(line.trim());
    if (m) ready.add(m[1]);
  }
  return ready;
}

/** Whether the compiler sandbox's languages volume exists (the sandbox can
    be stopped with its languages kept). */
function sandboxVolume() {
  const r = quiet("docker", ["volume", "ls", "--quiet", "--filter", "name=^hack-university-compiler_piston-packages$"], 15_000);
  return String(r.stdout ?? "").trim().length > 0;
}

/**
 * What's installed now: every compiler whose parts are all here (its
 * language in the sandbox, or its image). Without Docker nothing past the
 * app can be here (or be checked). `stopped` means the compiler sandbox is
 * installed but not running, so which languages it has can't be read until
 * it starts.
 */
export async function detect() {
  const docker = dockerUp();
  if (!docker) return { docker, sandbox: false, stopped: false, installed: new Set() };
  // Each asks Docker or the sandbox on its own, so they ask at once.
  const [languages, images] = await Promise.all([pistonLanguages(), readyImages()]);
  const installed = new Set();
  for (const c of COMPONENTS) {
    const ok = c.piston ? !!languages?.has(c.piston) : (c.images ?? []).every((i) => images.has(i));
    if (ok) installed.add(c.id);
  }
  return { docker, sandbox: languages !== null, stopped: languages === null && sandboxVolume(), installed };
}

// --- Your choice ------------------------------------------------------------------

const choiceFile = () => path.join(dataDir(), "components.json");

/** The components you chose last time, or null before the first choice. */
export function savedChoice() {
  try {
    const saved = JSON.parse(readFileSync(choiceFile(), "utf8"));
    return Array.isArray(saved.chosen) ? saved.chosen.filter((id) => BY_ID.has(id)) : null;
  } catch {
    return null;
  }
}

export function saveChoice(ids) {
  const chosen = COMPONENTS.map((c) => c.id).filter((id) => ids.includes(id));
  writeFileSync(choiceFile(), `${JSON.stringify({ chosen, updated: new Date().toISOString() }, null, 2)}\n`);
}

// --- Installing and removing ---------------------------------------------------------

function loud(cmd, args) {
  const [file, argv, shell] = cmd === npm ? npmCommand(args) : [cmd, args, false];
  const r = spawnSync(file, argv, { cwd: ROOT, stdio: "inherit", shell });
  return !r.error && r.status === 0;
}

/** What installing these takes: Piston languages, and images to build. */
export function installPlan(ids) {
  const picked = ids.map((id) => BY_ID.get(id)).filter(Boolean);
  return {
    languages: [...new Set(picked.filter((c) => c.piston).map((c) => c.piston))],
    images: [...new Set(picked.flatMap((c) => c.images ?? []))],
  };
}

/** Installs the components (skipping what's already here). Returns false
    when a step failed (its own output says why). */
export function install(ids) {
  const plan = installPlan(ids);
  let ok = true;
  if (plan.languages.length) {
    ok = loud(npm, ["run", "--silent", "piston:up"]) && ok;
    ok = loud(process.execPath, [path.join("scripts", "setup-piston.mjs"), ...plan.languages]) && ok;
  }
  if (plan.images.length) ok = loud(process.execPath, [path.join("runner", "images.ts"), "build", ...plan.images]) && ok;
  return ok;
}

/**
 * What removing `ids` deletes, given that `keep` stays installed: their Piston
 * languages, and the images nothing kept still needs. The sandbox itself goes
 * only when `sandbox` is set and no compiler is kept.
 *
 * `mb` is the disk that frees now, and `shared` names the parts that stay
 * because a kept component uses them.
 */
export function removePlan(ids, keep, { sandbox = false } = {}) {
  const kept = keep.filter((id) => !ids.includes(id)).map((id) => BY_ID.get(id)).filter(Boolean);
  const keptParts = new Set(kept.flatMap((c) => c.parts ?? []));
  const going = ids.map((id) => BY_ID.get(id)).filter(Boolean);
  const plan = {
    languages: [...new Set(going.filter((c) => c.piston).map((c) => c.piston))],
    images: [...new Set(going.flatMap((c) => c.images ?? []))].filter((i) => !keptParts.has(`image-${i}`)),
    sandbox: sandbox && !kept.some((c) => c.piston),
    shared: [...new Set(going.flatMap((c) => c.parts ?? []))]
      .filter((p) => p !== "sandbox" && keptParts.has(p))
      .map((p) => ({ part: CATALOG.parts[p].label, by: kept.filter((c) => c.parts?.includes(p)).map((c) => c.short ?? c.label) })),
  };
  const part = (p) => CATALOG.parts[p]?.mb ?? 0;
  plan.mb =
    going.filter((c) => c.piston).reduce((n, c) => n + c.mb, 0) +
    plan.images.reduce((n, i) => n + part(`image-${i}`), 0) +
    (plan.sandbox ? part("sandbox") : 0);
  return plan;
}

/** The kept components that use every part of `id`, so removing it alone
    deletes nothing (a compiler always has its language to delete). */
export function heldBy(id, keep) {
  const c = BY_ID.get(id);
  if (!c || c.piston) return [];
  const plan = removePlan([id], keep);
  if (plan.images.length) return [];
  return keep.filter((k) => k !== id && (c.parts ?? []).some((p) => BY_ID.get(k)?.parts?.includes(p))).map((k) => shortName(k));
}

/** A component's name inside a sentence. */
export const shortName = (id) => BY_ID.get(id)?.short ?? BY_ID.get(id)?.label ?? id;

/** "Bash", "TypeScript and Bash", "Bash, Go, and Java". */
export function and(items) {
  if (items.length < 3) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/** "uses" for one, "use" for several. */
export const uses = (items) => (items.length > 1 ? "use" : "uses");

/** Carries out a removePlan. Returns false when a step failed. */
export function remove(plan) {
  let ok = true;
  if (plan.languages.length) ok = loud(process.execPath, [path.join("scripts", "setup-piston.mjs"), "--remove", ...plan.languages]) && ok;
  if (plan.images.length) ok = loud(process.execPath, [path.join("runner", "images.ts"), "remove", ...plan.images]) && ok;
  if (plan.sandbox) {
    // Stops it and deletes its image and the volume its languages lived in.
    ok = loud("docker", ["compose", "down", "--rmi", "all", "--volumes"]) && ok;
  }
  return ok;
}
