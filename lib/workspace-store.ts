"use client";

import { useSyncExternalStore } from "react";
import { compareNames } from "@/lib/file-order.mjs";
import type { StartingTree, TreeEntry, WorkspaceProps, WorkspaceStatus } from "@/lib/workspace-types";
import { openWorkspace, workspaceApi, WorkspaceError, type FileRead } from "@/lib/workspace-client";
import { WorkspaceEvents, type FsEvent, type RunnerEvent, type SocketState } from "@/lib/runner-socket";

/**
 * Everything one open folder knows, in the browser (a compiler's own, or the
 * playground): its tree, the files open in the editor, its status, and its
 * terminals. The runner is the source of truth for files on disk: the store
 * opens the folder, listens on its events socket, and keeps the Explorer and
 * the editor in step with what the terminal changes.
 *
 * Components read it with useStore(store, slice), which re-renders them when
 * that slice changes. Open tabs, unsaved buffers, the folders you opened, and
 * the terminals are kept in localStorage per workspace (hu-ws-v1:<id>), so a
 * reload loses nothing you typed. Pane sizes are lib/panes.ts's.
 */

export type Slice = "tree" | "files" | "status" | "terminals" | "notice";

export interface FileNode {
  path: string;
  name: string;
  type: TreeEntry["type"];
  size?: number;
  mtimeMs?: number;
  mode?: number;
  state?: "same" | "modified" | "new";
  target?: string;
  outside?: boolean;
  /** A folder whose children are listed only when it's opened. */
  lazy?: boolean;
}

export interface FileBuffer {
  path: string;
  status: "loading" | "ready" | "binary" | "error";
  /** The text on disk, as last read or saved. */
  saved: string;
  etag: string | null;
  dirty: boolean;
  saving: boolean;
  error?: string;
  binary?: { size: number; mime: string };
  /** The disk changed while this had unsaved edits. */
  conflict?: { text: string; etag: string | null } | null;
  /** The file is gone on disk. */
  deleted?: boolean;
  /** The starting version, for the comments switch (null when new). */
  original?: string | null;
}

/** What the editor does for the store: it holds the documents. */
export interface EditorHost {
  text(path: string): string | null;
  replace(path: string, text: string, opts?: { clean?: boolean }): void;
  rename(from: string, to: string): void;
  close(path: string): void;
  reveal(path: string, line?: number): void;
}

export interface TerminalTab {
  sid: string;
  title: string;
}

interface Persisted {
  tabs?: string[];
  active?: string | null;
  expanded?: string[];
  unsaved?: Record<string, { text: string; etag: string | null }>;
  terminals?: TerminalTab[];
}

const STORAGE = (id: string) => `hu-ws-v1:${id}`;
// Folders the runner lists only on demand (and never watches deeply).
const HEAVY = new Set(["node_modules", ".git", ".venv", "target", ".next", "dist", "__pycache__", ".gradle", "build"]);
const AUTOSAVE_MS = 1000;

const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const nameOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);

function readPersisted(id: string): Persisted {
  try {
    return JSON.parse(localStorage.getItem(STORAGE(id)) ?? "{}") as Persisted;
  } catch {
    return {};
  }
}

export class WorkspaceStore {
  readonly id: string;
  readonly scope: string;
  readonly props: WorkspaceProps;

  // The tree.
  nodes = new Map<string, FileNode>();
  kids = new Map<string, string[]>();
  removed: string[] = [];
  /** Folders with something changed inside: "modified" or "new". */
  rollup = new Map<string, "modified" | "new">();
  /** The runner's tree has arrived (until then, the starting tree shows). */
  live = false;
  expanded = new Set<string>();

  // The editor.
  buffers = new Map<string, FileBuffer>();
  tabs: string[] = [];
  active: string | null = null;
  host: EditorHost | null = null;
  /** A file and line to show once its editor is ready (a URL, a link). */
  pendingLine: { path: string; line: number } | null = null;

  // The workspace and its runner.
  runner: "connecting" | "online" | "offline" = "connecting";
  /** The runner's status (the terminals still running) has come in. */
  settled = false;
  runnerMessage = "";
  socket: SocketState = "closed";
  status: WorkspaceStatus = "absent";
  terminals: TerminalTab[] = [];
  /** Terminals whose shell exited (the runner said so), as opposed to ones
      only gone from the runner's list (it restarted), whose shell may still
      run in tmux (the compiler's Terminal attaches again to those). */
  exitedTerminals = new Set<string>();

  /** A short message for the screen reader and the status line. */
  notice = "";

