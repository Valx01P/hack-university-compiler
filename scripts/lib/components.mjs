// What npm run up can install, piece by piece (lib/components.json): which
// pieces are here, how much disk a choice takes, and installing and removing
// them. npm run up, npm run add, npm run remove, and npm run status all use
// this. Only Node's own modules here: npm run up loads it before npm install.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { ROOT, dataDir } from "./servers.mjs";

export const CATALOG = JSON.parse(readFileSync(path.join(ROOT, "lib", "components.json"), "utf8"));
export const COMPONENTS = CATALOG.components;
const BY_ID = new Map(COMPONENTS.map((c) => [c.id, c]));
const windows = process.platform === "win32";
const npm = windows ? "npm.cmd" : "npm";

export const GROUPS = [
  { id: "compilers", label: "Compilers" },
  { id: "courses", label: "Project courses" },
];

/** Other names people type: course slugs, package names, and groups. */
const ALIASES = {
  "c++": "cpp",
  gcc: "cpp",
  node: "javascript",
  js: "javascript",
  ts: "typescript",
  py: "python",
  golang: "go",
  html: "web",
  css: "web",
  react: "web",
  nextjs: "web",
  next: "web",
  "spring-boot": "spring",
  springboot: "spring",
  "go-apis": "go-api",
  goapi: "go-api",
};

/** The component ids a name stands for: an id, an alias, a group, or all. */
export function resolveNames(names) {
  const ids = [];
  const unknown = [];
  for (const raw of names) {
    const name = raw.toLowerCase();
    if (name === "all" || name === "everything") ids.push(...COMPONENTS.map((c) => c.id));
    else if (GROUPS.some((g) => g.id === name)) ids.push(...COMPONENTS.filter((c) => c.group === name).map((c) => c.id));
    else if (BY_ID.has(name)) ids.push(name);
    else if (ALIASES[name]) ids.push(ALIASES[name]);
    else unknown.push(raw);
  }
  return { ids: [...new Set(ids)], unknown };
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
  return spawnSync(cmd, args, { cwd: ROOT, stdio: "pipe", shell: windows && cmd === npm, encoding: "utf8", timeout });
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
function readyImages() {
  if (!existsSync(path.join(ROOT, "runner", "node_modules"))) return new Set();
  const r = quiet(process.execPath, [path.join("runner", "images.ts"), "status"]);
  const ready = new Set();
  for (const line of String(r.stdout ?? "").split("\n")) {
    const m = /^hu\/([a-z-]+):\S+\s+ready\b/.exec(line.trim());
    if (m) ready.add(m[1]);
  }
  return ready;
}

/** The course databases that are downloaded. */
function downloadedDatabases() {
  if (!existsSync(path.join(ROOT, "runner", "node_modules"))) return new Set();
  const r = quiet(process.execPath, [path.join("runner", "db", "pull.ts"), "--status"]);
  const have = new Set();
  for (const line of String(r.stdout ?? "").split("\n")) {
    const m = /^(postgres|mongo):\S+\s+downloaded\b/.exec(line.trim());
    if (m) have.add(m[1]);
  }
  return have;
}

/** Whether the compiler sandbox's languages volume exists (the sandbox can
    be stopped with its languages kept). */
function sandboxVolume() {
  const r = quiet("docker", ["volume", "ls", "--quiet", "--filter", "name=^hack-university-compiler_piston-packages$"], 15_000);
  return String(r.stdout ?? "").trim().length > 0;
}

/**
 * What's installed now: every component whose parts are all here. Components
 * share parts, so one can be here without being added on its own, like the
 * web courses beside TypeScript (they use the same two images). Without
 * Docker nothing past the app can be here (or be checked). `stopped` means
 * the compiler sandbox is installed but not running, so which languages it
 * has can't be read until it starts.
 */
export async function detect() {
  const docker = dockerUp();
  if (!docker) return { docker, sandbox: false, stopped: false, installed: new Set() };
  const languages = await pistonLanguages();
  const images = readyImages();
  const databases = downloadedDatabases();
  const installed = new Set();
  for (const c of COMPONENTS) {
    const ok = c.piston
      ? !!languages?.has(c.piston)
      : (c.images ?? []).every((i) => images.has(i)) && (c.databases ?? []).every((d) => databases.has(d));
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
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: windows && cmd === npm });
  return !r.error && r.status === 0;
}

