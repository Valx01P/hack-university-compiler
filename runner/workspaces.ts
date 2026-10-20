import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Docker from "dockerode";
import { parseScope, workspaceId } from "../lib/workspace-id.mjs";
import { Cancelled, type Capacity, type Candidate } from "./capacity.ts";
import { addCourse } from "./components.ts";
import type { Config } from "./config.ts";
import { DbError, type Attachment, type Builder, type Databases, type DbEvent, type TemplateRef } from "./db/index.ts";
import { MongoError } from "./db/mongo.ts";
import { PgError } from "./db/postgres.ts";
import { SpecError, serviceSpec, type TemplateFiles } from "./db/spec.ts";
import { Deps, type DepsConfig, type DepsPlan } from "./deps.ts";
import { diagSpecs, runDiagnostics } from "./diagnostics.ts";
import { LABEL, isDockerDown, labelsFor, namePrefix, type DockerWatch, type Owner } from "./docker.ts";
import { EventHub, type EventMessage, type Subscriber } from "./events.ts";
import { execCollect } from "./exec.ts";
import { HttpError } from "./http-util.ts";
import { isImageName, type Images } from "./images.ts";
import { Job, type JobPool } from "./jobs.ts";
import type { Log } from "./log.ts";
import { PortsExhausted, RESERVED, portFree, type PortLeases } from "./ports.ts";
import { standardProfile, type JobLimits, type VolumeMount } from "./profiles.ts";
import type { HttpPanelRequest, OpenWorkspace } from "./schemas.ts";
import { isStack, stack } from "./stacks.ts";
import { ContainerFs } from "./storage/container.ts";
import {
  HEAVY,
  HostFs,
  PathError,
  buildManifest,
  checkRel,
  cloneTree,
  manifestHash,
  sha256,
  type Entry,
  type Manifest,
} from "./storage/host.ts";
import { packTar, unpackTar, type TarEntry } from "./tar.ts";
import { POLL, ending, launchTask, parsePoll, processOf, signalTask, type PollResult, type TaskDef, type TaskState } from "./tasks.ts";
import { TerminalSession } from "./terminals.ts";
import { Bridge, HttpThroughError, framing, requestThrough } from "./tunnel.ts";
import { Watcher } from "./watch.ts";
import { zip } from "./zip.ts";
import { isCourse, runnableImage, workspaceImage, workspaceLimits, type WorkspaceLimits } from "./workspace-images.ts";

/**
 * Workspaces (architecture §4.2): one project a learner works in, named by its
 * scope. It is files first: opening one materializes its template layers
 * (APFS clones) into HU_DATA_DIR/workspaces/<id>/, and its container, hu-ws-<id>,
 * exists only while something runs. One lock per workspace serializes open,
 * start, stop, reset, snapshots, check setup, and host-side writes.
 *
 *   files --start--> starting --> running --stop | idle | LRU | Docker--> stopping --> stopped
 *                       '--failure, undone--> error
 *
 * runner/README.md ("Workspaces") is the contract for every route here.
 */

export type Status = "files" | "starting" | "running" | "stopping" | "stopped" | "error";
export type FileState = "same" | "modified" | "new";

export interface WorkspaceConfig {
  image: string | null;
  storage: "host" | "volume";
  profile: "standard" | "sysadmin";
  start: "run" | "open";
  examples: "own" | "shared";
  ports: { env: string; label?: string; readyPath?: string; preview?: boolean }[];
  tasks: Record<string, TaskDef>;
  env: Record<string, string>;
  limits: { memoryMb?: number; cpus?: number; pids?: number };
  build: string[];
  hidden: string[];
  readonly: string[];
  restartOnReset: boolean;
  deps: Record<string, unknown> | null;
  services: Record<string, unknown> | null;
  diagnostics: unknown[];
}

export interface SnapshotInfo {
  id: string;
  label: string | null;
  auto: boolean;
  createdAt: number;
}

export interface Meta {
  version: 1;
  id: string;
  scope: string;
  course: string;
  template: string;
  layers: string[];
  templateHash: string;
  manifest: Manifest;
  config: WorkspaceConfig;
  createdAt: number;
  lastActiveAt: number;
  startedAt: number | null;
  stoppedAt: number | null;
  gitInit: boolean;
  snapshots: SnapshotInfo[];
  lastCheck: unknown;
}

export interface StatedEntry extends Entry {
  state: FileState;
}

/** A port the workspace serves, declared or found listening. */
interface PortState {
  /** The number on the Mac. */
  port: number;
  /** The number inside the container. */
  target: number;
  env: string | null;
  label: string | null;
  declared: boolean;
  preview: boolean;
  state: "listening" | "closed";
  bind: string | null;
  process: string | null;
  framable: boolean | null;
  reason: string | null;
  note: string | null;
  clearSiteData: boolean;
  bridge: Bridge | null;
  /** A detected port borrowed from the range or the Mac for as long as it runs. */
  borrowed: boolean;
  /** Forwarded with POST …/ports: it stays while the workspace runs, listening or not. */
  forwardedByHand?: boolean;
}

export interface Changes {
  added: string[];
  modified: string[];
  removed: string[];
}

const MiB = 1024 * 1024;
const WRITE_CAP = 1 * MiB;
const READ_CAP = 5 * MiB;
const TRASH_CAP = 50 * MiB;
const TRASH_TTL_MS = 24 * 3_600_000;
const MAX_TERMINALS = 4;
const MAX_CONNECTIONS = 64;
const AUTO_SNAPSHOTS = 5;
const NAMED_SNAPSHOTS = 20;
const VISIBLE_MS = 60_000;
const MEM_EVENT_MS = 5_000;
/** Paths a reset and the changes list leave alone: the repository and the runner's own temp files. */
const KEEP_ROOT = new Set([".git"]);

class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = this.tail.then(fn);
    this.tail = next.catch(() => {});
    return next;
  }
}

export interface ManagerDeps {
  config: Config;
  watch: DockerWatch;
  images: Images;
  owner: Owner;
  log: Log;
  leases: PortLeases;
  capacity: Capacity;
  /** The app's origins, for the framing probe. */
  appOrigins: string[];
  /** The databases of templates with `services` (db/). Without it such a workspace starts with none. */
  databases?: Databases;
  /** The job slots that dependency fills and template builds share with runs and checks. */
  pool?: JobPool;
}

/** Text when it is valid UTF-8 with no NUL in its first 8 KB. */
export function isText(data: Buffer): boolean {
  if (data.subarray(0, 8192).includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(data);
    return true;
  } catch {
    return false;
  }
}

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  svg: "image/svg+xml", ico: "image/x-icon", pdf: "application/pdf", zip: "application/zip", gz: "application/gzip",
  wasm: "application/wasm", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", mp3: "audio/mpeg", mp4: "video/mp4",
  json: "application/json", html: "text/html", css: "text/css", js: "text/javascript", ts: "text/plain", md: "text/markdown",
  txt: "text/plain", sqlite: "application/vnd.sqlite3", db: "application/octet-stream",
};

export function mimeOf(rel: string, text: boolean): string {
  const ext = rel.includes(".") ? rel.slice(rel.lastIndexOf(".") + 1).toLowerCase() : "";
  return MIME[ext] ?? (text ? "text/plain" : "application/octet-stream");
}

export class Workspace {
  readonly id: string;
  readonly dir: string;
  meta: Meta;
  status: Status = "files";
  detail: string | null = null;
  readonly lock = new Mutex();
  readonly hub = new EventHub();
  readonly files: HostFs;
  readonly original: HostFs;
  container: Docker.Container | null = null;
  lastActive = Date.now();
  lastVisible = 0;
  readonly terminals = new Map<string, TerminalSession>();

  private readonly m: Workspaces;
  private cfs: ContainerFs | null = null;
  private readonly watcher: Watcher;
  private readonly hashes = new Map<string, { size: number; mtimeMs: number; sha256: string }>();
  private readonly tasks = new Map<string, TaskState & { sentKill: boolean; launchedAt: number }>();
  private readonly logViews = new Map<string, TerminalSession>();
  private readonly ports = new Map<number, PortState>();
  private poller: NodeJS.Timeout | null = null;
  private polling = false;
  private bridged = 0;
  private readonly jar = new CookieJar();
  private mem: { usedMb: number; limitMb: number } | null = null;
  private memSentAt = 0;
  private counters: { oom: number; pids: number } | null = null;
  private startPromise: Promise<void> | null = null;
  private diagTimer: NodeJS.Timeout | null = null;
  private diagRunning: Promise<void> | null = null;

  constructor(m: Workspaces, meta: Meta) {
    this.m = m;
    this.id = meta.id;
    this.meta = meta;
    this.dir = path.join(m.root, meta.id);
    this.files = new HostFs(path.join(this.dir, "files"));
    this.original = new HostFs(path.join(this.dir, "original"));
    this.watcher = new Watcher(
      this.files,
      (events) => this.hub.emitFs(events),
      (entry) => this.describe(entry)
    );
    for (const [name, def] of Object.entries(meta.config.tasks)) this.tasks.set(name, this.idleTask(name, def));
  }

  private idleTask(name: string, def: TaskDef) {
    return {
      name,
      label: def.label ?? name,
      cmd: def.cmd,
      state: "idle" as const,
      code: null,
      signal: null,
      startedAt: null,
      sid: null,
      sentKill: false,
      launchedAt: 0,
    };
  }

  get running(): boolean {
    return this.status === "running";
  }

  get visible(): boolean {
    return Date.now() - this.lastVisible < VISIBLE_MS;
  }

  get limits(): WorkspaceLimits {
    return workspaceLimits(this.meta.course, this.meta.config.limits);
  }

  touch() {
    this.lastActive = Date.now();
  }

  private emit(message: EventMessage) {
    this.hub.emit(message);
  }

  private setStatus(status: Status, detail: string | null = null) {
    this.status = status;
    this.detail = detail;
    this.emit(this.statusMessage());
  }

  statusMessage(): EventMessage {
    return { t: "status", status: this.status, detail: this.detail, mem: this.running ? this.mem : null };
  }

  saveMeta() {
    this.meta.lastActiveAt = this.lastActive;
    const file = path.join(this.dir, "meta.json");
    const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.meta), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  // Files and their states

  /** A file's state against the manifest, hashing only when size or time moved. */
  private fileState(entry: Entry): FileState {
    const orig = this.meta.manifest[entry.path];
    if (!orig) return "new";
    if (orig.type !== (entry.type === "mount" ? "dir" : entry.type)) return "modified";
    if (entry.type === "symlink") return orig.target === entry.target ? "same" : "modified";
    if (entry.type !== "file") return (orig.mode & 0o777) === (entry.mode & 0o777) ? "same" : "modified";
    if ((orig.mode & 0o111) !== (entry.mode & 0o111)) return "modified";
    if (orig.size !== entry.size) return "modified";
    return this.hashOf(entry) === orig.sha256 ? "same" : "modified";
  }

  private hashOf(entry: Entry): string | null {
    const cached = this.hashes.get(entry.path);
    if (cached && cached.size === entry.size && cached.mtimeMs === entry.mtimeMs) return cached.sha256;
    const hash = this.files.hashFile(entry.path);
    if (hash) this.hashes.set(entry.path, { size: entry.size, mtimeMs: entry.mtimeMs, sha256: hash });
    return hash;
  }

  /** What an fs event says about a path: its tree row with its state. */
  private describe(entry: Entry): Record<string, unknown> {
    const state = entry.type === "dir" ? (this.meta.manifest[entry.path] ? "same" : "new") : this.fileState(entry);
    return { ...entry, state };
  }

