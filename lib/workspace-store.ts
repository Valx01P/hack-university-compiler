"use client";

import { useSyncExternalStore } from "react";
import { compareNames } from "@/lib/file-order.mjs";
import type { CheckResult, CheckTest, PortInfo, StartingTree, TreeEntry, WorkspaceProps, WorkspaceStatus } from "@/lib/workspace-types";
import { openWorkspace, workspaceApi, WorkspaceError, type FileRead } from "@/lib/workspace-client";
import { WorkspaceEvents, type FsEvent, type RunnerEvent, type SocketState } from "@/lib/runner-socket";

/**
 * Everything one open workspace knows, in the browser: its tree, the files
 * open in the editor, its status, ports, tasks, terminals, the dock, and the
 * last check. The runner is the source of truth for files on disk: the store
 * opens the workspace, listens on its events socket, and keeps the explorer
 * and the editor in step with what the terminal and servers change.
 *
 * Components read it with useStore(store, slice), which re-renders them when
 * that slice changes. Open tabs, unsaved buffers, and the folders you opened
 * are kept in localStorage per workspace (hu-ws-v1:<id>), so a reload loses
 * nothing you typed. Pane sizes stay for the session only, like every split
 * in the app.
 */

export type Slice = "tree" | "files" | "status" | "ports" | "tasks" | "terminals" | "dock" | "check" | "diag" | "preview" | "notice";

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
  generated?: string | boolean;
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

/** What the IDE's editor does for the store: it holds the documents. */
export interface EditorHost {
  text(path: string): string | null;
  replace(path: string, text: string, opts?: { clean?: boolean }): void;
  rename(from: string, to: string): void;
  close(path: string): void;
  reveal(path: string, line?: number): void;
}

export type DockPanel = "terminal" | "server" | "ports" | "api" | "database" | "problems" | "results";

export interface TerminalTab {
  sid: string;
  title: string;
}

export interface TaskState {
  name: string;
  state: "idle" | "starting" | "running" | "exited";
  code?: number | null;
  signal?: string | null;
  sid?: string;
}

export interface Diagnostic {
  file: string;
  line: number;
  col: number;
  severity: string;
  code?: string;
  message: string;
  source: string;
}