  private versions = new Map<Slice, number>();
  private listeners = new Map<Slice, Set<() => void>>();
  private events: WorkspaceEvents | null = null;
  private autosaveTimers = new Map<string, number>();
  private diskTimers = new Map<string, number>();
  private persistTimer = 0;
  private treeTimer = 0;
  private persisted: Persisted;
  private restored = false;
  /** Paths this tab saved, and the text it saved, so their own echo from the
      watcher isn't taken for someone else's change. */
  private ownWrites = new Map<string, string>();
  autosave: boolean;
  /** What else follows the folder's file events (the compiler's review of
      changes made outside the editor, lib/outside-changes.ts). */
  readonly fsWatchers = new Set<(events: FsEvent[]) => void>();
  /** Told the paths (or folders) the page itself is about to change, an
      Explorer action's, so they aren't taken for someone else's. */
  readonly ownChangeWatchers = new Set<(paths: string[]) => void>();
  private ownChange(...paths: string[]) {
    for (const fn of this.ownChangeWatchers) fn(paths);
  }
  /** The texts this tab has for `path` now: what it's saving, what it last
      saved, and the editor's. Read when a change arrives, before the store
      takes it in, they tell this tab's own writes from anyone else's. */
  pageTexts(path: string): string[] {
    const texts = [this.ownWrites.get(path), this.buffers.get(path)?.saved, this.host?.text(path) ?? undefined];
    return texts.filter((t): t is string => typeof t === "string");
  }

  constructor(props: WorkspaceProps, opts: { autosave?: boolean } = {}) {
    this.id = props.id;
    this.scope = props.scope;
    this.props = props;
    this.autosave = opts.autosave ?? props.template.autosave;
    this.setStartingTree(props.tree);
    // What the server rendered: the template's open files and their folders.
    // hydrate() brings back your own tabs before the first paint.
    this.persisted = {};
    const known = (p: string) => this.nodes.get(p)?.type === "file";
    this.tabs = props.template.open.filter(known);
    this.active = this.tabs.at(-1) ?? null;
    this.expanded = new Set(this.defaultExpanded());
  }

  /** Your tabs, folders, and terminals from before (localStorage), after
      hydration and before the folder shows, so the server markup and the
      first client render match. */
  hydrate() {
    if (this.restored) return;
    this.restored = true;
    this.persisted = readPersisted(this.id);
    // Your tabs as you left them, closed ones closed, files the starting
    // tree doesn't have included (most of a playground's): the live tree
    // closes those that are gone (connect).
    const tabs = (this.persisted.tabs ?? []).filter((p) => typeof p === "string");
    if (this.persisted.tabs) this.tabs = tabs.filter((p, i) => tabs.indexOf(p) === i);
    if (this.persisted.active && this.tabs.includes(this.persisted.active)) this.active = this.persisted.active;
    else if (!this.tabs.includes(this.active ?? "")) this.active = this.tabs.at(-1) ?? null;
    if (this.persisted.expanded) this.expanded = new Set(this.persisted.expanded);
    this.terminals = this.persisted.terminals ?? [];
    this.emit("tree", "files", "terminals");
  }

  // -- Subscriptions -------------------------------------------------------

  subscribe(slice: Slice, fn: () => void) {
    let set = this.listeners.get(slice);
    if (!set) this.listeners.set(slice, (set = new Set()));
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }

  version(slice: Slice) {
    return this.versions.get(slice) ?? 0;
  }

  emit(...slices: Slice[]) {
    for (const slice of slices) {
      this.versions.set(slice, this.version(slice) + 1);
      for (const fn of this.listeners.get(slice) ?? []) fn();
    }
  }

  announce(text: string) {
    this.notice = text;
    this.emit("notice");
  }

  // -- Lifecycle -------------------------------------------------------------

  /** Opens the folder on the runner and starts listening. */
  async connect(signal?: AbortSignal) {
    this.runner = "connecting";
    this.emit("status");
    try {
      const opened = await openWorkspace(this.scope, signal);
      this.runner = "online";
      this.runnerMessage = "";
      this.status = (opened.status as WorkspaceStatus) ?? "files";
      this.setTree(opened.tree, opened.removed);
      // Tabs of files that are gone close, unless they hold unsaved text.
      const gone = this.tabs.filter((p) => this.nodes.get(p)?.type !== "file" && !this.persisted.unsaved?.[p]);
      if (gone.length) {
        this.tabs = this.tabs.filter((p) => !gone.includes(p));
        if (this.active && !this.tabs.includes(this.active)) this.active = this.tabs.at(-1) ?? null;
        this.persist();
        this.emit("files");
      }
      this.emit("status");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      this.runner = "offline";
      this.runnerMessage = err instanceof WorkspaceError ? err.message : "The workspace runner isn't running. Start it with npm run up.";
      this.emit("status");
      return;
    }
    // Terminals that kept running (a reload) come back.
    void workspaceApi
      .status(this.id)
      .then((s) => this.adoptStatus(s))
      .catch(() => {})
      .finally(() => {
        this.settled = true;
        this.emit("status");
      });
    this.events = new WorkspaceEvents(this.id, (e) => this.onEvent(e), (state, error) => {
      this.socket = state;
      if (error && error.code === "runner_down") {
        this.runner = "offline";
        this.runnerMessage = error.message;
      } else if (state === "open") this.runner = "online";
      this.emit("status");
    });
    this.events.start();
    for (const path of this.tabs) void this.load(path);
  }