  /** Every path (heavy folders listed, not opened), from the Mac while stopped and from inside while running. */
  private async listAll(): Promise<{ entries: Entry[]; more: Record<string, number> }> {
    if (this.running && this.cfs) {
      try {
        return await this.cfs.list("", 64);
      } catch (err) {
        this.m.log.warn("workspace.list_inside_failed", { id: this.id, error: (err as Error).message });
      }
    }
    return this.files.list("", 64);
  }

  /** The whole tree with states, the removed paths, and the changes. */
  async snapshotTree(): Promise<{ entries: StatedEntry[]; removed: string[]; more: Record<string, number>; changes: Changes }> {
    const { entries, more } = await this.listAll();
    const stated: StatedEntry[] = [];
    const present = new Set<string>();
    const changes: Changes = { added: [], modified: [], removed: [] };
    for (const e of entries) {
      present.add(e.path);
      if (e.type === "dir" || e.type === "mount") {
        stated.push({ ...e, state: this.meta.manifest[e.path] || e.type === "mount" ? "same" : "new" });
        continue;
      }
      const state = this.fileState(e);
      stated.push({ ...e, state });
      if (keptAside(e.path)) continue;
      if (state === "new") changes.added.push(e.path);
      else if (state === "modified") changes.modified.push(e.path);
    }
    const removed: string[] = [];
    for (const p of Object.keys(this.meta.manifest)) {
      if (present.has(p)) continue;
      const parent = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
      // Only the top of a removed subtree: its children go with it.
      if (parent && !present.has(parent) && this.meta.manifest[parent]) continue;
      removed.push(p);
    }
    for (const [p, orig] of Object.entries(this.meta.manifest)) {
      if (!present.has(p) && orig.type !== "dir") changes.removed.push(p);
    }
    // A folder is modified when anything under it differs.
    const dirty = new Set<string>();
    const mark = (p: string) => {
      let at = p;
      while (at.includes("/")) {
        at = at.slice(0, at.lastIndexOf("/"));
        dirty.add(at);
      }
    };
    for (const p of [...changes.added, ...changes.modified, ...changes.removed]) mark(p);
    for (const e of stated) if ((e.type === "dir" || e.type === "mount") && e.state === "same" && dirty.has(e.path)) e.state = "modified";
    return { entries: stated, removed, more, changes };
  }

  async tree(rel: string, depth: number) {
    if (rel) checkRel(rel);
    const insideHeavy = rel.split("/").some((part) => HEAVY.has(part));
    if (insideHeavy) {
      const { entries, more } = this.running && this.cfs ? await this.cfs.list(rel, depth) : this.files.list(rel, depth);
      return { path: rel, entries: entries.map((e) => ({ ...e, state: "same" as FileState })), removed: [], more };
    }
    const all = await this.snapshotTree();
    const prefix = rel ? `${rel}/` : "";
    const levels = (p: string) => p.slice(prefix.length).split("/").length;
    const within = (p: string) => (rel ? p.startsWith(prefix) : true) && levels(p) <= depth;
    if (rel) {
      const self = all.entries.find((e) => e.path === rel);
      if (!self) {
        // Not listed: missing, or below a link (which the Mac's lstat refuses as outside).
        this.files.lstat(rel);
        throw new PathError("not_found", `${rel} doesn't exist.`);
      }
      if (self.type === "symlink") throw new PathError("outside", "This path is a symbolic link, so the runner won't follow it.");
      if (self.type !== "dir" && self.type !== "mount") throw new PathError("not_a_file", `${rel} isn't a folder.`);
    }
    return {
      path: rel,
      entries: all.entries.filter((e) => within(e.path)),
      removed: all.removed.filter((p) => (rel ? p.startsWith(prefix) : true)),
      more: Object.fromEntries(Object.entries(all.more).filter(([p]) => p === rel || (rel ? p.startsWith(prefix) : true))),
    };
  }

  async changes(): Promise<Changes> {
    return (await this.snapshotTree()).changes;
  }

  readFile(rel: string) {
    const r = this.files.readFile(checkRel(rel), READ_CAP);
    const etag = sha256(r.data);
    this.hashes.set(rel, { size: r.size, mtimeMs: r.mtimeMs, sha256: etag });
    return { ...r, etag, text: isText(r.data) };
  }

  readOriginal(rel: string) {
    const orig = this.meta.manifest[checkRel(rel)];
    if (!orig || orig.type !== "file") throw new PathError("not_found", `${rel} isn't in the original.`);
    const r = this.original.readFile(rel, READ_CAP);
    return { ...r, etag: sha256(r.data), text: isText(r.data) };
  }

  /** Saves a file: inside the container while it runs, on the Mac while it's stopped. */
  async writeFile(rel: string, data: Buffer, { ifMatch, ifNoneMatch, cap = WRITE_CAP }: { ifMatch?: string; ifNoneMatch?: boolean; cap?: number } = {}) {
    checkRel(rel);
    if (data.length > cap) throw new HttpError(413, "too_large", `A file can be at most ${cap / MiB} MB here.`);
    return this.lock.run(async () => {
      const st = this.files.lstat(rel);
      if (st && st.isDirectory()) throw new PathError("is_dir", `${rel} is a folder.`);
      if (st && !st.isFile()) throw new PathError("not_a_file", `${rel} isn't a regular file.`);
      if (ifNoneMatch && st) throw new HttpError(409, "conflict", `${rel} already exists.`, { etag: this.files.hashFile(rel) });
      if (ifMatch !== undefined) {
        const current = st ? this.files.hashFile(rel) : null;
        if (current !== ifMatch) throw new HttpError(409, "conflict", `${rel} changed on disk since it was opened.`, { etag: current });
      }
      if (this.running && this.cfs) await this.cfs.writeFile(rel, data);
      else this.files.writeFile(rel, data);
      this.watcher.touch(rel);
      this.saved();
      return { etag: sha256(data) };
    });
  }

  /** The fs operations of POST …/fs. */
  async fsOp(op: { op: string; path?: string; to?: string; mode?: number; undo?: string }): Promise<{ undo?: string }> {
    return this.lock.run(async () => {
      const inside = this.running && this.cfs;
      switch (op.op) {
        case "mkdir":
          if (inside) await this.cfs!.mkdir(op.path!);
          else this.files.mkdir(op.path!);
          break;
        case "rename":
          if (inside) await this.cfs!.rename(op.path!, op.to!);
          else this.files.rename(op.path!, op.to!);
          break;
        case "copy":
          if (inside) await this.cfs!.copy(op.path!, op.to!);
          else await this.files.copy(op.path!, op.to!);
          break;
        case "chmod":
          if (inside) await this.cfs!.chmod(op.path!, op.mode!);
          else this.files.chmod(op.path!, op.mode!);
          break;
        case "delete": {
          if (!this.files.lstat(op.path!)) throw new PathError("not_found", `${op.path} doesn't exist.`);
          const undo = this.trash(op.path!);
          if (inside) await this.cfs!.remove(op.path!);
          else this.files.remove(op.path!);
          for (const p of [op.path!, op.to].filter(Boolean)) this.watcher.touch(p as string);
          this.saved();
          return undo ? { undo } : {};
        }
        case "restore":
          await this.untrash(op.undo!);
          return {};
      }
      for (const p of [op.path, op.to]) if (p) this.watcher.touch(p);
      this.saved();
      return {};
    });
  }

