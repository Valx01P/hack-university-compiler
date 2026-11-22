// What earlier versions of Hack University left on this computer that this
// one no longer uses. The project courses (web, React, Next.js, Express,
// FastAPI, Spring Boot, Go APIs) used to open in workspaces of their own, in
// Docker: their images, their containers, package caches, and PostgreSQL and
// MongoDB. Now they're read lessons and there's one playground, a folder on
// this computer, so all of that sits unused, and lib/components.json no
// longer names it for npm run remove to find. npm run clean (and npm run
// uninstall) find it here instead, by exact name and by the labels the
// runner gave it, a learner's runner's only (hu.ns=live), so the verifiers'
// objects, the compiler sandbox (hu-piston), and anything else of yours are
// never in it.
//
// Most of it is only disk. Two parts are the learner's own work, so clean
// asks about each on its own, and keeps them unless told: the course
// databases' data, and the folders of workspaces that are gone (a course's
// playground, a lesson's, a challenge's), which the runner leaves where they
// are.
// Only Node's own modules here, and docker is spawned without a shell.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseScope, WORKSPACE_ID } from "../../lib/workspace-id.mjs";

/** The images the runner built for the project courses, tagged hu/<name>:<sha12>. */
const IMAGES = new Set(["hu/web", "hu/python", "hu/java", "hu/go"]);

/** The databases' images, pinned by digest, as the runner pulled them. */
const DB_IMAGES = [
  { ref: "postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873", tag: "postgres:18.6-alpine" },
  { ref: "mongo@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907", tag: "mongo:8.0.34" },
  { ref: "mongo@sha256:c53852c00c23ca9f23fc39690350ffa9a80e3642fe8f96879726d8da0abe80a7", tag: "mongo:7.0.45" },
];

/** The kinds of container only the project courses made: their workspaces
    (hu-ws-<id>), the checks run in them, and the database servers
    (hu-postgres, hu-mongo). The compilers' runs are jobs, and stay. */
const CONTAINER_KINDS = ["workspace", "checker", "db"];

/** Go's build cache, which Docker could also make unlabeled. */
const GO_CACHE = "hu-go-build";

/** The data folder's records of what's gone: the package caches the runner
    filled, and the ports it leased to workspaces' servers. */
const RECORDS = ["deps.json", "ports.json"];

/** ~/.hack-university (HU_DATA_DIR), looked at, never made. */
export const dataFolder = () => process.env.HU_DATA_DIR || path.join(os.homedir(), ".hack-university");

const LIVE = ["--filter", "label=hu.managed=1", "--filter", "label=hu.ns=live"];

function docker(args) {
  const r = spawnSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 30_000 });
  return r.error || r.status !== 0 ? null : String(r.stdout ?? "");
}
const rows = (args) => (docker(args) ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

const UNITS = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 };
/** Docker's own sizes ("2.24GB", "816MB", "4.1kB") as bytes. */
const bytesOf = (size) => {
  const m = /^([\d.]+)\s*([kKMGT]?B)$/.exec(String(size).trim());
  return m ? Number(m[1]) * UNITS[m[2].toUpperCase()] : 0;
};