/** What installing these takes: Piston languages, images to build, and
    databases to download. */
export function installPlan(ids) {
  const picked = ids.map((id) => BY_ID.get(id)).filter(Boolean);
  return {
    languages: [...new Set(picked.filter((c) => c.piston).map((c) => c.piston))],
    images: [...new Set(picked.flatMap((c) => c.images ?? []))],
    databases: [...new Set(picked.flatMap((c) => c.databases ?? []))],
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
  if (plan.databases.length) ok = loud(process.execPath, [path.join("runner", "db", "pull.ts"), ...plan.databases]) && ok;
  return ok;
}

/**
 * What removing `ids` deletes, given that `keep` stays installed: their Piston
 * languages, and the images and databases nothing kept still needs. The
 * sandbox itself goes only when `sandbox` is set and no compiler is kept.
 *
 * `mb` is the disk that frees now. `shared` names the parts that stay because
 * a kept component uses them, and `caches` is the MB of the courses' package
 * caches, which the runner clears by itself after 30 days unused.
 */
export function removePlan(ids, keep, { sandbox = false } = {}) {
  const kept = keep.filter((id) => !ids.includes(id)).map((id) => BY_ID.get(id)).filter(Boolean);
  const keptParts = new Set(kept.flatMap((c) => c.parts ?? []));
  const going = ids.map((id) => BY_ID.get(id)).filter(Boolean);
  const plan = {
    languages: [...new Set(going.filter((c) => c.piston).map((c) => c.piston))],
    images: [...new Set(going.flatMap((c) => c.images ?? []))].filter((i) => !keptParts.has(`image-${i}`)),
    databases: [...new Set(going.flatMap((c) => c.databases ?? []))].filter((d) => !keptParts.has(d)),
    sandbox: sandbox && !kept.some((c) => c.piston),
    shared: [...new Set(going.flatMap((c) => c.parts ?? []))]
      .filter((p) => p !== "sandbox" && keptParts.has(p))
      .map((p) => ({ part: CATALOG.parts[p].label, by: kept.filter((c) => c.parts?.includes(p)).map((c) => c.short ?? c.label) })),
    caches: going.filter((c) => !c.piston).reduce((n, c) => n + c.mb, 0),
  };
  const part = (p) => CATALOG.parts[p]?.mb ?? 0;
  plan.mb =
    going.filter((c) => c.piston).reduce((n, c) => n + c.mb, 0) +
    plan.images.reduce((n, i) => n + part(`image-${i}`), 0) +
    plan.databases.reduce((n, d) => n + part(d), 0) +
    (plan.sandbox ? part("sandbox") : 0);
  return plan;
}

/** The kept components that use every part of `id`, so removing it alone
    deletes nothing (a compiler always has its language to delete). */
export function heldBy(id, keep) {
  const c = BY_ID.get(id);
  if (!c || c.piston) return [];
  const plan = removePlan([id], keep);
  if (plan.images.length || plan.databases.length) return [];
  return keep.filter((k) => k !== id && (c.parts ?? []).some((p) => BY_ID.get(k)?.parts?.includes(p))).map((k) => shortName(k));
}

/** A component's name inside a sentence ("the web courses"). */
export const shortName = (id) => BY_ID.get(id)?.short ?? BY_ID.get(id)?.label ?? id;

/** "Express", "TypeScript and Express", "Bash, Go, and Java". */
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
  if (plan.databases.length) ok = loud(process.execPath, [path.join("runner", "db", "pull.ts"), "--remove", ...plan.databases]) && ok;
  if (plan.sandbox) {
    // Stops it and deletes its image and the volume its languages lived in.
    ok = loud("docker", ["compose", "down", "--rmi", "all", "--volumes"]) && ok;
  }
  return ok;
}