export type CheckState =
  | { status: "idle" }
  | { status: "running"; checkId?: string; tests: CheckTest[] }
  | { status: "done"; result: CheckResult }
  | { status: "error"; error: string };

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
  /** The runner's status (terminals and tasks still running) has come in. */
  settled = false;
  runnerMessage = "";
  socket: SocketState = "closed";
  docker: "up" | "down" | "waking" | null = null;
  status: WorkspaceStatus = "absent";
  statusDetail = "";
  mem: { usedMb: number; limitMb: number } | null = null;
  limit: { kind: string; message: string } | null = null;
  ports = new Map<number, PortInfo>();
  tasks = new Map<string, TaskState>();
  terminals: TerminalTab[] = [];
  diagnostics = new Map<string, Diagnostic[]>();
  check: CheckState = { status: "idle" };

  // Layout.
  dock: DockPanel = "terminal";
  dockOpen = true;
  dockMax = false;
  explorerOpen = true;
  preview: { open: boolean; port: number | null; path: string; nonce: number } = { open: false, port: null, path: "/", nonce: 0 };
  /** A short message for the screen reader and the status line. */
  notice = "";

  private versions = new Map<Slice, number>();
  private listeners = new Map<Slice, Set<() => void>>();
  private events: WorkspaceEvents | null = null;
  private autosaveTimers = new Map<string, number>();
  private persistTimer = 0;
  private treeTimer = 0;
  private persisted: Persisted;
  private restored = false;
  /** Paths this tab saved, and the text it saved, so their own echo from the
      watcher isn't taken for someone else's change. */
  private ownWrites = new Map<string, string>();
  autosave: boolean;

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
    for (const task of props.template.tasks) this.tasks.set(task.name, { name: task.name, state: "idle" });
  }

  /** Your tabs, folders, and terminals from before (localStorage), after
      hydration and before the IDE shows, so the server markup and the first
      client render match. */
  hydrate() {
    if (this.restored) return;
    this.restored = true;
    this.persisted = readPersisted(this.id);
    const known = (p: string) => this.nodes.get(p)?.type === "file";
    const tabs = (this.persisted.tabs ?? []).filter((p) => typeof p === "string");
    const kept = tabs.filter((p, i) => tabs.indexOf(p) === i && (known(p) || this.persisted.unsaved?.[p]));
    if (kept.length) this.tabs = kept;
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

  /** Opens the workspace on the runner and starts listening. */
  async connect(signal?: AbortSignal) {
    this.runner = "connecting";
    this.emit("status");
    try {
      const opened = await openWorkspace(this.scope, signal);
      this.runner = "online";
      this.runnerMessage = "";
      this.status = (opened.status as WorkspaceStatus) ?? "files";
      this.setTree(opened.tree, opened.removed);
      for (const p of Array.isArray(opened.ports) ? opened.ports : []) this.ports.set(p.port, p);
      this.emit("status", "ports");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      this.runner = "offline";
      this.runnerMessage = err instanceof WorkspaceError ? err.message : "The workspace runner isn't running. Start it with npm run up.";
      this.emit("status");
      return;
    }
    // Terminals and tasks that kept running (a reload) come back.
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
    // Shells come back as tabs (a task's log view belongs to its task).
    const terminals = Array.isArray(s.terminals) ? (s.terminals as { sid?: string; kind?: string; exited?: boolean }[]) : [];
    const live = new Set(
      terminals.filter((t) => t.kind !== "log" && !t.exited).map((t) => t.sid).filter((sid): sid is string => typeof sid === "string")
    );
    const before = this.terminals.length;
    // Keep the tabs whose sessions still run, in their order, with their names.
    this.terminals = this.terminals.filter((t) => live.has(t.sid));
    for (const sid of live) if (!this.terminals.some((t) => t.sid === sid)) this.terminals.push({ sid, title: this.nextTerminalTitle() });
    if (this.terminals.length !== before || live.size) this.emit("terminals");
    const tasks = Array.isArray(s.tasks) ? (s.tasks as { name?: string; state?: string; sid?: string; code?: number | null; signal?: string | null }[]) : [];
    for (const t of tasks) {
      if (!t.name) continue;
      const cur = this.tasks.get(t.name) ?? { name: t.name, state: "idle" };
      this.tasks.set(t.name, { ...cur, state: (t.state as TaskState["state"]) ?? cur.state, sid: t.sid ?? cur.sid, code: t.code ?? null, signal: t.signal ?? null });
    }
    if (s.mem && typeof s.mem === "object") this.mem = s.mem as { usedMb: number; limitMb: number };
    if (typeof s.detail === "string") this.statusDetail = s.detail;
    const ports = Array.isArray(s.ports) ? (s.ports as PortInfo[]) : [];
    for (const p of ports) if (typeof p.port === "number") this.ports.set(p.port, p);
    this.persist();
    this.emit("status", "tasks", "ports");
  }

  private onEvent(e: RunnerEvent) {
    switch (e.t) {
      case "ready":
        // Whatever changed while no socket listened (the runner says resync
        // when it no longer has every batch since then).
        this.refreshTree(e.resync ? 0 : 250);
        break;
      case "terminal":
        if (e.state === "exited") this.terminalGone(e.sid);
        break;
      case "status":
        this.status = e.status as WorkspaceStatus;
        this.statusDetail = e.detail ?? "";
        if (e.mem) this.mem = e.mem;
        if (e.status === "stopped") {
          for (const [name, t] of this.tasks) if (t.state !== "idle" && t.state !== "exited") this.tasks.set(name, { ...t, state: "exited" });
          this.emit("tasks");
        }
        this.emit("status");
        break;
      case "docker":
        this.docker = e.state;
        this.emit("status");
        break;
      case "fs":
        this.applyFs(e.events);
        break;
      case "port": {
        const declared = this.props.template.ports.find((p) => p.env === "PORT");
        if (e.state === "closed") this.ports.delete(e.port);
        else this.ports.set(e.port, { ...e, label: this.ports.get(e.port)?.label ?? declared?.label });
        // A preview of a server that restarts (node --watch) reloads.
        if (e.state === "listening" && this.preview.open && this.preview.port === e.port) this.reloadPreview();
        this.emit("ports");
        break;
      }
      case "task": {
        const cur = this.tasks.get(e.name) ?? { name: e.name, state: "idle" };
        this.tasks.set(e.name, { ...cur, state: e.state, code: e.code ?? null, signal: e.signal ?? null, sid: e.sid ?? cur.sid });
        this.emit("tasks");
        break;
      }
      case "check":
        this.onCheckEvent(e);
        break;
      case "diag": {
        for (const [file, items] of this.diagnostics) {
          const kept = items.filter((d) => d.source !== e.source);
          if (kept.length) this.diagnostics.set(file, kept);
          else this.diagnostics.delete(file);
        }
        for (const item of e.items) {
          const list = this.diagnostics.get(item.file) ?? [];
          list.push({ ...item, source: e.source });
          this.diagnostics.set(item.file, list);
        }
        this.emit("diag");
        break;
      }
      case "limit":
        this.limit = { kind: e.kind, message: e.message };
        this.announce(e.message);
        this.emit("status");
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
          if (kind === "change" || kind === "add") void this.diskChanged(p);
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
  openFile(path: string, opts: { line?: number; preview?: boolean } = {}) {
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
    await this.op(() => workspaceApi.fs(this.id, { op: "restore", undo: last.undo }), `Put ${last.path} back`);
  }

  /** Reset: one file, one folder, or everything, back to the starting point.
      Unsaved edits to what resets are dropped. */
  async reset(scope: "file" | "dir" | "all" | "everything", path?: string): Promise<string | null> {
    try {
      const { snapshot } = await workspaceApi.reset(this.id, scope, path);
      // The tree as the reset left it, then each open file in it: back to the
      // disk's version, or closed when the reset removed it (a new file).
      try {
        const { tree, removed } = await workspaceApi.tree(this.id);
        this.setTree(tree, removed);
      } catch {
        this.refreshTree(0);
      }
      for (const [p, b] of [...this.buffers]) {
        const inside = scope === "all" || scope === "everything" || p === path || (scope === "dir" && !!path && p.startsWith(`${path}/`));
        if (!inside) continue;
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
      this.announce(scope === "file" ? `Reset ${path}` : scope === "dir" ? `Reset ${path}/` : "Reset everything to the starting point");
      return snapshot ?? null;
    } catch (err) {
      this.announce(err instanceof WorkspaceError ? err.message : "The reset didn't work. Try again.");
      return null;
    }
  }

  async restoreSnapshot(sid: string) {
    try {
      await workspaceApi.restoreSnapshot(this.id, sid);
      for (const [p, b] of this.buffers) {
        try {
          const read = await workspaceApi.readFile(this.id, p);
          if (read.kind === "text") {
            b.saved = read.text;
            b.etag = read.etag;
            b.dirty = false;
            b.conflict = null;
            b.deleted = false;
            this.host?.replace(p, read.text, { clean: true });
          }
        } catch {
          b.deleted = true;
        }
      }
      this.persisted.unsaved = {};
      this.persist();
      this.refreshTree(0);
      this.emit("files");
      this.announce("Restored the save point");
      return true;
    } catch (err) {
      this.announce(err instanceof WorkspaceError ? err.message : "Couldn't restore that save point.");
      return false;
    }
  }

  // -- Tasks, terminals, ports, preview --------------------------------------

  runTask(): string | null {
    return this.props.template.tasks.find((t) => t.run)?.name ?? null;
  }

  async startTask(name: string, action: "start" | "restart" | "stop" = "start") {
    await this.saveAll();
    const cur = this.tasks.get(name) ?? { name, state: "idle" as const };
    if (action !== "stop") this.tasks.set(name, { ...cur, state: "starting" });
    this.emit("tasks");
    try {
      const { sid } = await workspaceApi.task(this.id, name, action);
      const now = this.tasks.get(name)!;
      this.tasks.set(name, { ...now, sid: sid ?? now.sid, state: action === "stop" ? "exited" : now.state === "idle" ? "starting" : now.state });
      this.emit("tasks");
      return true;
    } catch (err) {
      this.tasks.set(name, { ...cur, state: cur.state === "starting" ? "idle" : cur.state });
      this.announce(err instanceof WorkspaceError ? err.message : `Couldn't ${action} ${name}.`);
      this.emit("tasks");
      return false;
    }
  }

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

  setDock(panel: DockPanel | null) {
    if (panel === null) this.dockOpen = false;
    else {
      this.dock = panel;
      this.dockOpen = true;
    }
    this.emit("dock");
  }

  toggleDockMax() {
    this.dockMax = !this.dockMax;
    this.emit("dock");
  }

  toggleExplorer(open = !this.explorerOpen) {
    this.explorerOpen = open;
    this.emit("dock");
  }

  openPreview(port: number, path = "/") {
    this.preview = { open: true, port, path, nonce: this.preview.nonce + 1 };
    this.emit("preview");
  }

  closePreview() {
    this.preview = { ...this.preview, open: false };
    this.emit("preview");
  }

  reloadPreview() {
    this.preview = { ...this.preview, nonce: this.preview.nonce + 1 };
    this.emit("preview");
  }

  // -- Check -------------------------------------------------------------------

  async runCheck(): Promise<void> {
    if (this.check.status === "running") return;
    await this.saveAll();
    this.check = { status: "running", tests: [] };
    this.setDock("results");
    this.emit("check");
    try {
      const { checkId } = await workspaceApi.check(this.id, this.scope);
      if (this.check.status === "running") this.check = { ...this.check, checkId };
      this.emit("check");
      // A socket that dropped never says it's done: ask once it's quiet.
      window.setTimeout(() => void this.pollCheck(checkId), 15_000);
    } catch (err) {
      this.check = { status: "error", error: err instanceof WorkspaceError ? err.message : "Check couldn't start. Try again." };
      this.emit("check");
    }
  }

  private async pollCheck(checkId: string) {
    if (this.check.status !== "running" || this.check.checkId !== checkId) return;
    try {
      const result = await workspaceApi.checkResult(this.id, checkId);
      if (result?.status && this.check.status === "running") {
        this.check = { status: "done", result };
        this.emit("check");
        return;
      }
    } catch {
      /* still running */
    }
    window.setTimeout(() => void this.pollCheck(checkId), 5000);
  }

  private onCheckEvent(e: Extract<RunnerEvent, { t: "check" }>) {
    if (this.check.status !== "running") return;
    if (this.check.checkId && e.checkId !== this.check.checkId) return;
    if (e.test) this.check = { ...this.check, checkId: e.checkId, tests: [...this.check.tests, e.test as unknown as CheckTest] };
    if (e.phase === "done") {
      const result = (e.result as unknown as CheckResult | undefined) ?? {
        checkId: e.checkId,
        status: this.check.tests.every((t) => t.status === "pass" || t.status === "skip") ? "passed" : "failed",
        tests: this.check.tests,
        infra: null,
      };
      this.check = { status: "done", result: { ...result, tests: result.tests?.length ? result.tests : this.check.tests } };
    }
    this.emit("check");
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