  dispose() {
    this.events?.stop();
    for (const t of this.autosaveTimers.values()) window.clearTimeout(t);
    window.clearTimeout(this.persistTimer);
    window.clearTimeout(this.treeTimer);
    this.flushPersist();
  }

  private adoptStatus(s: Record<string, unknown>) {
    if (typeof s.status === "string") this.status = s.status as WorkspaceStatus;
    const terminals = Array.isArray(s.terminals) ? (s.terminals as { sid?: string; exited?: boolean }[]) : [];
    const live = new Set(terminals.filter((t) => !t.exited).map((t) => t.sid).filter((sid): sid is string => typeof sid === "string"));
    const before = this.terminals.length;
    // Keep the tabs whose sessions still run, in their order, with their names.
    this.terminals = this.terminals.filter((t) => live.has(t.sid));
    for (const sid of live) if (!this.terminals.some((t) => t.sid === sid)) this.terminals.push({ sid, title: this.nextTerminalTitle() });
    if (this.terminals.length !== before || live.size) this.emit("terminals");
    this.persist();
    this.emit("status");
  }

  private onEvent(e: RunnerEvent) {
    switch (e.t) {
      case "ready":
        // Whatever changed while no socket listened (the runner says resync
        // when it no longer has every batch since then).
        this.refreshTree(e.resync ? 0 : 250);
        break;
      case "terminal":
        if (e.state === "exited") {
          this.exitedTerminals.add(e.sid);
          this.terminalGone(e.sid);
        }
        break;
      case "status":
        this.status = e.status as WorkspaceStatus;
        this.emit("status");
        break;
      case "fs":
        this.applyFs(e.events);
        break;
    }
  }

  // -- The tree --------------------------------------------------------------

  private setStartingTree(tree: StartingTree) {
    this.setTree(
      tree.entries.map((e) => ({ name: nameOf(e.path), path: e.path, type: e.type, size: e.size, mode: e.mode, state: "same" as const })),
      [],
      false
    );
  }

  private defaultExpanded(): string[] {
    // The folders of the files that open first.
    const out = new Set<string>();
    for (const p of this.props.template.open) {
      let dir = parentOf(p);
      while (dir) {
        out.add(dir);
        dir = parentOf(dir);
      }
    }
    return [...out];
  }

  setTree(entries: TreeEntry[], removed: string[], live = true) {
    const keep = new Map<string, FileNode>();
    // Lazy folders keep what was listed in them.
    for (const [p, n] of this.nodes) {
      const top = p.split("/")[0];
      if (HEAVY.has(top) && p !== top) keep.set(p, n);
    }
    this.nodes = new Map(keep);
    for (const e of entries) {
      if (!e.path || e.path.includes("\0")) continue;
      const node: FileNode = { ...e, name: e.name ?? nameOf(e.path) };
      if (node.type === "mount" || (e as { heavy?: boolean }).heavy || (node.type === "dir" && HEAVY.has(node.name))) node.lazy = true;
      this.nodes.set(e.path, node);
      // A file listed without its folders still shows.
      let dir = parentOf(e.path);
      while (dir && !this.nodes.has(dir)) {
        this.nodes.set(dir, { path: dir, name: nameOf(dir), type: "dir", state: "same" });
        dir = parentOf(dir);
      }
    }
    this.removed = [...removed].sort();
    if (live) this.live = true;
    this.reindex();
  }

