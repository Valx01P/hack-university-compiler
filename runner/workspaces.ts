import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Docker from "dockerode";
import { parseScope, workspaceId } from "../lib/workspace-id.mjs";
import type { Config } from "./config.ts";
import { LABEL, type Owner } from "./docker.ts";
import { EventHub, type EventMessage, type Subscriber } from "./events.ts";
import { killTmuxSession, tmuxSession } from "./host-tmux.ts";
import { HttpError } from "./http-util.ts";
import type { Log } from "./log.ts";
import type { OpenWorkspace } from "./schemas.ts";
import {
  HEAVY,
  HostFs,
  PathError,
  WINDOWS,
  buildManifest,
  checkRel,
  cloneTree,
  manifestHash,
  sha256,
  type Entry,
  type Manifest,
} from "./storage/host.ts";
import { packTar, unpackTar, type TarEntry } from "./tar.ts";
import { TerminalSession } from "./terminals.ts";
import { Watcher } from "./watch.ts";

/**
 * Workspaces (architecture §4.2): folders on this computer, named by their
 * scope: each compiler page's own (compiler/<course>) and the playground
 * (playground). Opening one materializes its template's layers (APFS clones)
 * into HU_DATA_DIR/workspaces/<id>/original, and copies that to files/ the
 * first time, which the Explorer, the editor, and the terminal work in. No
 * container ever runs one: its terminal is a shell on this computer (kept
 * in tmux), and opening one never touches Docker. One lock per workspace
 * serializes open, reset, and the runner's own writes.
 *
 * runner/README.md ("Workspaces") is the contract for every route here.
 */

/** Where a workspace's terminals run. A shell on this computer is outside
    the sandbox, so only the compiler's own folders (compiler/<course>) and
    the playground get one, whatever a request asks for, and only with their
    files on this computer, where that shell works on them. Anything else
    gets no terminal at all. */
export function shellPlace(body: { scope: string; shell?: string; storage?: string }): "host" | "none" {
  const kind = parseScope(body.scope)?.kind;
  return body.shell === "host" && (kind === "compiler" || kind === "playground") && (body.storage ?? "host") === "host" ? "host" : "none";
}

/** A workspace is its files: nothing in it starts or stops. */
export type Status = "files";
export type FileState = "same" | "modified" | "new";

export interface WorkspaceConfig {
  storage: "host";
  /** Where terminals run: on this computer, or nowhere. */
  shell: "host" | "none";
  hidden: string[];
  readonly: string[];
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
}

export interface StatedEntry extends Entry {
  state: FileState;
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
  owner: Owner;
  log: Log;
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
  readonly status: Status = "files";
  readonly lock = new Mutex();
  readonly hub = new EventHub();
  readonly files: HostFs;
  readonly original: HostFs;
  lastActive = Date.now();
  readonly terminals = new Map<string, TerminalSession>();

  private readonly watcher: Watcher;
  private readonly hashes = new Map<string, { size: number; mtimeMs: number; sha256: string }>();

  constructor(m: Workspaces, meta: Meta) {
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
  }

  touch() {
    this.lastActive = Date.now();
  }

  private emit(message: EventMessage) {
    this.hub.emit(message);
  }

  statusMessage(): EventMessage {
    return { t: "status", status: this.status, detail: null };
  }

  saveMeta() {
    this.meta.lastActiveAt = this.lastActive;
    const file = path.join(this.dir, "meta.json");
    const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.meta), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  // Files and their states

  /**
   * A file's state against the manifest, hashing only when size or time
   * moved. On Windows modes never count: the host keeps none.
   */
  private fileState(entry: Entry): FileState {
    const orig = this.meta.manifest[entry.path];
    if (!orig) return "new";
    if (orig.type !== (entry.type === "mount" ? "dir" : entry.type)) return "modified";
    if (entry.type === "symlink") return orig.target === entry.target ? "same" : "modified";
    if (entry.type !== "file") return WINDOWS || (orig.mode & 0o777) === (entry.mode & 0o777) ? "same" : "modified";
    if (!WINDOWS && (orig.mode & 0o111) !== (entry.mode & 0o111)) return "modified";
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

  /** Every path (heavy folders listed, not opened). */
  private listAll(): { entries: Entry[]; more: Record<string, number> } {
    return this.files.list("", 64);
  }

  /** The whole tree with states, the removed paths, and the changes. */
  async snapshotTree(): Promise<{ entries: StatedEntry[]; removed: string[]; more: Record<string, number>; changes: Changes }> {
    const { entries, more } = this.listAll();
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
      const { entries, more } = this.files.list(rel, depth);
      return { path: rel, entries: entries.map((e) => ({ ...e, state: "same" as FileState })), removed: [], more };
    }
    const all = await this.snapshotTree();
    const prefix = rel ? `${rel}/` : "";
    const levels = (p: string) => p.slice(prefix.length).split("/").length;
    const within = (p: string) => (rel ? p.startsWith(prefix) : true) && levels(p) <= depth;
    if (rel) {
      const self = all.entries.find((e) => e.path === rel);
      if (!self) {
        // Not listed: missing, or below a link (which lstat refuses as outside).
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

  /** Saves a file, never through a link (storage/host.ts). */
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
      this.files.writeFile(rel, data);
      this.watcher.touch(rel);
      return { etag: sha256(data) };
    });
  }