  /** Keeps a deleted entry for 24 hours (at most 50 MB), and returns its undo token. */
  private trash(rel: string): string | null {
    let entries: TarEntry[];
    try {
      entries = this.files.pack(rel, TRASH_CAP, (p) => keptAside(p) && p !== rel);
    } catch (err) {
      if (err instanceof PathError && err.code === "too_large") return null;
      throw err;
    }
    const token = `${Date.now().toString(36)}${randomBytes(5).toString("hex")}`;
    const dir = path.join(this.dir, "trash");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(dir, `${token}.tar`), packTar(entries), { mode: 0o600 });
    fs.writeFileSync(path.join(dir, `${token}.json`), JSON.stringify({ path: rel, createdAt: Date.now() }), { mode: 0o600 });
    return token;
  }

  private async untrash(token: string) {
    const dir = path.join(this.dir, "trash");
    let info: { path: string };
    let archive: Buffer;
    try {
      info = JSON.parse(fs.readFileSync(path.join(dir, `${token}.json`), "utf8"));
      archive = fs.readFileSync(path.join(dir, `${token}.tar`));
    } catch {
      throw new PathError("not_found", "That delete can't be undone any more.");
    }
    if (this.files.lstat(info.path)) throw new PathError("exists", `${info.path} exists again, so the old one wasn't put back.`);
    await this.applyEntries(unpackTar(archive), archive);
    fs.rmSync(path.join(dir, `${token}.json`), { force: true });
    fs.rmSync(path.join(dir, `${token}.tar`), { force: true });
    this.watcher.touch(info.path);
  }

  /** Writes tar entries into the files: by tar inside the container, or safely on the Mac. */
  private async applyEntries(entries: TarEntry[], archive?: Buffer) {
    if (this.running && this.cfs) {
      await this.cfs.extract(archive ?? packTar(entries));
      return;
    }
    for (const e of entries) {
      if (e.type === "dir") {
        this.files.mkdir(e.path);
        if (e.mode !== undefined) this.files.chmod(e.path, e.mode);
      } else if (e.type === "file") {
        this.files.writeFile(e.path, e.data ?? Buffer.alloc(0), e.mode);
      } else if (e.type === "symlink") {
        this.files.symlink(e.path, e.target ?? "");
      }
    }
  }

  // Diagnostics

  /** A save: the template's diagnostics run a second after the last one, while the workspace runs. */
  saved() {
    if (!this.running || !diagSpecs(this.meta.config.diagnostics).length) return;
    if (this.diagTimer) clearTimeout(this.diagTimer);
    this.diagTimer = setTimeout(() => {
      this.diagTimer = null;
      void this.diagnose();
    }, 1_000);
    this.diagTimer.unref();
  }

  /** Runs every save-time diagnostic once, one run at a time, and sends what each found. */
  async diagnose(): Promise<void> {
    if (this.diagRunning) {
      await this.diagRunning;
      return this.saved();
    }
    const container = this.container;
    if (!this.running || !container) return;
    this.diagRunning = (async () => {
      for (const spec of diagSpecs(this.meta.config.diagnostics)) {
        try {
          const items = await runDiagnostics(container, spec);
          if (this.running) this.emit({ t: "diag", source: spec.parser, items });
        } catch (err) {
          this.m.log.warn("workspace.diagnostics_failed", { id: this.id, error: (err as Error).message });
        }
      }
    })().finally(() => {
      this.diagRunning = null;
    });
    await this.diagRunning;
  }

  // Reset and snapshots

  /**
   * Makes the files under `scope` match a target tree (the original, or a
   * snapshot): removes what the target doesn't have, and puts back what
   * differs. Heavy folders and .git are left alone.
   */
  private async converge(
    target: HostFs,
    targetManifest: Manifest,
    scope: { kind: "all" } | { kind: "dir" | "file"; path: string },
    dryRun: boolean
  ): Promise<{ restored: string[]; removed: string[] }> {
    const inScope = (p: string) =>
      scope.kind === "all" ? true : scope.kind === "file" ? p === scope.path : p === scope.path || p.startsWith(`${scope.path}/`);
    const { entries } = await this.listAll();
    const current = new Map(entries.map((e) => [e.path, e]));
    const remove: string[] = [];
    const restore: string[] = [];
    for (const e of entries) {
      if (!inScope(e.path) || keptAside(e.path) || e.type === "mount") continue;
      const want = targetManifest[e.path];
      const parent = e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "";
      if (!want) {
        // Only the top of what goes: a removed folder takes its children.
        if (!parent || targetManifest[parent] || !inScope(parent) || keptAside(parent)) remove.push(e.path);
        continue;
      }
      const type = e.type;
      if (want.type !== type) {
        remove.push(e.path);
        restore.push(e.path);
      } else if (type === "file") {
        if (want.size !== e.size || (want.mode & 0o777) !== (e.mode & 0o777) || this.hashOf(e) !== want.sha256) restore.push(e.path);
      } else if (type === "symlink") {
        if (want.target !== e.target) {
          remove.push(e.path);
          restore.push(e.path);
        }
      } else if (type === "dir" && (want.mode & 0o777) !== (e.mode & 0o777)) {
        restore.push(e.path);
      }
    }
    for (const p of Object.keys(targetManifest)) {
      if (inScope(p) && !current.has(p) && !keptAside(p)) restore.push(p);
    }
    restore.sort();
    if (dryRun) return { restored: restore.filter((p) => targetManifest[p].type !== "dir"), removed: remove };

    // Remove first (a folder in the way of a file, a link in place of a folder).
    if (remove.length) {
      if (this.running && this.cfs) await this.cfs.remove(...remove);
      else for (const p of remove) if (this.files.lstat(p)) this.files.remove(p);
    }
    const tarEntries: TarEntry[] = [];
    for (const p of restore) {
      const want = targetManifest[p];
      if (want.type === "dir") tarEntries.push({ path: p, type: "dir", mode: want.mode });
      else if (want.type === "symlink") tarEntries.push({ path: p, type: "symlink", target: want.target ?? "" });
      else {
        const { data, mode } = target.readFile(p, 512 * MiB);
        tarEntries.push({ path: p, type: "file", data, mode });
      }
    }
    // Parents first, so every file has its folder.
    tarEntries.sort((a, b) => (a.path < b.path ? -1 : 1));
    if (tarEntries.length) {
      if (this.running && this.cfs) await this.cfs.extract(packTar(tarEntries));
      else {
        for (const e of tarEntries) {
          if (e.type === "dir") {
            this.files.mkdir(e.path);
            this.files.chmod(e.path, e.mode ?? 0o755);
          } else if (e.type === "symlink") {
            if (this.files.lstat(e.path)) this.files.remove(e.path);
            this.files.symlink(e.path, e.target ?? "");
          } else this.files.writeFile(e.path, e.data!, e.mode);
        }
      }
    }
    for (const p of [...remove, ...restore]) this.watcher.touch(p);
    if (remove.length || restore.length) this.saved();
    return { restored: restore.filter((p) => targetManifest[p].type !== "dir"), removed: remove };
  }

  /**
   * POST …/reset. `db` puts the workspace's databases back to their
   * template, and `everything` does that and resets every file. Either one
   * restarts the running tasks afterwards when the template says
   * restartOnReset, since they held connections to what was replaced.
   */
  async reset(scope: "file" | "dir" | "all" | "db" | "everything", rel: string | undefined, dryRun: boolean) {
    const databases = this.m.databases?.info(this.id) ? this.databaseNames() : null;
    if (scope === "db") {
      if (!databases) throw new HttpError(409, "no_database", "This workspace has no database yet. Run it once to create it.");
      if (dryRun) return { restored: [], removed: [], databases };
      return { restored: [], removed: [], ...(await this.resetDatabases()) };
    }
    const result = await this.lock.run(async () => {
      let snapshot: string | undefined;
      if (!dryRun && (scope === "all" || scope === "everything")) snapshot = (await this.snapshotLocked(null, true)).id;
      const target = scope === "file" || scope === "dir" ? { kind: scope, path: checkRel(rel!) } : ({ kind: "all" } as const);
      const result = await this.converge(this.original, this.meta.manifest, target, dryRun);
      return snapshot ? { ...result, snapshot } : result;
    });
    if (scope !== "everything" || !databases) return result;
    if (dryRun) return { ...result, databases };
    return { ...result, ...(await this.resetDatabases()) };
  }

  /** The databases a db reset puts back: PostgreSQL's by name, MongoDB's as mongo:<name>. */
  private databaseNames(): string[] {
    const info = this.m.databases?.info(this.id);
    return [...(info?.postgres?.databases ?? []), ...(info?.mongo?.databases ?? []).map((d) => `mongo:${d}`)];
  }

  private async resetDatabases(): Promise<{ databases: string[]; ms: number }> {
    let r: { databases: string[]; ms: number };
    try {
      r = await this.m.databases!.resetWorkspace(this.id, "all");
    } catch (err) {
      throw dbHttpError(err);
    }
    if (this.meta.config.restartOnReset && this.running) {
      for (const t of [...this.tasks.values()]) {
        if (t.state !== "running" && t.state !== "starting") continue;
        await this.restartTask(t.name).catch((err: Error) => this.m.log.warn("workspace.restart_after_reset_failed", { id: this.id, task: t.name, error: err.message }));
      }
    }
    return r;
  }

  listSnapshots(): SnapshotInfo[] {
    return [...this.meta.snapshots].sort((a, b) => b.createdAt - a.createdAt);
  }

  async snapshot(label: string | null): Promise<SnapshotInfo> {
    return this.lock.run(() => this.snapshotLocked(label, false));
  }

  /** Clones files/ into snapshots/<id>/, pausing the container so nothing changes meanwhile. */
  private async snapshotLocked(label: string | null, auto: boolean): Promise<SnapshotInfo> {
    const info: SnapshotInfo = { id: `s${Date.now().toString(36)}${randomBytes(3).toString("hex")}`, label, auto, createdAt: Date.now() };
    const dest = path.join(this.dir, "snapshots", info.id);
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
    const paused = this.running && this.container ? await this.container.pause().then(() => true, () => false) : false;
    try {
      fs.mkdirSync(dest, { mode: 0o700 });
      // Everything but .git and the dependency and build folders, which resets leave alone too.
      for (const name of fs.readdirSync(this.files.root)) {
        if (keptAside(name)) continue;
        await cloneTree(path.join(this.files.root, name), path.join(dest, name));
      }
    } finally {
      if (paused) await this.container!.unpause().catch(() => {});
    }
    this.meta.snapshots.push(info);
    // The last 5 automatic and 20 named are kept.
    for (const auto of [true, false]) {
      const keep = auto ? AUTO_SNAPSHOTS : NAMED_SNAPSHOTS;
      const list = this.meta.snapshots.filter((s) => s.auto === auto).sort((a, b) => b.createdAt - a.createdAt);
      for (const old of list.slice(keep)) this.dropSnapshot(old.id);
    }
    this.saveMeta();
    return info;
  }

  private dropSnapshot(id: string) {
    this.meta.snapshots = this.meta.snapshots.filter((s) => s.id !== id);
    fs.rmSync(path.join(this.dir, "snapshots", id), { recursive: true, force: true });
  }

  async deleteSnapshot(id: string) {
    return this.lock.run(() => {
      if (!this.meta.snapshots.some((s) => s.id === id)) throw new PathError("not_found", "No such save point.");
      this.dropSnapshot(id);
      this.saveMeta();
    });
  }

  async restoreSnapshot(id: string) {
    return this.lock.run(async () => {
      if (!this.meta.snapshots.some((s) => s.id === id)) throw new PathError("not_found", "No such save point.");
      const dir = path.join(this.dir, "snapshots", id);
      const target = new HostFs(dir);
      const manifest = buildManifest(dir, keptAside);
      const before = await this.snapshotLocked(null, true);
      const result = await this.converge(target, manifest, { kind: "all" }, false);
      return { ...result, snapshot: before.id };
    });
  }

  // The container

  get containerName(): string {
    return this.m.containerName(this.id);
  }

  /** Starts the container (README "start"): resolves once running, or with queued when it waits for memory. */
  async start(): Promise<{ status: Status; queued?: boolean; detail?: string | null }> {
    this.touch();
    if (this.running) return { status: this.status };
    if (!this.startPromise) {
      this.startPromise = this.startNow().finally(() => {
        this.startPromise = null;
      });
      this.startPromise.catch(() => {});
    }
    const queued = await Promise.race([this.startPromise.then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), 50))]);
    if (queued && this.detail?.startsWith("Waiting for memory")) return { status: "starting", queued: true, detail: this.detail };
    await this.startPromise;
    return { status: this.status };
  }

  /** Waits until the workspace runs, starting it when needed. Throws when it can't run now. */
  async ensureRunning(): Promise<void> {
    if (this.running) return;
    const result = await this.start();
    if (result.queued) throw new HttpError(503, "waiting_for_memory", result.detail ?? "Waiting for memory.");
    if (!this.running) throw new HttpError(409, "not_running", this.detail ?? "The workspace isn't running.");
  }

  private async startNow(): Promise<void> {
    await this.m.needDocker();
    const config = this.meta.config;
    if (config.storage === "volume") throw new HttpError(501, "not_implemented", "Volume storage (the Bash course's workspaces) isn't available yet.");
    const imageName = runnableImage(config.image);
    if (!imageName || !isImageName(imageName)) {
      throw new HttpError(503, "image_missing", `The ${this.meta.course} sandbox isn't available yet. It arrives with its course.`);
    }
    if (this.m.images.state(imageName) !== "ready") await this.m.images.refresh();
    if (this.m.images.state(imageName) !== "ready") {
      throw new HttpError(503, "image_missing", `The ${this.meta.course} sandbox isn't installed yet. In a terminal, run ${addCourse(this.meta.course)}, then press Run again.`);
    }
    const limits = this.limits;
    this.setStatus("starting", null);
    // Dependencies and databases come first (§4.2.3): a fill or a template
    // database's build can take a while the first time, and holds neither
    // the lock nor memory meanwhile.
    let prepared: { mounts: VolumeMount[]; db: Attachment | null };
    try {
      const mounts = await this.dependencies();
      prepared = { mounts, db: await this.saying("Setting up the database (the first time builds it)…", this.attachDatabases()) };
    } catch (err) {
      const known = err instanceof HttpError || err instanceof DbError || err instanceof PgError || err instanceof MongoError;
      const failure = known ? dbHttpError(err) : new HttpError(500, "internal", `The workspace couldn't start: ${(err as Error).message}`);
      this.setStatus("error", failure.message);
      this.m.log.warn("workspace.prepare_failed", { id: this.id, error: failure.message });
      if (isDockerDown(err)) throw new HttpError(503, "docker_unavailable", "Docker stopped. Start Docker to run this.");
      throw failure;
    }
    if (this.detail) this.setStatus("starting", null);
    // Memory first, outside the lock: a start may wait here for a while.
    try {
      await this.m.capacity.admit(this.id, limits.memoryBytes, {
        candidates: () => this.m.lruCandidates(this.id),
        stop: (id) => this.m.stopForMemory(id),
        waiting: (detail) => this.setStatus("starting", detail),
      });
    } catch (err) {
      if (!(err instanceof Cancelled)) throw err;
      this.setStatus(this.meta.startedAt ? "stopped" : "files", null);
      throw new HttpError(409, "cancelled", "The start was called off while it waited for memory.");
    }
    if (this.detail) this.setStatus("starting", null);
    await this.lock.run(async () => {
      const undo: (() => Promise<void> | void)[] = [() => this.m.capacity.release(this.id)];
      try {
        const leases = await this.takeLeases();
        undo.push(() => this.m.leases.unpin(this.meta.scope));
        const container = await this.ensureContainer(imageName, limits, leases, prepared);
        this.container = container;
        await container.start().catch((err: { statusCode?: number }) => {
          if (err.statusCode !== 304) throw err;
        });
        undo.push(async () => {
          await container.stop({ t: 1 }).catch(() => {});
        });
        this.cfs = new ContainerFs(container);
        if (!this.meta.gitInit) {
          await this.gitInit(container);
          this.meta.gitInit = true;
        }
        this.meta.startedAt = Date.now();
        this.meta.stoppedAt = null;
        this.saveMeta();
        this.status = "running";
        await this.openDeclaredBridges(leases);
        this.startPolling();
        this.setStatus("running", null);
        this.saved();
        this.m.log.info("workspace.started", { id: this.id, image: imageName });
      } catch (err) {
        for (const step of undo.reverse()) await step();
        this.cfs = null;
        this.closeBridges();
        const message = err instanceof HttpError ? err.message : `The workspace couldn't start: ${(err as Error).message}`;
        this.setStatus("error", message);
        this.m.log.warn("workspace.start_failed", { id: this.id, error: (err as Error).message });
        if (err instanceof PortsExhausted) throw new HttpError(503, "ports_exhausted", err.message);
        if (isDockerDown(err)) throw new HttpError(503, "docker_unavailable", "Docker stopped. Start Docker to run this.");
        throw err instanceof HttpError ? err : new HttpError(500, "internal", message);
      }
    });
  }

  /** Leases one port per declared port variable (PORT when none is declared). */
  private async takeLeases(): Promise<Map<string, { port: number; note: string | null; clearSiteData: boolean }>> {
    const decls = this.meta.config.ports.length ? this.meta.config.ports : [{ env: "PORT" }];
    const out = new Map<string, { port: number; note: string | null; clearSiteData: boolean }>();
    for (const decl of decls) {
      const before = this.m.leases.get(this.meta.scope, decl.env)?.port;
      const lease = await this.m.leases.lease(this.meta.scope, decl.env);
      const note = before && before !== lease.port ? `Port ${before} was busy, so this workspace now uses ${lease.port}.` : null;
      out.set(decl.env, { port: lease.port, note, clearSiteData: Boolean(lease.clearSiteData) });
    }
    return out;
  }

  /**
   * The container, reused while everything it was made with still matches
   * (a hash of its options is its hu.hash label), else made anew: a new
   * port lease, database, lockfile, or profile recreates it in about 100 ms.
   */
  private async ensureContainer(
    imageName: string,
    limits: WorkspaceLimits,
    leases: Map<string, { port: number }>,
    prepared: { mounts: VolumeMount[]; db: Attachment | null }
  ): Promise<Docker.Container> {
    const docker = this.m.docker;
    const image = this.m.images.tag(imageName as never);
    const env = this.containerEnv(leases, prepared.db?.env);
    const network = prepared.db?.network ?? "none";
    const builds: VolumeMount[] = [];
    for (const b of this.meta.config.build) builds.push({ source: await this.m.volume(this.id, `build-${b.toLowerCase().replace(/[^a-z0-9]/g, "")}`), target: `/workspace/${b}` });
    const mounts = [...builds, ...prepared.mounts];
    const home = await this.m.volume(this.id, "home");
    const options = standardProfile({
      name: this.containerName,
      image,
      labels: labelsFor(this.m.owner, "workspace", { [LABEL.workspace]: this.id, [LABEL.home]: this.m.home }),
      env,
      filesDir: this.files.root,
      homeVolume: home,
      limits: { memoryBytes: limits.memoryBytes, cpus: limits.cpus, pids: limits.pids, fsizeBytes: limits.fsizeBytes, tmpBytes: limits.tmpBytes },
      network,
      mounts,
    });
    // The network by its id too: one made again since (a database server that came back) means a new container.
    const networkId = network === "none" ? network : ((await docker.getNetwork(network).inspect().catch(() => null)) as { Id?: string } | null)?.Id ?? network;
    const hash = sha256(JSON.stringify({ ...options, Labels: undefined, Env: [...env].sort(), networkId })).slice(0, 12);
    options.Labels = { ...options.Labels, [LABEL.hash]: hash };
    const existing = docker.getContainer(this.containerName);
    const info = await existing.inspect().catch(() => null);
    if (info) {
      if (info.Config.Image === image && info.Config.Labels?.[LABEL.hash] === hash) return existing;
      await existing.remove({ force: true }).catch(() => {});
    }
    for (const b of builds) await this.m.prime(b.source, image);
    try {
      return await docker.createContainer(options);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) throw new HttpError(503, "image_missing", `The image ${image} isn't built yet.`);
      throw err;
    }
  }

  /** The container's variables, with HOME, HOST, and the leased ports. */
  private containerEnv(leases: Map<string, { port: number }>, db: string[] = []): string[] {
    const ports = Object.fromEntries([...leases].map(([name, lease]) => [name, String(lease.port)]));
    const env = this.envFor(db, { HOME: "/home/learner", HOST: "0.0.0.0", ...ports });
    env.TZ ??= "UTC";
    env.LANG ??= "C.UTF-8";
    return envLines(env);
  }

  /**
   * The variables a container of this workspace gets: the stack's
   * (UV_PROJECT_ENVIRONMENT), the template's, its databases' (`db`, the
   * DATABASE_URL lines), then `extra` (HOME, HOST, the ports), which always
   * win. A template's value may name the workspace's own variables, like
   * GOOSE_DBSTRING=${DATABASE_URL}, and gets their values.
   */
  envFor(db: string[], extra: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = { ...this.stackEnv(), ...this.meta.config.env };
    for (const line of db) env[line.slice(0, line.indexOf("="))] = line.slice(line.indexOf("=") + 1);
    Object.assign(env, extra);
    for (const [name, value] of Object.entries(this.meta.config.env)) {
      if (env[name] === value && value.includes("${")) env[name] = expand(value, env);
    }
    return env;
  }

  /** The variables the course's stack adds to its image's own (runner/stacks.ts). */
  stackEnv(): Record<string, string> {
    return isStack(this.meta.course) ? { ...stack(this.meta.course).env } : {};
  }

  /** The image this workspace's containers run (a stand-in until its own is built). */
  get imageName(): string | null {
    return runnableImage(this.meta.config.image);
  }

  // Dependencies and databases

  /** The workspace's dependency volume (deps.ts), or null when its template has none. */
  depsPlan(): DepsPlan | null {
    return this.m.deps.plan(this.meta.course, this.meta.config.deps as DepsConfig | null, this.meta.manifest, {
      volume: this.m.volumeName(this.id, "deps"),
      labels: this.m.volumeLabels(this.id),
    });
  }

  /**
   * The volumes a container of this workspace mounts for its dependencies
   * and its stack's caches (§4.4), filling the dependency volume first when
   * it's new: the template's original files fill a shared one, the
   * workspace's own files its own. `workdir` is where the container keeps
   * the files (a check's /work), and `readOnly` mounts even an own volume
   * read-only, so a check or a build never changes it.
   */
  async dependencies(workdir = "/workspace", readOnly = false): Promise<VolumeMount[]> {
    const plan = this.depsPlan();
    if (plan) await this.saying("Installing the dependencies (once for this lockfile)…", this.m.deps.ensure(plan, plan.own ? this.files : this.original, envLines(this.stackEnv())));
    const mounts = await this.m.deps.mounts(this.meta.course, plan, workdir);
    return readOnly ? mounts.map((m) => (m.source === plan?.volume ? { ...m, readOnly: true } : m)) : mounts;
  }

  /** Waits for `work`, and when it takes a moment during a start, the status says why. */
  private async saying<T>(detail: string, work: Promise<T>): Promise<T> {
    const quick = await Promise.race([work.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 300).unref())]);
    if (!quick && this.status === "starting") this.setStatus("starting", detail);
    return work;
  }

  /** The template's original files, as db/spec.ts reads them. */
  private templateFiles(): TemplateFiles {
    return {
      read: (rel) => (this.meta.manifest[rel]?.type === "file" ? this.original.readFile(rel, 64 * MiB).data : null),
      list: (dir) => {
        const prefix = `${dir}/`;
        return Object.entries(this.meta.manifest)
          .filter(([p, e]) => e.type === "file" && p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
          .map(([p]) => p.slice(prefix.length));
      },
    };
  }

  /** Which template database this workspace clones: its template, its checkpoint, and for a build, its files' hash. */
  private templateRef(built: boolean): TemplateRef {
    const checkpoint = [...this.meta.layers].reverse().find((l) => l.startsWith("checkpoints/"))?.slice("checkpoints/".length);
    return {
      course: this.meta.course,
      template: this.meta.template.split("/")[1],
      ...(checkpoint ? { checkpoint } : {}),
      ...(built ? { hash: this.meta.templateHash } : {}),
    };
  }

  /**
   * Gives the workspace its databases when its template has `services`
   * (README "What a workspace gets"): the role and databases, made the first
   * time from the template database (built once per hash, by the template's
   * own command when it names one), and the variables and network the
   * container needs to reach them.
   */
  async attachDatabases(): Promise<Attachment | null> {
    const services = this.meta.config.services;
    const databases = this.m.databases;
    if (!databases || !services || !Object.keys(services).length) return null;
    let parsed: ReturnType<typeof serviceSpec>;
    try {
      parsed = serviceSpec(services, this.templateFiles());
    } catch (err) {
      if (err instanceof SpecError) throw new HttpError(500, "template_failed", err.message);
      throw err;
    }
    const { spec, build, mongoBuild } = parsed;
    if (!spec.postgres && !spec.mongo) return null;
    const builder = (cmd: string[]): Builder => (target) => this.buildDatabase(cmd, target);
    const attachment = await databases.attach(this.id, this.templateRef(Boolean(build || mongoBuild)), spec, {
      ...(build ? { postgres: builder(build) } : {}),
      ...(mongoBuild ? { mongo: builder(mongoBuild) } : {}),
    });
    return { env: this.dbEnv(attachment.env), network: attachment.network };
  }

  /** Database variables as the stack's code reads them: SQLAlchemy wants postgresql+psycopg:// (stacks.ts). */
  dbEnv(lines: string[]): string[] {
    const scheme = isStack(this.meta.course) ? stack(this.meta.course).databaseUrl?.scheme : undefined;
    if (!scheme) return lines;
    return lines.map((l) => (/^(TEST_)?DATABASE_URL=postgres:\/\//.test(l) ? l.replace("=postgres://", `=${scheme}://`) : l));
  }

  /**
   * Builds a template database with the template's own command
   * (services.postgres.build, `npm run db:build`): a job from the course's
   * image with the template's original files in /workspace, its
   * dependencies, its variables, and the database's, on the database
   * network as the template's builder (never a superuser). The end of its
   * output comes back when it fails.
   */
  private async buildDatabase(cmd: string[], target: { env: string[]; network: string; database: string }): Promise<void> {
    const imageName = this.imageName;
    if (!imageName || !isImageName(imageName)) throw new DbError(503, "image_missing", `The ${this.meta.course} sandbox isn't available yet.`);
    const mounts = await this.dependencies("/workspace", true);
    const java = imageName === "java";
    const limits: JobLimits = {
      // The course's check slot, at most 1.5 GiB (2 GiB for Java, whose build compiles and starts the app).
      memoryBytes: Math.min(this.limits.checkBytes, (java ? 2048 : 1536) * MiB),
      cpus: Math.max(1, this.limits.cpus),
      pids: 512,
      workBytes: 512 * MiB,
      fsizeBytes: 512 * MiB,
      compileMs: 0,
      runMs: 5 * 60_000,
      outputBytes: MiB,
    };
    const env = envLines(this.envFor(this.dbEnv(target.env), { HOME: "/home/learner", TZ: "UTC", LANG: "C.UTF-8", HOST: "0.0.0.0", CI: "1" }));
    const entries = this.original.pack("", 256 * MiB, (p) => keptAside(p) || this.meta.config.build.some((b) => p === b || p.startsWith(`${b}/`)));
    const started = Date.now();
    const release = await this.m.capacity.admitCheck(limits.memoryBytes);
    const run = async () => {
      const job = await Job.start(
        this.m.docker,
        this.m.owner,
        {
          image: this.m.images.tag(imageName),
          recipe: "db-build",
          workDir: "/workspace",
          hostname: "workspace",
          env,
          limits,
          deadlineMs: limits.runMs + 60_000,
          network: target.network,
          mounts,
          tmpExec: true,
          home: "/home/learner",
        },
        this.m.log
      );
      try {
        await job.load("/workspace", entries);
        const r = await job.step(cmd, { workDir: "/workspace", env, timeoutMs: limits.runMs, maxBytes: limits.outputBytes });
        if (r.code !== 0) {
          const tail = r.output.trim().split("\n").slice(-15).join("\n");
          this.m.log.warn("workspace.db_build_failed", { id: this.id, database: target.database, code: r.code, status: r.status, output: tail.slice(-2000) });
          throw new DbError(500, "template_failed", `The template's database didn't build (${cmd.join(" ")}): ${tail || r.message || "no output"}`);
        }
      } finally {
        await job.dispose();
      }
    };
    try {
      await (this.m.pool ? this.m.pool.run(run) : run());
    } finally {
      release();
    }
    this.m.log.info("workspace.db_built", { id: this.id, database: target.database, ms: Date.now() - started });
  }

  /**
   * A database event (db/index.ts) goes to the IDE: a reset, a size warning.
   * When the size watch closed a database, the tasks holding it stop.
   */
  dbEvent(event: DbEvent) {
    this.emit(event as EventMessage);
    if (event.t !== "limit" || !this.running || !this.m.databases?.info(this.id)?.blocked.length) return;
    for (const t of this.tasks.values()) {
      if (t.state === "running" || t.state === "starting") void this.stopTask(t.name).catch(() => {});
    }
  }

  /** The first start's commit, so git status and git diff work as teaching tools. */
  private async gitInit(container: Docker.Container) {
    const script = [
      "cd /workspace || exit 0",
      "git config --global --add safe.directory /workspace 2>/dev/null",
      "[ -d .git ] && exit 0",
      "git init -q -b main && git add -A && git -c user.name='Hack University' -c user.email=hello@hack-university.local commit -q -m 'Starting point' >/dev/null 2>&1",
      "exit 0",
    ].join("\n");
    await execCollect(container, ["sh", "-c", script], { user: "learner", timeoutMs: 30_000 }).catch((err: Error) =>
      this.m.log.warn("workspace.git_init_failed", { id: this.id, error: err.message })
    );
  }

  /** Stops the container: tasks get TERM then KILL, terminals and bridges close, leases stay. */
  async stop(reason: "user" | "idle" | "lru" | "docker" | "delete" = "user"): Promise<{ status: Status }> {
    // A start still waiting for memory is called off rather than waited for.
    if (this.status === "starting" && this.detail?.startsWith("Waiting for memory")) this.m.capacity.cancel(this.id);
    if (this.startPromise) await this.startPromise.catch(() => {});
    return this.lock.run(() => this.stopLocked(reason));
  }

  private async stopLocked(reason: "user" | "idle" | "lru" | "docker" | "delete"): Promise<{ status: Status }> {
    if (this.status !== "running" && this.status !== "error" && this.status !== "starting") return { status: this.status };
    const container = this.container;
    this.setStatus("stopping", null);
    this.stopPolling();
    if (this.diagTimer) clearTimeout(this.diagTimer);
    this.diagTimer = null;
    if (container && reason !== "docker") {
      const running = [...this.tasks.values()].filter((t) => t.state === "running" || t.state === "starting");
      if (running.length) {
        await Promise.all(running.map((t) => signalTask(container, t.name, "TERM").catch(() => {})));
        const until = Date.now() + 5_000;
        while (Date.now() < until) {
          const poll = await this.readPoll(container).catch(() => null);
          if (!poll || running.every((t) => !poll.procs.get(t.name)?.alive)) break;
          await new Promise((r) => setTimeout(r, 200));
        }
        await Promise.all(running.map((t) => signalTask(container, t.name, "KILL").catch(() => {})));
      }
    }
    for (const t of this.tasks.values()) {
      if (t.state === "running" || t.state === "starting") {
        Object.assign(t, { state: "exited", code: null, signal: "SIGTERM" });
        this.emitTask(t);
      }
    }
    const message = reason === "docker" ? "Docker stopped." : "The workspace stopped.";
    for (const session of [...this.terminals.values(), ...this.logViews.values()]) session.close(message);
    this.terminals.clear();
    this.logViews.clear();
    for (const t of this.tasks.values()) t.sid = null;
    this.closeBridges();
    if (container && reason !== "docker") await container.stop({ t: 2 }).catch(() => {});
    this.cfs = null;
    this.mem = null;
    this.counters = null;
    this.m.leases.unpin(this.meta.scope);
    this.m.capacity.release(this.id);
    this.meta.stoppedAt = Date.now();
    this.saveMeta();
    const idle = this.m.config.idleMs;
    const detail =
      reason === "idle"
        ? `Stopped after ${idle >= 60_000 ? `${Math.round(idle / 60_000)} minutes` : `${Math.round(idle / 1000)} seconds`} without activity. Your files are kept.`
        : reason === "lru"
          ? "Stopped to make room for a workspace you have open. Your files are kept."
          : reason === "docker"
            ? "Docker is off."
            : null;
    this.setStatus("stopped", detail);
    if (reason === "idle" || reason === "lru") {
      this.emit({ t: "limit", kind: reason, message: detail });
    }
    this.m.log.info("workspace.stopped", { id: this.id, reason });
    return { status: this.status };
  }

  /** Docker went away under a running workspace. */
  dockerGone() {
    if (this.status === "running" || this.status === "starting") void this.stop("docker");
  }

  // Polling: ports, tasks, memory, limits

  private async readPoll(container: Docker.Container): Promise<PollResult> {
    const result = await execCollect(container, ["sh", "-c", POLL], { user: "learner", timeoutMs: 5_000, maxBytes: 2 * MiB });
    if (result.timedOut) throw new Error("The poll timed out.");
    return parsePoll(result.stdout.toString("utf8"));
  }

  private startPolling() {
    this.stopPolling();
    const tick = async () => {
      if (this.polling || !this.running || !this.container) return;
      this.polling = true;
      try {
        await this.pollOnce(this.container);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 409) {
          this.m.log.warn("workspace.vanished", { id: this.id });
          void this.lock.run(() => this.stopLocked("docker")).then(() => this.setStatus("stopped", "The workspace stopped unexpectedly. Your files are kept."));
        } else if (isDockerDown(err)) {
          this.dockerGone();
        }
      } finally {
        this.polling = false;
      }
    };
    this.poller = setInterval(() => void tick(), this.m.config.wsPollMs);
    this.poller.unref();
    void tick();
  }

  private stopPolling() {
    if (this.poller) clearInterval(this.poller);
    this.poller = null;
  }

  private async pollOnce(container: Docker.Container) {
    const poll = await this.readPoll(container);
    // Memory and limits.
    if (poll.memUsed !== null) {
      const limitMb = Math.round((poll.memMax ?? this.limits.memoryBytes) / MiB);
      this.mem = { usedMb: Math.round(poll.memUsed / MiB), limitMb };
      if (Date.now() - this.memSentAt >= MEM_EVENT_MS) {
        this.memSentAt = Date.now();
        this.emit(this.statusMessage());
      }
    }
    if (this.counters) {
      if (poll.oomKills > this.counters.oom) {
        this.emit({ t: "limit", kind: "oom", message: `Your workspace used more than its ${Math.round(this.limits.memoryBytes / MiB)} MB and a process was stopped.` });
      }
      if (poll.pidsMax > this.counters.pids) {
        this.emit({ t: "limit", kind: "pids", message: `Your workspace reached its limit of ${this.limits.pids} processes, so a new one couldn't start.` });
      }
    }
    this.counters = { oom: poll.oomKills, pids: poll.pidsMax };
    // Tasks.
    for (const t of this.tasks.values()) {
      const proc = poll.procs.get(t.name);
      if (t.state === "starting") {
        if (proc?.alive && proc.exit === null) {
          t.state = "running";
          this.emitTask(t);
        } else if (proc && (proc.exit !== null || !proc.alive)) {
          this.finishTask(t, proc.exit);
        } else if (Date.now() - t.launchedAt > 10_000) {
          this.finishTask(t, null);
        }
      } else if (t.state === "running") {
        if (!proc || proc.exit !== null || !proc.alive) this.finishTask(t, proc?.exit ?? null);
      } else if (t.state === "idle" && proc?.alive && proc.exit === null) {
        // Running from before a runner restart: adopt it.
        t.state = "running";
        t.startedAt ??= Date.now();
        await this.ensureLogView(t).catch(() => {});
        this.emitTask(t);
      }
    }
    // Ports.
    await this.updatePorts(container, poll);
  }

  private finishTask(t: TaskState & { sentKill: boolean }, exit: number | null) {
    const end = ending(exit, t.sentKill);
    Object.assign(t, { state: "exited", code: end.code, signal: end.signal });
    if (end.signal === "SIGXFSZ") {
      this.emit({ t: "limit", kind: "fsize", message: `A process in ${t.name} wrote a file past the ${Math.round(this.limits.fsizeBytes / MiB)} MB limit and was stopped.` });
    }
    this.emitTask(t);
  }

  private emitTask(t: TaskState) {
    this.emit({ t: "task", name: t.name, state: t.state, code: t.code, signal: t.signal, sid: t.sid });
  }

  // Ports and bridges

  private portInfo(p: PortState) {
    return {
      port: p.port,
      target: p.target,
      url: `http://localhost:${p.port}`,
      env: p.env,
      label: p.label,
      state: p.state,
      bind: p.bind,
      process: p.process,
      framable: p.framable,
      reason: p.reason,
      declared: p.declared,
      preview: p.preview,
      note: p.note,
      clearSiteData: p.clearSiteData,
    };
  }

  portList() {
    return [...this.ports.values()].map((p) => this.portInfo(p));
  }

  leasedPorts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const l of this.m.leases.of(this.meta.scope)) out[l.env] = l.port;
    return out;
  }

  private emitPort(p: PortState) {
    this.emit({ t: "port", ...this.portInfo(p) });
  }

  private makeBridge(port: number, target: number): Bridge {
    return new Bridge({
      port,
      target,
      container: this.container!,
      listening: () => this.ports.get(target)?.state === "listening",
      admit: () => {
        if (this.bridged >= MAX_CONNECTIONS) return false;
        this.bridged++;
        return true;
      },
      release: () => {
        this.bridged = Math.max(0, this.bridged - 1);
      },
      onCleared: () => {
        this.m.leases.cleared(port);
        const p = this.ports.get(target);
        if (p?.clearSiteData) {
          p.clearSiteData = false;
          this.emitPort(p);
        }
      },
      log: this.m.log,
    });
  }

  private async openDeclaredBridges(leases: Map<string, { port: number; note: string | null; clearSiteData: boolean }>) {
    const decls = this.meta.config.ports.length ? this.meta.config.ports : [{ env: "PORT", label: "Server" } as { env: string; label?: string; preview?: boolean }];
    for (const decl of decls) {
      const lease = leases.get(decl.env)!;
      const state: PortState = {
        port: lease.port,
        target: lease.port,
        env: decl.env,
        label: decl.label ?? null,
        declared: true,
        preview: Boolean(decl.preview),
        state: "closed",
        bind: null,
        process: null,
        framable: null,
        reason: null,
        note: lease.note,
        clearSiteData: lease.clearSiteData,
        bridge: null,
        borrowed: false,
      };
      const bridge = this.makeBridge(lease.port, lease.port);
      await bridge.listen();
      state.bridge = bridge;
      this.ports.set(lease.port, state);
      this.emitPort(state);
    }
  }

  private closeBridges() {
    for (const p of this.ports.values()) {
      p.bridge?.close();
      if (p.borrowed) this.m.leases.giveBack(p.port);
    }
    this.ports.clear();
    this.bridged = 0;
  }

  /** Detection: ports that opened or closed since the last poll. */
  private async updatePorts(container: Docker.Container, poll: PollResult) {
    for (const [target, l] of poll.listening) {
      const known = this.ports.get(target) ?? [...this.ports.values()].find((p) => p.target === target);
      if (known) {
        if (known.state !== "listening" || known.bind !== l.bind) {
          const opened = known.state !== "listening";
          known.state = "listening";
          known.bind = l.bind;
          if (opened) await this.describePort(container, known, l.inode);
          this.emitPort(known);
        }
        continue;
      }
      if (this.ports.size >= 32) continue;
      const forwarded = await this.forward(target).catch((err: Error) => {
        this.m.log.warn("workspace.forward_failed", { id: this.id, port: target, error: err.message });
        return null;
      });
      if (!forwarded) continue;
      forwarded.state = "listening";
      forwarded.bind = l.bind;
      await this.describePort(container, forwarded, l.inode);
      this.emitPort(forwarded);
    }
    for (const p of [...this.ports.values()]) {
      if (p.state !== "listening" || poll.listening.has(p.target)) continue;
      p.state = "closed";
      p.framable = null;
      p.reason = null;
      if (!p.declared && !p.forwardedByHand) {
        p.bridge?.close();
        if (p.borrowed) this.m.leases.giveBack(p.port);
        this.ports.delete(p.target);
      }
      this.emitPort(p);
    }
  }

  private async describePort(container: Docker.Container, p: PortState, inode: string) {
    p.process = await processOf(container, inode);
    try {
      const res = await requestThrough(container, p.target, { method: "GET", path: "/", host: `localhost:${p.port}`, timeoutMs: 3_000, maxBytes: 64 * 1024 });
      const f = framing(res.headers, this.m.appOrigins);
      p.framable = f.framable;
      p.reason = f.reason;
    } catch {
      p.framable = null;
      p.reason = null;
    }
  }

  /** Forwards a port the workspace has no lease for: the same number when it's free on the Mac, else a fresh one. */
  private async forward(target: number, byHand = false): Promise<PortState> {
    let port = target;
    let note: string | null = null;
    const leases = this.m.leases;
    const holder = leases.holder(target);
    const sameOk = !RESERVED.has(target) && target >= 1024 && !holder && (await portFree(target));
    if (sameOk) {
      leases.borrow(target);
    } else {
      port = await this.m.freePort();
      const why =
        target === 3000
          ? "3000 is Hack University itself on your Mac."
          : target === 3100
            ? "3100 is the workspace runner on your Mac."
            : target === 2000
              ? "2000 is the code runner (Piston) on your Mac."
              : target < 1024
                ? `${target} is a system port on your Mac.`
                : `${target} is in use on your Mac.`;
      note = `${why} Forwarded to ${port}.`;
    }
    const state: PortState = {
      port,
      target,
      env: null,
      label: null,
      declared: false,
      preview: false,
      state: "closed",
      bind: null,
      process: null,
      framable: null,
      reason: null,
      note,
      clearSiteData: false,
      bridge: null,
      borrowed: true,
      forwardedByHand: byHand,
    };
    const bridge = this.makeBridge(port, target);
    try {
      await bridge.listen();
    } catch (err) {
      leases.giveBack(port);
      throw err;
    }
    state.bridge = bridge;
    this.ports.set(target, state);
    return state;
  }

  /** POST …/ports: forward an undeclared port now. */
  async forwardPort(target: number) {
    if (!this.running || !this.container) throw new HttpError(409, "not_running", "Start the workspace first.");
    const known = this.ports.get(target) ?? [...this.ports.values()].find((p) => p.target === target);
    if (known) return this.portInfo(known);
    const state = await this.forward(target, true);
    this.emitPort(state);
    return this.portInfo(state);
  }

  /** DELETE …/ports/:port: stop forwarding (a declared port keeps its lease and bridge). */
  unforwardPort(port: number) {
    const p = [...this.ports.values()].find((x) => x.port === port || x.target === port);
    if (!p) throw new PathError("not_found", `Port ${port} isn't forwarded.`);
    if (p.declared) return;
    p.bridge?.close();
    if (p.borrowed) this.m.leases.giveBack(p.port);
    this.ports.delete(p.target);
    p.state = "closed";
    this.emitPort(p);
  }

  // The API panel

  async httpRequest(body: HttpPanelRequest) {
    if (!this.running || !this.container) throw new HttpError(409, "not_running", "Start the workspace first.");
    this.touch();
    const p = [...this.ports.values()].find((x) => x.port === body.port) ?? this.ports.get(body.port);
    if (!p) throw new HttpError(404, "not_found", `Port ${body.port} isn't one of this workspace's ports.`);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.headers ?? {})) headers[k.toLowerCase()] = v;
    const useJar = body.jar !== false;
    const urlPath = body.path.split("?")[0];
    if (useJar && !headers.cookie) {
      const cookie = this.jar.header(urlPath);
      if (cookie) headers.cookie = cookie;
    }
    const data = body.body === undefined ? undefined : Buffer.from(body.body, body.bodyEncoding === "base64" ? "base64" : "utf8");
    let res;
    try {
      res = await requestThrough(this.container, p.target, {
        method: body.method,
        path: body.path,
        headers,
        body: data,
        host: `localhost:${p.port}`,
        timeoutMs: body.timeoutMs ?? 30_000,
        maxBytes: 1 * MiB,
      });
    } catch (err) {
      if (err instanceof HttpThroughError) {
        throw new HttpError(err.code === "timeout" ? 504 : 502, err.code, err.message);
      }
      throw err;
    }
    const setCookies = (res.headers["set-cookie"] as string[] | undefined) ?? [];
    if (useJar) for (const c of setCookies) this.jar.set(c);
    const text = isText(res.body);
    return {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
      cookies: setCookies.map(parseSetCookie).filter(Boolean),
      body: res.body.toString(text ? "utf8" : "base64"),
      bodyEncoding: text ? "utf8" : "base64",
      size: res.body.length,
      truncated: res.truncated,
      timingMs: res.timingMs,
    };
  }

  clearCookies() {
    this.jar.clear();
  }

  // Terminals and tasks

  async openTerminal(cols: number, rows: number, cwd?: string): Promise<string> {
    this.touch();
    const shells = [...this.terminals.values()].filter((t) => !t.exited);
    if (shells.length >= MAX_TERMINALS) throw new HttpError(409, "too_many_terminals", `A workspace has at most ${MAX_TERMINALS} terminals. Close one first.`);
    await this.ensureRunning();
    const dir = cwd ? `/workspace/${checkRel(cwd)}` : "/workspace";
    const session = await TerminalSession.shell(this.container!, { cols, rows, cwd: dir, env: [] });
    session.onInput = () => this.touch();
    session.onExit = (code) => this.emit({ t: "terminal", sid: session.sid, state: "exited", code });
    this.terminals.set(session.sid, session);
    return session.sid;
  }

  session(sid: string): TerminalSession | undefined {
    return this.terminals.get(sid) ?? [...this.logViews.values()].find((s) => s.sid === sid);
  }

  async closeTerminal(sid: string) {
    const session = this.terminals.get(sid);
    if (!session) throw new PathError("not_found", "No such terminal.");
    this.terminals.delete(sid);
    await session.kill();
  }

  /** The last socket left a shell this long ago: end it. */
  expireTerminal(sid: string) {
    const session = this.terminals.get(sid);
    if (!session || session.attached) return;
    this.terminals.delete(sid);
    void session.kill();
  }

  terminalList() {
    return [...this.terminals.values(), ...this.logViews.values()].map((s) => s.info);
  }

  taskList() {
    return [...this.tasks.values()].map(({ sentKill: _k, launchedAt: _l, ...t }) => t);
  }

  private task(name: string) {
    const t = this.tasks.get(name);
    if (!t) throw new HttpError(404, "not_found", `This workspace has no task named ${name}.`);
    return t;
  }

  private async ensureLogView(t: TaskState): Promise<TerminalSession> {
    let view = this.logViews.get(t.name);
    if (!view) {
      view = await TerminalSession.log(this.container!, t.name);
      view.onSignal = (sig) => void this.signalTask(t.name, sig).catch(() => {});
      this.logViews.set(t.name, view);
    }
    t.sid = view.sid;
    return view;
  }

  async startTask(name: string): Promise<{ sid: string; state: string }> {
    const t = this.task(name);
    this.touch();
    await this.ensureRunning();
    if (t.state === "running" || t.state === "starting") return { sid: t.sid!, state: t.state };
    const hadView = this.logViews.has(name);
    const view = await this.ensureLogView(t);
    if (hadView) view.note("── restarted ──");
    Object.assign(t, { state: "starting", code: null, signal: null, startedAt: Date.now(), sentKill: false, launchedAt: Date.now() });
    await launchTask(this.container!, name, t.cmd, []);
    this.emitTask(t);
    return { sid: view.sid, state: t.state };
  }

  async stopTask(name: string): Promise<{ state: string }> {
    const t = this.task(name);
    this.touch();
    if (!this.running || !this.container || (t.state !== "running" && t.state !== "starting")) return { state: t.state };
    const container = this.container;
    await signalTask(container, name, "TERM");
    const until = Date.now() + 5_000;
    while (Date.now() < until) {
      const poll = await this.readPoll(container).catch(() => null);
      const proc = poll?.procs.get(name);
      if (!proc || !proc.alive || proc.exit !== null) {
        this.finishTask(t, proc?.exit ?? null);
        return { state: t.state };
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    t.sentKill = true;
    await signalTask(container, name, "KILL");
    this.finishTask(t, null);
    return { state: t.state };
  }

  async restartTask(name: string) {
    await this.stopTask(name);
    return this.startTask(name);
  }

  async signalTask(name: string, sig: string) {
    const t = this.task(name);
    this.touch();
    if (!this.running || !this.container) return;
    if (sig === "KILL") t.sentKill = true;
    if (t.state === "running" || t.state === "starting") await signalTask(this.container, name, sig);
  }

  // Events

  subscribe(sub: Subscriber, since?: number) {
    const missed = this.hub.subscribe(sub, since);
    if (!this.watcher.running) {
      void this.listAll().then(
        ({ entries }) => this.watcher.start(entries),
        () => {}
      );
    }
    return missed;
  }

  unsubscribe(sub: Subscriber) {
    this.hub.unsubscribe(sub);
    if (this.hub.size === 0 && !this.running) this.watcher.stop();
  }

  unwatch() {
    this.watcher.stop();
  }

  heartbeat(visible: boolean) {
    this.touch();
    if (visible) this.lastVisible = Date.now();
    // Its databases are in use too, for their idle stop and parking clock.
    this.m.databases?.touch(this.id);
  }

  /** Re-adopts a container found running at runner start. */
  async adopt(container: Docker.Container) {
    await this.lock.run(async () => {
      this.container = container;
      this.cfs = new ContainerFs(container);
      this.status = "running";
      this.m.capacity.admitNow(this.id, this.limits.memoryBytes);
      const leases = await this.takeLeases().catch(() => new Map());
      await this.openDeclaredBridges(leases).catch((err: Error) => this.m.log.warn("workspace.adopt_bridges_failed", { id: this.id, error: err.message }));
      this.startPolling();
      this.setStatus("running", null);
      this.m.log.info("workspace.adopted", { id: this.id });
    });
  }

  /** Removes everything: container, volumes, databases, leases, files. */
  async destroy() {
    await this.stop("delete").catch(() => {});
    await this.lock.run(async () => {
      this.watcher.stop();
      await this.m.docker.getContainer(this.containerName).remove({ force: true, v: true }).catch(() => {});
      await this.m.removeVolumes(this.id);
      this.m.deps.forget(this.m.volumeName(this.id, "deps"));
      await this.m.databases?.dropWorkspace(this.id).catch((err: Error) => this.m.log.warn("workspace.db_drop_failed", { id: this.id, error: err.message }));
      this.m.leases.release(this.meta.scope);
      fs.rmSync(this.dir, { recursive: true, force: true });
    });
  }

  /** The disk the workspace's folder takes (du, which never follows a link), or null when it can't tell. */
  diskBytes(): Promise<number | null> {
    return new Promise((resolve) => {
      execFile("du", ["-sk", this.dir], { timeout: 10_000 }, (err, stdout) => {
        const kb = Number(String(stdout).split(/\s/)[0]);
        resolve(err || !Number.isFinite(kb) ? null : kb * 1024);
      });
    });
  }

  /** Old trash and a long-stopped container go (the reaper calls this). */
  async sweep(now: number) {
    const dir = path.join(this.dir, "trash");
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith(".json")) continue;
        const info = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as { createdAt: number };
        if (now - info.createdAt > TRASH_TTL_MS) {
          fs.rmSync(path.join(dir, name), { force: true });
          fs.rmSync(path.join(dir, name.replace(/\.json$/, ".tar")), { force: true });
        }
      }
    } catch {
      /* no trash */
    }
    if (this.running && now - this.lastActive > this.m.config.idleMs) {
      await this.stop("idle");
      return;
    }
    if (!this.running && this.status !== "starting" && this.meta.stoppedAt && now - this.meta.stoppedAt > this.m.config.wsRemoveMs) {
      const removed = await this.m.docker
        .getContainer(this.containerName)
        .remove({ force: true })
        .then(() => true, () => false);
      if (removed) this.m.log.info("workspace.container_removed", { id: this.id });
      if (this.status === "stopped") this.status = "files";
    }
  }

  /** "Download": a zip of the files, without .git (unless asked) and the dependency and build folders, and without links. */
  async archive(withGit: boolean): Promise<Buffer> {
    const skip = [...HEAVY, ...this.meta.config.build].filter((e) => e !== ".git" || !withGit);
    return this.lock.run(async () => {
      let entries: TarEntry[];
      if (this.running && this.cfs) entries = unpackTar(await this.cfs.archive(skip, 200 * MiB)).filter((e) => e.path !== "" && e.path !== ".");
      else entries = this.files.pack("", 200 * MiB, (p) => skip.some((x) => p === x || p.startsWith(`${x}/`)));
      return zip(entries);
    });
  }

  /**
   * "Continue with my code" (decision D8): the files of another workspace
   * (the previous part's practice) replace these, after an automatic
   * snapshot so Undo works. Its files are cloned first, links kept as links.
   */
  async carry(from: Workspace) {
    if (from.id === this.id) throw new HttpError(400, "bad_request", "A workspace can't continue from itself.");
    return this.lock.run(async () => {
      const before = await this.snapshotLocked(null, true);
      const tmp = path.join(this.dir, `.carry-${randomBytes(4).toString("hex")}`);
      try {
        fs.mkdirSync(tmp, { mode: 0o700 });
        for (const name of fs.readdirSync(from.files.root)) {
          if (keptAside(name)) continue;
          await cloneTree(path.join(from.files.root, name), path.join(tmp, name));
        }
        const result = await this.converge(new HostFs(tmp), buildManifest(tmp, keptAside), { kind: "all" }, false);
        return { ...result, snapshot: before.id };
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  }

  /** A tar of the files for a check: from inside while running, from the Mac (no link followed) while stopped. */
  async archiveForCheck(exclude: string[], keepGit: boolean): Promise<Buffer> {
    const skip = [...exclude, ...HEAVY].filter((e) => e !== ".git" || !keepGit);
    const list = [...new Set([...skip, ...this.meta.config.build])];
    return this.lock.run(async () => {
      if (this.running && this.cfs) return this.cfs.archive(list, 256 * MiB);
      const entries = this.files.pack("", 256 * MiB, (p) => list.some((x) => p === x || p.startsWith(`${x}/`)));
      return packTar(entries);
    });
  }
}

/** Paths that resets, snapshots, and the changes list leave alone: .git, and dependency and build folders at the root. */
function keptAside(p: string): boolean {
  const first = p.split("/")[0];
  return KEEP_ROOT.has(first) || HEAVY.has(first);
}

export function envLines(env: Record<string, string>): string[] {
  return Object.entries(env).map(([k, v]) => `${k}=${v}`);
}

/** `${NAME}` becomes NAME's value in `vars`. A name it doesn't hold stays as written. */
export function expand(value: string, vars: Record<string, string>): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (all, name: string) => (Object.hasOwn(vars, name) ? vars[name] : all));
}