  private reindex() {
    this.kids = new Map([["", []]]);
    for (const p of this.nodes.keys()) {
      const parent = parentOf(p);
      if (!this.kids.has(parent)) this.kids.set(parent, []);
      this.kids.get(parent)!.push(p);
    }
    const isDir = (p: string) => {
      const t = this.nodes.get(p)?.type;
      return t === "dir" || t === "mount";
    };
    for (const list of this.kids.values()) list.sort((a, b) => (isDir(a) ? 0 : 1) - (isDir(b) ? 0 : 1) || compareNames(a, b));
    this.rollup = new Map();
    for (const node of this.nodes.values()) {
      if (node.state !== "modified" && node.state !== "new") continue;
      if (node.type === "dir" && node.state === "modified") continue;
      let dir = parentOf(node.path);
      while (dir) {
        if (this.rollup.get(dir) !== "modified") this.rollup.set(dir, node.state === "new" && !this.rollup.has(dir) ? "new" : "modified");
        dir = parentOf(dir);
      }
    }
    for (const p of this.removed) {
      let dir = parentOf(p);
      while (dir) {
        this.rollup.set(dir, "modified");
        dir = parentOf(dir);
      }
    }
    this.emit("tree");
  }

  children(path: string): string[] {
    return this.kids.get(path) ?? [];
  }

  isDir(path: string) {
    const t = path === "" ? "dir" : this.nodes.get(path)?.type;
    return t === "dir" || t === "mount";
  }

  /** The runner's current tree, a moment after a burst of changes. */
  refreshTree(delay = 250) {
    if (this.runner !== "online") return;
    window.clearTimeout(this.treeTimer);
    this.treeTimer = window.setTimeout(async () => {
      try {
        const { tree, removed } = await workspaceApi.tree(this.id);
        this.setTree(tree, removed);
      } catch {
        /* the next event tries again */
      }
    }, delay);
  }

  /** Lists a lazy folder (node_modules) when it's opened. */
  async loadFolder(path: string) {
    try {
      const { tree } = await workspaceApi.tree(this.id, path, 1);
      for (const e of tree) {
        if (!e.path.startsWith(`${path}/`)) continue;
        this.nodes.set(e.path, { ...e, name: e.name ?? nameOf(e.path), lazy: e.type === "dir" || e.type === "mount" });
      }
      const node = this.nodes.get(path);
      if (node) node.lazy = false;
      this.reindex();
    } catch {
      /* stays as it was */
    }
  }

  private applyFs(events: FsEvent[]) {
    for (const fn of this.fsWatchers) fn(events);
    // An unlink and an add of the same size in one batch is a move: open
    // files follow it.
    const gone = events.filter(([kind]) => kind === "unlink").map(([, p]) => p);
    const added = events.filter(([kind]) => kind === "add");
    for (const from of gone) {
      if (!this.buffers.has(from)) continue;
      const size = this.nodes.get(from)?.size;
      const to = added.find(([, p, m]) => m?.size === size && !this.nodes.has(p))?.[1];
      if (to) this.moveBuffer(from, to);
    }
    let touched = false;
    for (const [kind, p, m] of events) {
      if (!p) continue;
      touched = true;
      if (kind === "unlink" || kind === "unlinkDir") {
        for (const key of [...this.nodes.keys()]) if (key === p || key.startsWith(`${p}/`)) this.nodes.delete(key);
        window.clearTimeout(this.diskTimers.get(p));
        const buf = this.buffers.get(p);
        if (buf && !buf.deleted) {
          buf.deleted = true;
          this.emit("files");
        }
      } else {
        const known = this.nodes.get(p);
        const isNew = !this.props.tree.entries.some((e) => e.path === p);
        // The runner sends each path's tree row, its mark included.
        const guess = known ? (kind === "change" ? (known.state === "new" ? "new" : "modified") : known.state) : isNew ? "new" : "modified";
        this.nodes.set(p, {
          ...(known ?? {}),
          path: p,
          name: nameOf(p),
          type: kind === "addDir" ? "dir" : ((m?.type as FileNode["type"]) ?? known?.type ?? "file"),
          size: m?.size ?? known?.size,
          mtimeMs: m?.mtimeMs ?? known?.mtimeMs,
          mode: m?.mode ?? known?.mode,
          state: (m?.state as FileNode["state"]) ?? guess,
          ...(m?.target ? { target: m.target, outside: m.outside } : {}),
          ...(m?.heavy ? { lazy: true } : {}),
        });
        let dir = parentOf(p);
        while (dir && !this.nodes.has(dir)) {
          this.nodes.set(dir, { path: dir, name: nameOf(dir), type: "dir", state: "new" });
          dir = parentOf(dir);
        }
        const buf = this.buffers.get(p);
        if (buf) {
          if (buf.deleted) {
            buf.deleted = false;
            this.emit("files");
          }
          // A moment later, so an unlink right behind it (a rename, a
          // delete) cancels the read instead of racing it.
          if (kind === "change" || kind === "add") {
            window.clearTimeout(this.diskTimers.get(p));
            this.diskTimers.set(
              p,
              window.setTimeout(() => {
                if (this.nodes.has(p)) void this.diskChanged(p);
              }, 120)
            );
          }
        }
      }
    }
    if (touched) {
      this.reindex();
      // The marks (M, U, removed) come from the runner, which knows the hashes.
      this.refreshTree();
    }
  }