/** Bytes as people read them, like Docker does: "1.2 GB" or "615 MB". */
export function formatBytes(bytes) {
  return bytes >= 950e6 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

/** The old workspaces' folders: a meta.json whose scope isn't one there is
    now (compiler/<course> or playground), oldest first. */
function oldFolders(data) {
  const root = path.join(data, "workspaces");
  let names = [];
  try {
    names = readdirSync(root).filter((n) => WORKSPACE_ID.test(n));
  } catch {
    return [];
  }
  const out = [];
  for (const id of names) {
    try {
      const meta = JSON.parse(readFileSync(path.join(root, id, "meta.json"), "utf8"));
      if (typeof meta.scope === "string" && !parseScope(meta.scope)) out.push({ dir: path.join(root, id), scope: meta.scope, at: Number(meta.lastActiveAt) || 0 });
    } catch {
      /* no meta.json, or not one of the runner's: not ours to judge */
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Everything retired that's here. Its `docker` says whether Docker answered:
 * with it down (or `withDocker` false), only the data folder's part is
 * found. The images' size counts layers shared with images that stay (hu/web
 * is built on hu/node), so what removing them frees is "up to" it.
 */
export function findRetired({ withDocker = true } = {}) {
  const data = dataFolder();
  const found = {
    docker: false,
    images: [],
    dbImages: [],
    imageBytes: 0,
    containers: [],
    networks: [],
    caches: [],
    databases: [],
    records: RECORDS.map((f) => path.join(data, f)).filter((f) => existsSync(f)),
    secrets: existsSync(path.join(data, "secrets.json")) ? path.join(data, "secrets.json") : null,
    folders: oldFolders(data),
  };
  if (!withDocker || docker(["version", "--format", "{{.Server.Version}}"]) === null) return found;
  found.docker = true;
  // Each image once, by id, with the size Docker shows for it.
  const sizes = new Map();
  for (const row of rows(["images", "--filter", "label=hu.managed=1", "--format", "{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}"])) {
    const [ref, id, size] = row.split("\t");
    if (!IMAGES.has(ref.slice(0, ref.lastIndexOf(":")))) continue;
    found.images.push(ref);
    sizes.set(id, size);
  }
  const pulled = rows(["images", "--digests", "--format", "{{.Repository}}@{{.Digest}}\t{{.ID}}\t{{.Size}}"]);
  for (const image of DB_IMAGES) {
    const row = pulled.find((r) => r.split("\t")[0] === image.ref);
    if (!row) continue;
    found.dbImages.push(image);
    sizes.set(row.split("\t")[1], row.split("\t")[2]);
  }
  for (const size of sizes.values()) found.imageBytes += bytesOf(size);
  for (const kind of CONTAINER_KINDS) {
    for (const row of rows(["ps", "--all", ...LIVE, "--filter", `label=hu.kind=${kind}`, "--format", "{{.ID}}\t{{.Names}}"])) {
      const [id, name] = row.split("\t");
      found.containers.push({ id, name, kind });
    }
  }
  found.networks = rows(["network", "ls", ...LIVE, "--filter", "label=hu.kind=db", "--format", "{{.Name}}"]);
  // The package caches (hu-deps-*, hu-go-build), and each workspace's own
  // volumes (its home, builds, and packages, hu-ws-<id>-*: its files were
  // always a folder on this computer).
  const caches = new Set([
    ...rows(["volume", "ls", ...LIVE, "--filter", "label=hu.kind=deps", "--format", "{{.Name}}"]),
    ...rows(["volume", "ls", ...LIVE, "--filter", "label=hu.workspace", "--format", "{{.Name}}"]),
  ]);
  if (docker(["volume", "inspect", "--format", "{{.Name}}", GO_CACHE])) caches.add(GO_CACHE);
  found.caches = [...caches].sort();
  found.databases = rows(["volume", "ls", ...LIVE, "--filter", "label=hu.kind=db", "--format", "{{.Name}}"]);
  return found;
}

/** Whether there's anything to free without asking about the learner's work. */
export const hasLeftovers = (f) => Boolean(f.images.length || f.dbImages.length || f.containers.length || f.networks.length || f.caches.length || f.records.length);

/** The lines that say what's retired, for clean and up. */
export function describeRetired(f) {
  const lines = [];
  if (f.images.length || f.dbImages.length) {
    const names = [...new Set(f.images.map((r) => r.slice(0, r.lastIndexOf(":"))))].concat(f.dbImages.map((i) => i.tag));
    lines.push(`their images: ${names.join(", ")} (up to ${formatBytes(f.imageBytes)})`);
  }
  const servers = f.containers.filter((c) => c.kind === "db").length;
  const workspaces = f.containers.length - servers;
  const containers = [
    workspaces ? `${workspaces} workspace container${workspaces > 1 ? "s" : ""}` : "",
    servers ? `the database server${servers > 1 ? "s" : ""}` : "",
    f.networks.length ? `the databases' network` : "",
  ].filter(Boolean);
  if (containers.length) lines.push(containers.length < 3 ? containers.join(" and ") : `${containers[0]}, ${containers[1]}, and ${containers[2]}`);
  if (f.caches.length) lines.push(`their package caches and workspace volumes (${f.caches.length})`);
  if (f.records.length) lines.push(`their records in ${path.dirname(f.records[0])} (${f.records.map((r) => path.basename(r)).join(", ")})`);
  return lines;
}

/** What a folder list reads as: "playground/typescript, learn/react/state/1/practice, and 3 more". */
export function folderNames(folders, max = 3) {
  const shown = folders.slice(0, max).map((f) => f.scope);
  return folders.length > max ? `${shown.join(", ")}, and ${folders.length - max} more` : shown.join(", ");
}

/**
 * Removes what was found: the leftovers with `leftovers`, the databases' data
 * (and their passwords) with `databases`, and the old folders with
 * `folders`. Containers go first, since they hold the volumes, the network,
 * and the images (the database servers too when only their data goes).
 * `step(what, ok)` hears how each went.
 */
export function removeRetired(f, { leftovers = true, databases = false, folders = false, step = () => {} } = {}) {
  const quietly = (args) => spawnSync("docker", args, { stdio: ["ignore", "ignore", "inherit"] }).status === 0;
  const remove = (file) => {
    try {
      rmSync(file, { recursive: true, force: true, maxRetries: 3 });
      return true;
    } catch {
      return false;
    }
  };
  const containers = leftovers ? f.containers : databases ? f.containers.filter((c) => c.kind === "db") : [];
  if (containers.length) step(leftovers ? "the workspace and database containers" : "the database servers", quietly(["rm", "--force", "--volumes", ...containers.map((c) => c.id)]));
  if (leftovers) {
    if (f.networks.length) step("the databases' network", quietly(["network", "rm", ...f.networks]));
    if (f.caches.length) step("the package caches and workspace volumes", quietly(["volume", "rm", "--force", ...f.caches]));
    if (f.images.length) step("the project courses' images", quietly(["rmi", "--force", ...f.images]));
    if (f.dbImages.length) step("the databases' images", quietly(["rmi", ...f.dbImages.map((i) => i.ref)]));
    if (f.records.length) step("their records", f.records.every(remove));
  }
  if (databases && f.databases.length) step("the course databases' data", quietly(["volume", "rm", "--force", ...f.databases]) && (!f.secrets || remove(f.secrets)));
  if (folders && f.folders.length) step(`${f.folders.length} old workspace folder${f.folders.length > 1 ? "s" : ""}`, f.folders.every((x) => remove(x.dir)));
}