/** A database failure as the REST error it answers (db/routes.ts maps them the same way). */
function dbHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof DbError) return new HttpError(err.status, err.code, err.message);
  if (err instanceof PgError || err instanceof MongoError) return new HttpError(502, "db_error", err.message);
  return new HttpError(500, "internal", (err as Error).message);
}

/** A minimal cookie jar for the API panel: every response's cookies, sent back by path. */
class CookieJar {
  private readonly cookies = new Map<string, { name: string; value: string; path: string; expires: number | null }>();

  set(header: string) {
    const parsed = parseSetCookie(header);
    if (!parsed) return;
    const key = `${parsed.path}\0${parsed.name}`;
    if (parsed.expires !== null && parsed.expires <= Date.now()) this.cookies.delete(key);
    else this.cookies.set(key, { name: parsed.name, value: parsed.value, path: parsed.path, expires: parsed.expires });
  }

  header(urlPath: string): string {
    const now = Date.now();
    const out: string[] = [];
    for (const [key, c] of this.cookies) {
      if (c.expires !== null && c.expires <= now) {
        this.cookies.delete(key);
        continue;
      }
      if (urlPath === c.path || urlPath.startsWith(c.path.endsWith("/") ? c.path : `${c.path}/`) || c.path === "/") out.push(`${c.name}=${c.value}`);
    }
    return out.join("; ");
  }