  // -- Files and buffers -------------------------------------------------------

  /** Opens a file in a tab and makes it active. */
  openFile(path: string, opts: { line?: number } = {}) {
    if (!this.nodes.has(path) && !this.buffers.has(path)) return;
    if (!this.tabs.includes(path)) {
      const at = this.active ? this.tabs.indexOf(this.active) + 1 : this.tabs.length;
      this.tabs.splice(at, 0, path);
    }
    this.active = path;
    if (opts.line) this.pendingLine = { path, line: opts.line };
    // The folders it's in open, so the explorer shows where it is.
    let dir = parentOf(path);
    let opened = false;
    while (dir) {
      if (!this.expanded.has(dir)) {
        this.expanded.add(dir);
        opened = true;
      }
      dir = parentOf(dir);
    }
    if (opened) this.emit("tree");
    void this.load(path);
    this.persist();
    this.emit("files");
    if (opts.line) this.host?.reveal(path, opts.line);
  }

  closeFile(path: string) {
    const i = this.tabs.indexOf(path);
    if (i < 0) return;
    this.tabs.splice(i, 1);
    if (this.active === path) this.active = this.tabs[Math.min(i, this.tabs.length - 1)] ?? null;
    const buf = this.buffers.get(path);
    // An unsaved file stays in memory (and in storage) until it's saved or
    // reset, so closing a tab never loses typing.
    if (buf && !buf.dirty) {
      this.buffers.delete(path);
      this.host?.close(path);
    }
    this.persist();
    this.emit("files");
  }

  setActive(path: string) {
    if (!this.tabs.includes(path)) return this.openFile(path);
    this.active = path;
    this.persist();
    this.emit("files");
  }

  moveTab(path: string, to: number) {
    const from = this.tabs.indexOf(path);
    if (from < 0) return;
    this.tabs.splice(from, 1);
    this.tabs.splice(Math.max(0, Math.min(to, this.tabs.length)), 0, path);
    this.persist();
    this.emit("files");
  }

  /** Reads a file into its buffer (once), applying unsaved text kept from
      before a reload. */
  async load(path: string) {
    if (this.buffers.has(path)) return;
    const buf: FileBuffer = { path, status: "loading", saved: "", etag: null, dirty: false, saving: false };
    this.buffers.set(path, buf);
    this.emit("files");
    if (this.runner === "offline") {
      buf.status = "error";
      buf.error = this.runnerMessage;
      return this.emit("files");
    }
    // The starting version comes with it, so the comments switch is right
    // from the first frame.
    const fromTree = this.props.tree.entries.some((e) => e.path === path);
    const original = fromTree ? workspaceApi.readOriginal(this.id, path).catch(() => null) : Promise.resolve(null);
    let read: FileRead;
    try {
      read = await workspaceApi.readFile(this.id, path);
      const orig = await original;
      buf.original = orig && orig.kind === "text" ? orig.text : null;
    } catch (err) {
      const kept = this.persisted.unsaved?.[path];
      if (kept && err instanceof WorkspaceError && err.status === 404) {
        // A file you typed into that's gone on disk: keep your text.
        buf.status = "ready";
        buf.deleted = true;
        buf.dirty = true;
        this.host?.replace(path, kept.text);
        return this.emit("files");
      }
      buf.status = "error";
      buf.error = err instanceof WorkspaceError ? err.message : "Couldn't open this file.";
      return this.emit("files");
    }
    if (read.kind === "binary") {
      buf.status = "binary";
      buf.binary = { size: read.size, mime: read.mime };
      return this.emit("files");
    }
    buf.status = "ready";
    buf.saved = read.text;
    buf.etag = read.etag;
    const kept = this.persisted.unsaved?.[path];
    if (kept && kept.text !== read.text) {
      buf.dirty = true;
      if (kept.etag && read.etag && kept.etag !== read.etag) buf.conflict = { text: read.text, etag: read.etag };
    }
    this.emit("files");
  }

  /** The text the editor starts a file's document from. */
  initialText(path: string): string {
    const buf = this.buffers.get(path);
    const kept = this.persisted.unsaved?.[path];
    if (buf?.dirty && kept) return kept.text;
    return buf?.saved ?? "";
  }