  /** The fs operations of POST …/fs. */
  async fsOp(op: { op: string; path?: string; to?: string; mode?: number; undo?: string }): Promise<{ undo?: string }> {
    return this.lock.run(async () => {
      switch (op.op) {
        case "mkdir":
          this.files.mkdir(op.path!);
          break;
        case "rename":
          this.files.rename(op.path!, op.to!);
          break;
        case "copy":
          await this.files.copy(op.path!, op.to!);
          break;
        case "chmod":
          this.files.chmod(op.path!, op.mode!);
          break;
        case "delete": {
          if (!this.files.lstat(op.path!)) throw new PathError("not_found", `${op.path} doesn't exist.`);
          const undo = this.trash(op.path!);
          this.files.remove(op.path!);
          this.watcher.touch(op.path!);
          return undo ? { undo } : {};
        }
        case "restore":
          this.untrash(op.undo!);
          return {};
      }
      for (const p of [op.path, op.to]) if (p) this.watcher.touch(p);
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

  private untrash(token: string) {
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
    this.applyEntries(unpackTar(archive));
    fs.rmSync(path.join(dir, `${token}.json`), { force: true });
    fs.rmSync(path.join(dir, `${token}.tar`), { force: true });
    this.watcher.touch(info.path);
  }

  /** Writes tar entries into the files, never through a link. */
  private applyEntries(entries: TarEntry[]) {
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

  // Reset

  /**
   * Makes the files under `scope` match the original: removes what it
   * doesn't have, and puts back what differs. Heavy folders and .git are
   * left alone.
   */
  private converge(scope: { kind: "dir" | "file"; path: string }, dryRun: boolean): { restored: string[]; removed: string[] } {
    const manifest = this.meta.manifest;
    const inScope = (p: string) => (scope.kind === "file" ? p === scope.path : p === scope.path || p.startsWith(`${scope.path}/`));
    const { entries } = this.listAll();
    const current = new Map(entries.map((e) => [e.path, e]));
    const remove: string[] = [];
    const restore: string[] = [];
    for (const e of entries) {
      if (!inScope(e.path) || keptAside(e.path) || e.type === "mount") continue;
      const want = manifest[e.path];
      const parent = e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "";
      if (!want) {
        // Only the top of what goes: a removed folder takes its children.
        if (!parent || manifest[parent] || !inScope(parent) || keptAside(parent)) remove.push(e.path);
        continue;
      }
      const type = e.type;
      if (want.type !== type) {
        remove.push(e.path);
        restore.push(e.path);
      } else if (type === "file") {
        if (want.size !== e.size || (!WINDOWS && (want.mode & 0o777) !== (e.mode & 0o777)) || this.hashOf(e) !== want.sha256) restore.push(e.path);
      } else if (type === "symlink") {
        if (want.target !== e.target) {
          remove.push(e.path);
          restore.push(e.path);
        }
      } else if (type === "dir" && !WINDOWS && (want.mode & 0o777) !== (e.mode & 0o777)) {
        restore.push(e.path);
      }
    }
    for (const p of Object.keys(manifest)) {
      if (inScope(p) && !current.has(p) && !keptAside(p)) restore.push(p);
    }
    // Sorted, so a folder comes before what's in it.
    restore.sort();
    const result = { restored: restore.filter((p) => manifest[p].type !== "dir"), removed: remove };
    if (dryRun) return result;

    // Remove first (a folder in the way of a file, a link in place of a folder).
    for (const p of remove) if (this.files.lstat(p)) this.files.remove(p);
    for (const p of restore) {
      const want = manifest[p];
      if (want.type === "dir") {
        this.files.mkdir(p);
        this.files.chmod(p, want.mode ?? 0o755);
      } else if (want.type === "symlink") {
        if (this.files.lstat(p)) this.files.remove(p);
        this.files.symlink(p, want.target ?? "");
      } else {
        const { data, mode } = this.original.readFile(p, 512 * MiB);
        this.files.writeFile(p, data, mode);
      }
    }
    for (const p of [...remove, ...restore]) this.watcher.touch(p);
    return result;
  }

  /** POST …/reset: a file or a folder back to the original. */
  async reset(scope: "file" | "dir", rel: string, dryRun: boolean) {
    return this.lock.run(() => this.converge({ kind: scope, path: checkRel(rel) }, dryRun));
  }

  // Terminals

  async openTerminal(cols: number, rows: number, cwd?: string): Promise<string> {
    this.touch();
    if (this.meta.config.shell !== "host") throw new HttpError(409, "no_terminal", "This workspace has no terminal.");
    const shells = [...this.terminals.values()].filter((t) => !t.exited);
    if (shells.length >= MAX_TERMINALS) throw new HttpError(409, "too_many_terminals", `A workspace has at most ${MAX_TERMINALS} terminals. Close one first.`);
    // Your own shell, in this workspace's folder on this computer.
    const dir = cwd ? path.join(this.dir, "files", ...checkRel(cwd).split("/")) : path.join(this.dir, "files");
    let session: TerminalSession;
    try {
      // Kept in tmux when it's here, one session for the workspace, so it
      // outlives the page and the runner (runner/host-tmux.ts).
      session = TerminalSession.host({ cols, rows, cwd: isDir(dir) ? dir : path.join(this.dir, "files"), tmux: tmuxSession(this.id) });
    } catch (err) {
      throw new HttpError(500, "terminal_failed", `Couldn't start a shell: ${(err as Error).message}`);
    }
    session.onInput = () => this.touch();
    session.onExit = (code) => this.emit({ t: "terminal", sid: session.sid, state: "exited", code });
    this.terminals.set(session.sid, session);
    return session.sid;
  }

  session(sid: string): TerminalSession | undefined {
    return this.terminals.get(sid);
  }

  async closeTerminal(sid: string) {
    const session = this.terminals.get(sid);
    if (!session) throw new PathError("not_found", "No such terminal.");
    this.terminals.delete(sid);
    await session.kill();
    // Closed on purpose: the shell it kept in tmux ends too.
    if (session.inTmux) await killTmuxSession(tmuxSession(this.id));
  }

  /** The last socket left a shell this long ago: end it (a shell in tmux
      keeps running there, for the next terminal to attach to). */
  expireTerminal(sid: string) {
    const session = this.terminals.get(sid);
    if (!session || session.attached) return;
    this.terminals.delete(sid);
    void session.kill();
  }

  terminalList() {
    return [...this.terminals.values()].map((s) => s.info);
  }

  /** Ends the shells (the runner is going away), or lets go of them when
      they're in tmux, which keeps them. */
  async endHostShells() {
    const shells = [...this.terminals.values()];
    this.terminals.clear();
    await Promise.all(shells.map((s) => s.kill()));
  }

  // Events

  subscribe(sub: Subscriber, since?: number) {
    const missed = this.hub.subscribe(sub, since);
    if (!this.watcher.running) this.watcher.start(this.listAll().entries);
    return missed;
  }

  unsubscribe(sub: Subscriber) {
    this.hub.unsubscribe(sub);
    if (this.hub.size === 0) this.watcher.stop();
  }

  unwatch() {
    this.watcher.stop();
  }

  /** A page that shows the workspace says so now and then. */
  heartbeat() {
    this.touch();
  }

  /** Removes everything: the files, and a shell kept in tmux. */
  async destroy() {
    await this.endHostShells().catch(() => {});
    await killTmuxSession(tmuxSession(this.id)).catch(() => {});
    await this.lock.run(() => {
      this.watcher.stop();
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

  /** Old trash goes (the reaper calls this). */
  sweep(now: number) {
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
  }
}

/** Paths that resets and the changes list leave alone: .git, and dependency and build folders at the root. */
function keptAside(p: string): boolean {
  const first = p.split("/")[0];
  return KEEP_ROOT.has(first) || HEAVY.has(first);
}

/**
 * A template's hidden files (the notes for AI tools, AGENTS.md and
 * CLAUDE.md) are the app's, not the learner's: when the template changes
 * one, a copy that's still as the old template had it takes the new one
 * (and goes when the template drops it). One the learner edited, or
 * removed, is theirs and stays as it is.
 */
export function refreshHiddenNotes(files: string, before: string, after: string, changed: string[], hidden: string[]) {
  const root = path.resolve(files);
  for (const rel of changed) {
    if (!hidden.some((h) => rel === h || rel.startsWith(`${h}/`))) continue;
    const mine = path.resolve(root, ...rel.split("/"));
    if (!mine.startsWith(`${root}${path.sep}`)) continue;
    const read = (file: string) => (isFile(file) ? fs.readFileSync(file) : null);
    try {
      const current = read(mine);
      const old = read(path.join(before, ...rel.split("/")));
      if (current === null ? old !== null : old === null || !current.equals(old)) continue;
      const next = path.join(after, ...rel.split("/"));
      if (isFile(next)) {
        fs.mkdirSync(path.dirname(mine), { recursive: true });
        fs.copyFileSync(next, mine);
      } else if (current !== null) fs.rmSync(mine, { force: true });
    } catch {
      /* left as it was */
    }
  }
}

/** Every workspace this runner keeps, on disk and in memory. */
export class Workspaces {
  readonly root: string;
  readonly config: Config;
  readonly owner: Owner;
  readonly log: Log;
  /** 8 hex characters of the data folder, which the containers of before are labeled with. */
  readonly home: string;
  private readonly loaded = new Map<string, Workspace>();
  private readonly opening = new Map<string, Promise<unknown>>();

  constructor(deps: ManagerDeps) {
    this.config = deps.config;
    this.owner = deps.owner;
    this.log = deps.log;
    this.root = path.join(deps.config.dataDir, "workspaces");
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    this.home = createHash("sha256").update(deps.config.dataDir).digest("hex").slice(0, 8);
  }

  /**
   * The workspace with this id, from memory or its meta.json. A folder
   * from before (a lesson's, a challenge's, a course's playground) has a
   * scope that's no longer one: it's left alone, never opened and never
   * removed (npm run clean asks the learner about those).
   */
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
    if (typeof meta?.scope !== "string" || !parseScope(meta.scope) || workspaceId(meta.scope) !== id) return null;
    const ws = new Workspace(this, meta);
    ws.lastActive = meta.lastActiveAt ?? Date.now();
    this.loaded.set(id, ws);
    return ws;
  }

  all(): Workspace[] {
    for (const name of fs.readdirSync(this.root)) this.get(name);
    return [...this.loaded.values()];
  }

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
    // The playground has no course: "playground" stands in for one.
    const course = body.course ?? scope.course;
    if (course !== scope.course) throw new HttpError(400, "bad_request", "The course isn't the scope's.");
    if (body.template.split("/")[0] !== course) throw new HttpError(400, "bad_request", "The template belongs to another course.");
    const config: WorkspaceConfig = { storage: "host", shell: shellPlace(body), hidden: body.hidden ?? [], readonly: body.readonly ?? [] };
    const layers = this.resolveLayers(body.template, body.layers);

    let ws = this.get(id);
    let created = false;
    let updated: string[] = [];
    const build = async () => {
      const tmp = path.join(this.root, `.${id}.${randomBytes(4).toString("hex")}.tmp`);
      try {
        for (const layer of layers) await applyLayer(layer, tmp);
        fs.mkdirSync(tmp, { recursive: true });
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
          refreshHiddenNotes(path.join(existing.dir, "files"), aside, original, updated, config.hidden);
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
      tree: tree.entries,
      removed: tree.removed,
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
      if (!real.startsWith(`${content}${path.sep}`) || !fs.statSync(real).isDirectory()) throw new HttpError(400, "bad_request", `The layer ${name} isn't a folder of the content.`);
      if (name === "base") return { dir: real, deleteFile: null, skip: [] };
      const overlay = path.join(real, "overlay");
      const deleteFile = isFile(path.join(real, "delete.txt")) ? path.join(real, "delete.txt") : null;
      if (isDir(overlay)) return { dir: overlay, deleteFile, skip: [] };
      return { dir: real, deleteFile, skip: ["delete.txt", "transcript.json", "extends"] };
    });
  }

  /**
   * When Docker is (back) up: the containers workspaces ran in before they
   * were folders on this computer (hu-ws-<id>) go. Their files were these
   * folders, bind-mounted, so nothing of the learner's goes with them. Only
   * this namespace's and this data folder's, found by their labels.
   */
  async reconcile(docker: Docker) {
    const list = await docker.listContainers({
      all: true,
      filters: { label: [`${LABEL.managed}=1`, `${LABEL.kind}=workspace`, `${LABEL.ns}=${this.owner.ns}`, `${LABEL.home}=${this.home}`] },
    });
    for (const c of list) {
      const name = c.Names[0]?.replace(/^\//, "") ?? c.Id;
      await docker
        .getContainer(c.Id)
        .remove({ force: true })
        .then(
          () => this.log.info("workspace.old_container_removed", { name }),
          () => {}
        );
    }
  }

  /** One pass of the reaper: old trash. */
  sweep() {
    const now = Date.now();
    for (const w of [...this.loaded.values()]) {
      try {
        w.sweep(now);
      } catch (err) {
        this.log.warn("workspace.sweep_failed", { id: w.id, error: (err as Error).message });
      }
    }
  }

  async remove(id: string) {
    const ws = this.get(id);
    if (!ws) throw new HttpError(404, "not_found", "No such workspace.");
    await ws.destroy();
    this.loaded.delete(id);
  }

  /** The runner is shutting down (Ctrl+C on npm run up): shells end, or stay in tmux. */
  async shutdown() {
    await Promise.all([...this.loaded.values()].map((w) => w.endHostShells().catch(() => {})));
    for (const w of this.loaded.values()) w.unwatch();
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