  clear() {
    this.cookies.clear();
  }
}

export function parseSetCookie(header: string) {
  const parts = header.split(";").map((p) => p.trim());
  const first = parts.shift() ?? "";
  const eq = first.indexOf("=");
  if (eq <= 0) return null;
  const cookie = {
    name: first.slice(0, eq).trim(),
    value: first.slice(eq + 1).trim(),
    path: "/",
    expires: null as number | null,
    httpOnly: false,
    secure: false,
    sameSite: null as string | null,
  };
  for (const attr of parts) {
    const [k, ...rest] = attr.split("=");
    const key = k.trim().toLowerCase();
    const value = rest.join("=").trim();
    if (key === "path" && value.startsWith("/")) cookie.path = value;
    else if (key === "max-age" && /^-?\d+$/.test(value)) cookie.expires = Date.now() + Number(value) * 1000;
    else if (key === "expires" && cookie.expires === null) {
      const t = Date.parse(value);
      if (Number.isFinite(t)) cookie.expires = t;
    } else if (key === "httponly") cookie.httpOnly = true;
    else if (key === "secure") cookie.secure = true;
    else if (key === "samesite") cookie.sameSite = value || null;
  }
  return cookie;
}

/** Every workspace this runner keeps, on disk and in memory. */
export class Workspaces {
  readonly root: string;
  readonly config: Config;
  readonly owner: Owner;
  readonly log: Log;
  readonly leases: PortLeases;
  readonly capacity: Capacity;
  readonly images: Images;
  readonly appOrigins: string[];
  /** 8 hex characters of the data folder: two runners never share a container in the verify namespace. */
  readonly home: string;
  /** Dependency volumes and the stacks' shared caches. */
  readonly deps: Deps;
  readonly databases: Databases | null;
  readonly pool: JobPool | null;
  private readonly watch: DockerWatch;
  private readonly loaded = new Map<string, Workspace>();