  /** The editor's text changed. */
  edited(path: string, text: string) {
    const buf = this.buffers.get(path);
    if (!buf || buf.status !== "ready") return;
    const dirty = text.length !== buf.saved.length || text !== buf.saved;
    if (dirty !== buf.dirty) {
      buf.dirty = dirty;
      this.emit("files");
    }
    this.persist();
    if (dirty && this.autosave && !buf.conflict && !buf.deleted) {
      window.clearTimeout(this.autosaveTimers.get(path));
      this.autosaveTimers.set(
        path,
        window.setTimeout(() => void this.save(path), AUTOSAVE_MS)
      );
    }
  }

  /** Writes a buffer to disk, with the ETag it started from. */
  async save(path: string, opts: { force?: boolean } = {}): Promise<boolean> {
    window.clearTimeout(this.autosaveTimers.get(path));
    const buf = this.buffers.get(path);
    if (!buf || buf.status !== "ready" || buf.saving) return false;
    const text = this.host?.text(path) ?? null;
    if (text === null) return false;
    if (!opts.force && (!buf.dirty || buf.conflict)) return !buf.dirty;
    buf.saving = true;
    this.emit("files");
    try {
      this.ownWrites.set(path, text);
      const { etag } = await workspaceApi.writeFile(this.id, path, text, opts.force ? (buf.conflict?.etag ?? null) : buf.etag);
      buf.saved = text;
      buf.etag = etag;
      buf.conflict = null;
      buf.deleted = false;
      const now = this.host?.text(path) ?? text;
      buf.dirty = now !== text;
      if (!this.nodes.has(path)) this.refreshTree(0);
      return true;
    } catch (err) {
      this.ownWrites.delete(path);
      if (err instanceof WorkspaceError && err.code === "conflict") {
        await this.fetchConflict(path);
      } else {
        this.announce(err instanceof WorkspaceError ? err.message : `Couldn't save ${nameOf(path)}.`);
      }
      return false;
    } finally {
      buf.saving = false;
      this.persist();
      this.emit("files");
    }
  }

  async saveAll() {
    await Promise.all([...this.buffers.values()].filter((b) => b.dirty).map((b) => this.save(b.path)));
  }

  /** Something else changed an open file on disk (the terminal, a tool). */
  private async diskChanged(path: string) {
    const buf = this.buffers.get(path);
    if (!buf || buf.status !== "ready" || buf.saving) return;
    let read: FileRead;
    try {
      read = await workspaceApi.readFile(this.id, path);
    } catch {
      return;
    }
    if (read.kind !== "text") return;
    const own = this.ownWrites.get(path);
    if (own !== undefined && own === read.text) {
      this.ownWrites.delete(path);
      buf.etag = read.etag;
      return;
    }
    if (read.text === buf.saved) {
      buf.etag = read.etag;
      return;
    }
    if (!buf.dirty) {
      // A clean buffer follows the disk, in place.
      buf.saved = read.text;
      buf.etag = read.etag;
      this.host?.replace(path, read.text, { clean: true });
    } else {
      buf.conflict = { text: read.text, etag: read.etag };
    }
    this.emit("files");
  }

  private async fetchConflict(path: string) {
    const buf = this.buffers.get(path);
    if (!buf) return;
    try {
      const read = await workspaceApi.readFile(this.id, path);
      if (read.kind === "text") buf.conflict = { text: read.text, etag: read.etag };
    } catch {
      buf.conflict = { text: "", etag: null };
    }
    this.emit("files");
  }

  /** Keep mine: write the buffer over what's on disk. */
  keepMine(path: string) {
    return this.save(path, { force: true });
  }

  /** Load from disk: drop the unsaved edits for what's on disk. */
  loadFromDisk(path: string) {
    const buf = this.buffers.get(path);
    if (!buf?.conflict) return;
    buf.saved = buf.conflict.text;
    buf.etag = buf.conflict.etag;
    buf.conflict = null;
    buf.dirty = false;
    this.host?.replace(path, buf.saved, { clean: true });
    this.persist();
    this.emit("files");
  }

  /** Puts a file deleted on disk back, from the editor's text. */
  restoreDeleted(path: string) {
    const buf = this.buffers.get(path);
    if (!buf) return;
    buf.etag = null;
    buf.dirty = true;
    return this.save(path, { force: true });
  }

  private moveBuffer(from: string, to: string) {
    const buf = this.buffers.get(from);
    if (!buf) return;
    this.buffers.delete(from);
    this.buffers.set(to, { ...buf, path: to, deleted: false });
    this.tabs = this.tabs.map((t) => (t === from ? to : t));
    if (this.active === from) this.active = to;
    this.host?.rename(from, to);
    this.persist();
    this.emit("files");
  }

