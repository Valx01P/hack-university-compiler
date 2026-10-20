import fs from "node:fs";
import { HEAVY, type Entry, type HostFs } from "./storage/host.ts";
import type { FsEvent } from "./events.ts";

/**
 * Watches a workspace's files folder on the Mac with FSEvents (fs.watch,
 * recursive) and turns what changed into batched fs events, every 50 ms
 * (architecture §3.3). Changes made inside the container reach the Mac's
 * folder through Docker's file sharing, so a file made in a terminal shows up
 * here within a few milliseconds.
 *
 * FSEvents says only which paths changed, so the watcher keeps what it last
 * saw of each path and compares: a path that appears is an add (or addDir),
 * one that's gone an unlink (or unlinkDir), and a file whose size, time, or
 * mode moved a change. A folder that appears whole (a mv into the workspace)
 * is walked, so every path in it is reported. Heavy folders (node_modules,
 * .git, …) report only themselves, never what's inside. Paths are looked at
 * with lstat, never followed.
 */

const FLUSH_MS = 50;

type Seen = Pick<Entry, "type" | "size" | "mtimeMs" | "mode" | "target">;

export class Watcher {
  private readonly fsys: HostFs;
  private readonly onBatch: (events: FsEvent[]) => void;
  private readonly describe: (entry: Entry) => Record<string, unknown>;
  private watcher: fs.FSWatcher | null = null;
  private readonly known = new Map<string, Seen>();
  private readonly pending = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private rescan = false;

  constructor(fsys: HostFs, onBatch: (events: FsEvent[]) => void, describe: (entry: Entry) => Record<string, unknown>) {
    this.fsys = fsys;
    this.onBatch = onBatch;
    this.describe = describe;
  }

  get running(): boolean {
    return this.watcher !== null;
  }

  /** Starts watching, from what is there now. */
  start(entries: Entry[]) {
    if (this.watcher) return;
    this.known.clear();
    for (const e of entries) this.known.set(e.path, seen(e));
    this.watcher = fs.watch(this.fsys.root, { recursive: true, persistent: false }, (_event, name) => {
      if (name === null) {
        this.rescan = true;
      } else {
        const rel = String(name).split(/[\\/]/).filter(Boolean).join("/");
        if (!rel || ignored(rel)) return;
        this.pending.add(rel);
      }
      this.timer ??= setTimeout(() => this.flush(), FLUSH_MS);
    });
    this.watcher.on("error", () => {
      // The folder went away (the workspace was deleted). Nothing to watch.
      this.stop();
    });
  }

  stop() {
    this.watcher?.close();
    this.watcher = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
  }

  /** Looks at a path now, outside FSEvents (after the runner itself changed it). */
  touch(rel: string) {
    if (!this.watcher) return;
    this.pending.add(rel);
    this.timer ??= setTimeout(() => this.flush(), FLUSH_MS);
  }

  private flush() {
    this.timer = null;
    const paths = [...this.pending].sort();
    this.pending.clear();
    const events: FsEvent[] = [];
    if (this.rescan) {
      this.rescan = false;
      this.compareFolder("", events, true);
    }
    for (const rel of paths) this.comparePath(rel, events);
    if (events.length) this.onBatch(events);
  }

  private look(rel: string): Entry | null {
    try {
      return this.fsys.entry(rel);
    } catch {
      // A link in the path (outside), or it vanished: as good as gone.
      return null;
    }
  }

  private comparePath(rel: string, events: FsEvent[]) {
    const now = this.look(rel);
    const before = this.known.get(rel);
    if (!now) {
      if (before) this.gone(rel, before, events);
      return;
    }
    if (before && before.type !== now.type) this.gone(rel, before, events);
    const prev = this.known.get(rel);
    if (!prev) {
      this.appeared(now, events);
    } else if (now.type === "dir") {
      // A folder's own change (a rename inside it, say): compare its children.
      if (!now.heavy) this.compareFolder(rel, events, false);
    } else if (prev.size !== now.size || prev.mtimeMs !== now.mtimeMs || prev.mode !== now.mode || prev.target !== now.target) {
      this.known.set(rel, seen(now));
      events.push(["change", rel, this.describe(now)]);
    }
  }

  private appeared(entry: Entry, events: FsEvent[]) {
    // Its folder appeared in this same batch, or now: report the parents first.
    const parent = entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/")) : "";
    if (parent && !this.known.has(parent)) {
      const p = this.look(parent);
      if (p) this.appeared(p, events);
      if (this.known.has(entry.path)) return;
    }
    this.known.set(entry.path, seen(entry));
    events.push([entry.type === "dir" ? "addDir" : "add", entry.path, this.describe(entry)]);
    if (entry.type === "dir" && !entry.heavy) this.compareFolder(entry.path, events, true);
  }

  private gone(rel: string, before: Seen, events: FsEvent[]) {
    this.known.delete(rel);
    if (before.type === "dir") {
      for (const key of [...this.known.keys()]) if (key.startsWith(`${rel}/`)) this.known.delete(key);
      events.push(["unlinkDir", rel]);
    } else {
      events.push(["unlink", rel]);
    }
  }

  /** Compares a folder's children with what was known, walking new folders when `deep`. */
  private compareFolder(dir: string, events: FsEvent[], deep: boolean) {
    let names: string[];
    try {
      const st = dir ? this.fsys.lstat(dir) : this.fsys.lstat("");
      if (!st?.isDirectory()) return;
      names = fs.readdirSync(this.fsys.abs(dir));
    } catch {
      return;
    }
    const here = new Set(names.map((n) => (dir ? `${dir}/${n}` : n)));
    for (const key of [...this.known.keys()]) {
      const parent = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "";
      if (parent === dir && !here.has(key)) {
        const before = this.known.get(key);
        if (before) this.gone(key, before, events);
      }
    }
    for (const rel of [...here].sort()) {
      if (ignored(rel)) continue;
      if (!this.known.has(rel)) {
        const e = this.look(rel);
        if (e) this.appeared(e, events);
      } else if (deep) {
        this.comparePath(rel, events);
      }
    }
  }
}

function seen(e: Entry): Seen {
  return { type: e.type, size: e.size, mtimeMs: e.mtimeMs, mode: e.mode, target: e.target };
}

/** Inside a heavy folder, or one of the runner's own temp files. */
export function ignored(rel: string): boolean {
  const parts = rel.split("/");
  for (let i = 0; i < parts.length - 1; i++) if (HEAVY.has(parts[i])) return true;
  return parts[parts.length - 1].startsWith(".hu-write.");
}