  constructor(deps: ManagerDeps) {
    this.config = deps.config;
    this.owner = deps.owner;
    this.log = deps.log;
    this.leases = deps.leases;
    this.capacity = deps.capacity;
    this.images = deps.images;
    this.appOrigins = deps.appOrigins;
    this.watch = deps.watch;
    this.databases = deps.databases ?? null;
    this.pool = deps.pool ?? null;
    this.root = path.join(deps.config.dataDir, "workspaces");
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    this.home = createHash("sha256").update(deps.config.dataDir).digest("hex").slice(0, 8);
    this.deps = new Deps({
      docker: () => this.docker,
      owner: this.owner,
      images: this.images,
      log: this.log,
      dataDir: deps.config.dataDir,
      home: this.home,
      pool: deps.pool,
      capacity: deps.capacity,
    });
    // Resets and size limits reach the workspace's events socket.
    this.databases?.onEvent((id, event) => this.loaded.get(id)?.dbEvent(event));
  }

  get docker(): Docker {
    return this.watch.docker;
  }

  containerName(id: string): string {
    return this.owner.ns === "verify" ? `hv-ws-${this.home}-${id}` : `hu-ws-${id}`;
  }

  volumeName(id: string, what: string): string {
    return `${this.containerName(id)}-${what}`;
  }