  // -- File operations from the explorer --------------------------------------

  private async op(run: () => Promise<unknown>, done?: string): Promise<boolean> {
    try {
      await run();
      if (done) this.announce(done);
      this.refreshTree(50);
      return true;
    } catch (err) {
      this.announce(err instanceof WorkspaceError ? err.message : "That didn't work. Try again.");
      return false;
    }
  }

  async createFile(path: string) {
    this.ownChange(path);
    const ok = await this.op(() => workspaceApi.writeFile(this.id, path, "", null), `Created ${path}`);
    if (ok) {
      this.nodes.set(path, { path, name: nameOf(path), type: "file", size: 0, state: "new" });
      let dir = parentOf(path);
      while (dir && !this.nodes.has(dir)) {
        this.nodes.set(dir, { path: dir, name: nameOf(dir), type: "dir", state: "new" });
        dir = parentOf(dir);
      }
      this.reindex();
      this.openFile(path);
    }
    return ok;
  }

  async createFolder(path: string) {
    const ok = await this.op(() => workspaceApi.fs(this.id, { op: "mkdir", path }), `Created ${path}/`);
    if (ok) {
      this.nodes.set(path, { path, name: nameOf(path), type: "dir", state: "new" });
      let dir = path;
      while (dir) {
        this.expanded.add(dir);
        dir = parentOf(dir);
      }
      this.reindex();
      this.persist();
    }
    return ok;
  }

  async rename(from: string, to: string) {
    if (from === to) return true;
    // Save first, so the file that moves is the one you see.
    for (const [p, b] of this.buffers) if ((p === from || p.startsWith(`${from}/`)) && b.dirty) await this.save(p);
    this.ownChange(from, to);
    const ok = await this.op(() => workspaceApi.fs(this.id, { op: "rename", path: from, to }), `Renamed to ${to}`);
    if (ok) {
      for (const p of [...this.buffers.keys()]) if (p === from || p.startsWith(`${from}/`)) this.moveBuffer(p, to + p.slice(from.length));
      for (const p of [...this.nodes.keys()]) {
        if (p !== from && !p.startsWith(`${from}/`)) continue;
        const node = this.nodes.get(p)!;
        this.nodes.delete(p);
        const np = to + p.slice(from.length);
        this.nodes.set(np, { ...node, path: np, name: nameOf(np) });
      }
      if (this.expanded.has(from)) {
        this.expanded.delete(from);
        this.expanded.add(to);
      }
      this.reindex();
    }
    return ok;
  }

  async remove(path: string) {
    this.ownChange(path);
    const ok = await this.op(async () => {
      const { undo } = await workspaceApi.fs(this.id, { op: "delete", path });
      this.undoDelete = undo ? { path, undo } : null;
    }, `Deleted ${path}`);
    if (ok) {
      for (const p of [...this.buffers.keys()]) {
        if (p !== path && !p.startsWith(`${path}/`)) continue;
        this.buffers.delete(p);
        this.host?.close(p);
        this.tabs = this.tabs.filter((t) => t !== p);
        if (this.active === p) this.active = this.tabs[0] ?? null;
        if (this.persisted.unsaved) delete this.persisted.unsaved[p];
      }
      for (const p of [...this.nodes.keys()]) if (p === path || p.startsWith(`${path}/`)) this.nodes.delete(p);
      this.reindex();
      this.persist();
      this.emit("files");
    }
    return ok;
  }

  duplicate(path: string) {
    const dot = nameOf(path).lastIndexOf(".");
    const base = dot > 0 ? path.slice(0, path.length - (nameOf(path).length - dot)) : path;
    const ext = dot > 0 ? nameOf(path).slice(dot) : "";
    let to = `${base} copy${ext}`;
    for (let n = 2; this.nodes.has(to); n++) to = `${base} copy ${n}${ext}`;
    this.ownChange(to);
    return this.op(() => workspaceApi.fs(this.id, { op: "copy", path, to }), `Copied to ${to}`);
  }

  /** Puts a file of the starting point you removed back (the Removed group). */
  restore(path: string) {
    return this.reset("file", path);
  }

  /** The last delete, which Undo puts back (for 24 hours). */
  undoDelete: { path: string; undo: string } | null = null;

  async undoLastDelete() {
    const last = this.undoDelete;
    if (!last) return;
    this.undoDelete = null;
    this.emit("tree");
    this.ownChange(last.path);
    await this.op(() => workspaceApi.fs(this.id, { op: "restore", undo: last.undo }), `Put ${last.path} back`);
  }

  /** Reset: a file or a folder back to the starting point. Unsaved edits
      to what resets are dropped. */
  async reset(scope: "file" | "dir", path: string): Promise<boolean> {
    try {
      this.ownChange(path);
      await workspaceApi.reset(this.id, scope, path);
      // The tree as the reset left it, then each open file in it: back to the
      // disk's version, or closed when the reset removed it (a new file).
      try {
        const { tree, removed } = await workspaceApi.tree(this.id);
        this.setTree(tree, removed);
      } catch {
        this.refreshTree(0);
      }
      for (const [p, b] of [...this.buffers]) {
        if (p !== path && !(scope === "dir" && p.startsWith(`${path}/`))) continue;
        b.dirty = false;
        b.conflict = null;
        if (this.persisted.unsaved) delete this.persisted.unsaved[p];
        if (this.nodes.get(p)?.type !== "file") {
          this.buffers.delete(p);
          this.host?.close(p);
          this.tabs = this.tabs.filter((t) => t !== p);
          if (this.active === p) this.active = this.tabs.at(-1) ?? null;
          continue;
        }
        try {
          const read = await workspaceApi.readFile(this.id, p);
          if (read.kind === "text") {
            b.saved = read.text;
            b.etag = read.etag;
            b.deleted = false;
            this.host?.replace(p, read.text, { clean: true });
          }
        } catch {
          b.deleted = true;
        }
      }
      this.persist();
      this.emit("files");
      this.announce(scope === "file" ? `Reset ${path}` : `Reset ${path}/`);
      return true;
    } catch (err) {
      this.announce(err instanceof WorkspaceError ? err.message : "The reset didn't work. Try again.");
      return false;
    }
  }

  // -- Terminals ---------------------------------------------------------------

  nextTerminalTitle() {
    for (let n = 1; ; n++) if (!this.terminals.some((t) => t.title === `Terminal ${n}`)) return `Terminal ${n}`;
  }

  async newTerminal(cols = 100, rows = 24, cwd?: string): Promise<TerminalTab | null> {
    if (this.terminals.length >= 4) {
      this.announce("A workspace has at most 4 terminals. Close one first.");
      return null;
    }
    try {
      const { sid } = await workspaceApi.newTerminal(this.id, cols, rows, cwd);
      const tab = { sid, title: this.nextTerminalTitle() };
      this.terminals.push(tab);
      this.persist();
      this.emit("terminals");
      return tab;
    } catch (err) {
      this.announce(err instanceof WorkspaceError ? err.message : "Couldn't open a terminal.");
      return null;
    }
  }

  async closeTerminal(sid: string) {
    this.terminals = this.terminals.filter((t) => t.sid !== sid);
    this.persist();
    this.emit("terminals");
    try {
      await workspaceApi.closeTerminal(this.id, sid);
    } catch {
      /* already gone */
    }
  }

  terminalGone(sid: string) {
    if (!this.terminals.some((t) => t.sid === sid)) return;
    this.terminals = this.terminals.filter((t) => t.sid !== sid);
    this.persist();
    this.emit("terminals");
  }

  // -- Storage -----------------------------------------------------------------

  persist() {
    window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => this.flushPersist(), 300);
  }

  private flushPersist() {
    if (typeof window === "undefined") return;
    const unsaved: Persisted["unsaved"] = {};
    for (const [p, b] of this.buffers) {
      if (!b.dirty) continue;
      const text = this.host?.text(p) ?? this.persisted.unsaved?.[p]?.text;
      if (typeof text === "string" && text.length <= 1_000_000) unsaved[p] = { text, etag: b.etag };
    }
    // Unsaved text of files not open now stays.
    for (const [p, kept] of Object.entries(this.persisted.unsaved ?? {})) if (!this.buffers.has(p)) unsaved[p] = kept;
    this.persisted = { tabs: this.tabs, active: this.active, expanded: [...this.expanded], unsaved, terminals: this.terminals };
    try {
      localStorage.setItem(STORAGE(this.id), JSON.stringify(this.persisted));
    } catch {
      /* storage full or blocked */
    }
  }

  setExpanded(paths: string[]) {
    this.expanded = new Set(paths);
    this.persist();
    this.emit("tree");
  }
}

/** Re-renders a component when a slice of the store changes. */
export function useStore(store: WorkspaceStore, ...slices: Slice[]): number {
  return useSyncExternalStore(
    (fn) => {
      const offs = slices.map((s) => store.subscribe(s, fn));
      return () => offs.forEach((off) => off());
    },
    () => slices.reduce((sum, s) => sum + store.version(s), 0),
    () => 0
  );
}