  async needDocker() {
    if (this.watch.state !== "ready") await this.watch.check();
    if (this.watch.state === "ready" || (this.watch.state === "waking" && (await this.watch.ready(30_000)))) return;
    throw new HttpError(503, "docker_unavailable", this.watch.state === "waking" ? "Docker is still waking up. Try again in a moment." : "Start Docker to run this.");
  }

  /** The labels of a workspace's own volumes, which go when it is deleted. */
  volumeLabels(id: string): Record<string, string> {
    return { [LABEL.managed]: "1", [LABEL.ns]: this.owner.ns, [LABEL.home]: this.home, [LABEL.workspace]: id };
  }

  /** A labeled volume for a workspace, made when missing. */
  async volume(id: string, what: string): Promise<string> {
    const name = this.volumeName(id, what);
    try {
      await this.docker.getVolume(name).inspect();
    } catch {
      await this.docker.createVolume({ Name: name, Labels: this.volumeLabels(id) });
    }
    return name;
  }

  /**
   * Makes an empty volume learner's: Docker gives a new volume the owner of
   * the image's folder at its mount point, and root's where the image has
   * none (a build folder like .vite), and it does so for any container made
   * while the volume is still empty. So a container is made, never started,
   * with the volume on /work, which every hu image has empty and learner's.
   */
  async prime(volume: string, image: string): Promise<void> {
    const container = await this.docker
      .createContainer({
        name: `${namePrefix(this.owner.ns)}-prime-${randomBytes(6).toString("hex")}`,
        Image: image,
        Cmd: ["true"],
        User: "1000:1000",
        Labels: labelsFor(this.owner, "job", { [LABEL.expires]: String(Date.now() + 60_000) }),
        HostConfig: { NetworkMode: "none", Mounts: [{ Type: "volume", Source: volume, Target: "/work" }] },
      })
      .catch((err: Error) => {
        this.log.warn("workspace.prime_failed", { volume, error: err.message });
        return null;
      });
    await container?.remove({ force: true }).catch(() => {});
  }

  async removeVolumes(id: string) {
    const list = await this.docker.listVolumes({ filters: { label: [`${LABEL.workspace}=${id}`, `${LABEL.home}=${this.home}`] } }).catch(() => null);
    for (const v of list?.Volumes ?? []) await this.docker.getVolume(v.Name).remove().catch(() => {});
  }

  /** A port for a detected server that had to move: free on the Mac, in the range, leased by no one. */
  async freePort(): Promise<number> {
    for (let port = this.leases.first; port <= this.leases.last; port++) {
      if (this.leases.holder(port) || RESERVED.has(port)) continue;
      if (!(await portFree(port))) continue;
      this.leases.borrow(port);
      return port;
    }
    throw new PortsExhausted();
  }

  /** The workspace with this id, from memory or its meta.json. */
  get(id: string): Workspace | null {
    const hit = this.loaded.get(id);
    if (hit) return hit;
    if (!/^w[a-z2-7]{10}$/.test(id)) return null;
    let meta: Meta;
    try {
      meta = JSON.parse(fs.readFileSync(path.join(this.root, id, "meta.json"), "utf8"));
    } catch {
      return null;
    }
    const ws = new Workspace(this, meta);
    ws.lastActive = meta.lastActiveAt ?? Date.now();
    // Reconcile corrects this from the containers Docker has.
    ws.status = meta.startedAt ? "stopped" : "files";
    this.loaded.set(id, ws);
    return ws;
  }

  all(): Workspace[] {
    for (const name of fs.readdirSync(this.root)) this.get(name);
    return [...this.loaded.values()];
  }

  running(): Workspace[] {
    return [...this.loaded.values()].filter((w) => w.running);
  }

  /** Workspaces LRU may stop: running, shown in no tab, not the one asking. */
  lruCandidates(except: string): Candidate[] {
    return this.running()
      .filter((w) => w.id !== except && !w.visible)
      .map((w) => ({ id: w.id, lastActive: w.lastActive }));
  }

  async stopForMemory(id: string) {
    await this.loaded.get(id)?.stop("lru");
  }

  /** The biggest check slot among courses open in a visible tab (1 GiB when none is). */
  checkSlot(): number {
    let slot = 0;
    for (const w of this.loaded.values()) if (w.visible) slot = Math.max(slot, w.limits.checkBytes);
    return slot || 1024 * 1024 * 1024;
  }

  private readonly opening = new Map<string, Promise<unknown>>();

  /** PUT /v1/workspaces/:id, one at a time per id. */
  open(id: string, body: OpenWorkspace) {
    const before = this.opening.get(id) ?? Promise.resolve();
    const run = before.catch(() => {}).then(() => this.openNow(id, body));
    this.opening.set(id, run);
    void run.finally(() => {
      if (this.opening.get(id) === run) this.opening.delete(id);
    }).catch(() => {});
    return run;
  }

  /** Materializes on the first call, and refreshes the original when the template changed. */
  private async openNow(id: string, body: OpenWorkspace) {
    const scope = parseScope(body.scope);
    if (!scope) throw new HttpError(400, "bad_request", "scope: is not a workspace scope");
    if (workspaceId(body.scope) !== id) throw new HttpError(400, "bad_request", "The id isn't the scope's workspace id.");
    const course = body.course ?? scope.course;
    if (!isCourse(course)) throw new HttpError(400, "bad_request", `There is no course named ${course}.`);
    if (body.template.split("/")[0] !== course) throw new HttpError(400, "bad_request", "The template belongs to another course.");
    const config = this.configOf(course, body);
    const layers = this.resolveLayers(body.template, body.layers);

    let ws = this.get(id);
    let created = false;
    let updated: string[] = [];
    const build = async () => {
      const tmp = path.join(this.root, `.${id}.${randomBytes(4).toString("hex")}.tmp`);
      try {
        for (const layer of layers) await applyLayer(layer, tmp);
        fs.mkdirSync(tmp, { recursive: true });
        dotenv(tmp);
        const manifest = buildManifest(tmp);
        return { tmp, manifest, hash: manifestHash(manifest) };
      } catch (err) {
        fs.rmSync(tmp, { recursive: true, force: true });
        throw err;
      }
    };
    if (!ws) {
      const built = await build();
      const dir = path.join(this.root, id);
      // A folder left by a crash mid-open, with no meta.json: start over.
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { mode: 0o700 });
      fs.renameSync(built.tmp, path.join(dir, "original"));
      await cloneTree(path.join(dir, "original"), path.join(dir, "files"));
      const now = Date.now();
      const meta: Meta = {
        version: 1,
        id,
        scope: body.scope,
        course,
        template: body.template,
        layers: body.layers,
        templateHash: built.hash,
        manifest: built.manifest,
        config,
        createdAt: now,
        lastActiveAt: now,
        startedAt: null,
        stoppedAt: null,
        gitInit: false,
        snapshots: [],
        lastCheck: null,
      };
      ws = new Workspace(this, meta);
      ws.saveMeta();
      this.loaded.set(id, ws);
      created = true;
      this.log.info("workspace.opened", { id, scope: body.scope, files: Object.keys(built.manifest).length });
    } else {
      const existing = ws;
      await existing.lock.run(async () => {
        existing.meta.config = config;
        const built = await build();
        if (built.hash !== existing.meta.templateHash || JSON.stringify(existing.meta.layers) !== JSON.stringify(body.layers)) {
          const old = existing.meta.manifest;
          updated = [...new Set([...Object.keys(old), ...Object.keys(built.manifest)])]
            .filter((p) => JSON.stringify(old[p] ?? null) !== JSON.stringify(built.manifest[p] ?? null))
            .sort();
          const original = path.join(existing.dir, "original");
          const aside = `${original}.old.${randomBytes(3).toString("hex")}`;
          fs.renameSync(original, aside);
          fs.renameSync(built.tmp, original);
          fs.rmSync(aside, { recursive: true, force: true });
          existing.meta.manifest = built.manifest;
          existing.meta.templateHash = built.hash;
          existing.meta.layers = body.layers;
        } else {
          fs.rmSync(built.tmp, { recursive: true, force: true });
        }
        existing.saveMeta();
      });
    }
    ws.touch();
    const tree = await ws.snapshotTree();
    return {
      id,
      status: ws.status,
      templateHash: ws.meta.templateHash,
      created,
      updated,
      ports: ws.leasedPorts(),
      tree: tree.entries,
      removed: tree.removed,
    };
  }

  private configOf(course: string, body: OpenWorkspace): WorkspaceConfig {
    const tasks: Record<string, TaskDef> = {};
    for (const [name, def] of Object.entries(body.tasks ?? {})) tasks[name] = typeof def === "string" ? { cmd: def } : def;
    return {
      image: workspaceImage(course, body.image),
      storage: body.storage ?? "host",
      profile: body.profile ?? "standard",
      start: body.start ?? "run",
      examples: body.examples ?? "own",
      ports: body.ports ?? [],
      tasks,
      env: body.env ?? {},
      limits: body.limits ?? {},
      build: body.build ?? [],
      hidden: body.hidden ?? [],
      readonly: body.readonly ?? [],
      restartOnReset: body.restartOnReset ?? false,
      deps: body.deps ?? null,
      services: body.services ?? null,
      diagnostics: body.diagnostics ?? [],
    };
  }

  /** Each layer's folder under content/ and the delete list that goes with it. */
  private resolveLayers(template: string, names: string[]): Layer[] {
    const content = this.config.contentDir;
    const tplDir = path.join(content, "workspaces", template);
    if (!isDir(tplDir)) throw new HttpError(400, "bad_request", `There is no template ${template} in the content.`);
    return names.map((name) => {
      let dir: string;
      if (name === "base") dir = path.join(tplDir, "base");
      else if (name.startsWith("@")) dir = path.join(content, name.slice(1));
      else dir = path.join(tplDir, name);
      let real: string;
      try {
        real = fs.realpathSync(dir);
      } catch {
        throw new HttpError(400, "bad_request", `The layer ${name} doesn't exist in the content.`);
      }
      if (!real.startsWith(`${content}/`) || !fs.statSync(real).isDirectory()) throw new HttpError(400, "bad_request", `The layer ${name} isn't a folder of the content.`);
      if (name === "base") return { dir: real, deleteFile: null, skip: [] };
      const overlay = path.join(real, "overlay");
      const deleteFile = isFile(path.join(real, "delete.txt")) ? path.join(real, "delete.txt") : null;
      if (isDir(overlay)) return { dir: overlay, deleteFile, skip: [] };
      return { dir: real, deleteFile, skip: ["delete.txt", "transcript.json", "extends"] };
    });
  }

  /** At runner start (and when Docker comes back): adopt running workspace containers, note stopped ones. */
  async reconcile() {
    const list = await this.docker.listContainers({
      all: true,
      filters: { label: [`${LABEL.managed}=1`, `${LABEL.kind}=workspace`, `${LABEL.ns}=${this.owner.ns}`, `${LABEL.home}=${this.home}`] },
    });
    for (const c of list) {
      const id = c.Labels[LABEL.workspace];
      const ws = id ? this.get(id) : null;
      if (!ws) {
        // Its files are gone: so is it.
        await this.docker.getContainer(c.Id).remove({ force: true }).catch(() => {});
        continue;
      }
      if (c.State === "running" && !ws.running) await ws.adopt(this.docker.getContainer(c.Id));
      else if (c.State !== "running" && ws.status === "files") ws.status = "stopped";
    }
  }

  /** Docker went down: every running workspace is stopped as far as the IDE can tell. */
  dockerDown() {
    for (const w of this.running()) w.dockerGone();
  }

  /** One pass: idle stops, long-stopped containers, old trash, and (hourly) dependency volumes unused for 30 days. */
  async sweep() {
    const now = Date.now();
    for (const w of [...this.loaded.values()]) {
      try {
        await w.sweep(now);
      } catch (err) {
        this.log.warn("workspace.sweep_failed", { id: w.id, error: (err as Error).message });
      }
    }
    await this.deps.prune(now).catch((err: Error) => this.log.warn("deps.prune_failed", { error: err.message }));
  }

  async remove(id: string) {
    const ws = this.get(id);
    if (!ws) throw new HttpError(404, "not_found", "No such workspace.");
    await ws.destroy();
    this.loaded.delete(id);
  }

  /** The runner is shutting down (Ctrl+C on npm run up): every running workspace stops. */
  async shutdown() {
    await Promise.all(this.running().map((w) => w.stop("user").catch(() => {})));
    for (const w of this.loaded.values()) w.unwatch();
    await this.deps.shutdown();
  }
}

interface Layer {
  dir: string;
  deleteFile: string | null;
  skip: string[];
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * A codebase that ships .env.example and no .env gets one copied from it, as
 * its README's first step would make it (cp .env.example .env): its scripts
 * read .env (node --env-file=.env, pydantic-settings), and real environment
 * variables still win there, so the workspace's PORT and DATABASE_URL hold.
 * It is part of the original, so resets keep it. lib/workspace-layers.mjs
 * paints the same file in the starting tree.
 */
function dotenv(dir: string) {
  const example = path.join(dir, ".env.example");
  const target = path.join(dir, ".env");
  const st = fs.lstatSync(example, { throwIfNoEntry: false });
  if (!st?.isFile() || fs.lstatSync(target, { throwIfNoEntry: false })) return;
  fs.copyFileSync(example, target);
  fs.chmodSync(target, st.mode & 0o777);
}

/** Copies one layer over the tree being built, then removes what its delete.txt lists. */
async function applyLayer(layer: Layer, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  if (!layer.skip.length) {
    await cloneTree(layer.dir, dest);
  } else {
    for (const name of fs.readdirSync(layer.dir)) {
      if (layer.skip.includes(name)) continue;
      const src = path.join(layer.dir, name);
      const to = path.join(dest, name);
      if (fs.lstatSync(src).isDirectory()) await cloneTree(src, to);
      else {
        fs.rmSync(to, { recursive: true, force: true });
        await cloneTree(src, to);
      }
    }
  }
  if (layer.deleteFile) {
    const tree = new HostFs(dest);
    for (const line of fs.readFileSync(layer.deleteFile, "utf8").split("\n")) {
      const rel = line.trim().replace(/\/+$/, "");
      if (!rel || rel.startsWith("#")) continue;
      checkRel(rel);
      if (tree.lstat(rel)) tree.remove(rel);
    }
  }
}
