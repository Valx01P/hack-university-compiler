"use client";

import { workspaceApi, WorkspaceError } from "@/lib/workspace-client";
import type { FsEvent } from "@/lib/runner-socket";
import type { WorkspaceStore } from "@/lib/workspace-store";

/**
 * Changes made outside the editor, for the learner to review: an AI tool in
 * the compiler's or the playground's Terminal (Claude Code, Codex, opencode,
 * any of them), or a command run there, editing the folder's files. Each text file's content as
 * the learner last saw or accepted it is kept (`known`). A file that changes
 * on disk to something else, appears, or goes, without the page having done
 * it, is a pending change: the editor shows it against what was there
 * (removed lines red, added green, each to keep or undo, @codemirror/merge),
 * and a bar steps through the files, with Accept all and Reject all.
 * Accepting keeps what's on disk; rejecting writes back what was there (or
 * removes a new file, or brings a removed one back). It works from the files
 * alone, so any tool works and none has to know about it.
 *
 * The playground lets new files in as they come (`acceptNew`): a command
 * that scaffolds a project makes dozens, and only a change to a file that was
 * already there, or its removal, waits for the learner. The compiler reviews
 * new files too.
 */

export interface OutsideChange {
  path: string;
  /** What the learner had: null for a file that's new. */
  before: string | null;
  /** What's on disk now: null for a file that's gone. */
  after: string | null;
}

/** Files bigger than this aren't followed (nor run, compiler-workspace.tsx). */
const MAX_BYTES = 200_000;
/** A tool writes in bursts: a file is looked at once it's been quiet this long. */
const SETTLE_MS = 250;
/** The page's own operations (the Explorer's) land within this. */
const OWN_MS = 4_000;

export class OutsideChanges {
  /** The changes waiting for the learner, in the order they came. */
  pending: OutsideChange[] = [];
  private known = new Map<string, string>();
  private timers = new Map<string, number>();
  private own: { prefix: string; until: number }[] = [];
  /** What the page had for a path when its change came in (lib/workspace-store.ts pageTexts). */
  private pageHad = new Map<string, Set<string>>();
  private listeners = new Set<() => void>();
  private started = false;
  private disposers: (() => void)[] = [];

  constructor(
    private store: WorkspaceStore,
    /** Paths that aren't the learner's code (hidden notes, dependencies, builds). */
    private skip: (path: string) => boolean,
    /** A file that appears is kept at once, never reviewed (the playground). */
    private readonly acceptNew = false
  ) {}

  /** Reads what's there now (nothing pending), then follows the folder. */
  async start() {
    if (this.started) return;
    this.started = true;
    const onFs = (events: FsEvent[]) => this.onFs(events);
    const onOwn = (paths: string[]) => {
      const until = Date.now() + OWN_MS;
      for (const prefix of paths) this.own.push({ prefix, until });
    };
    this.store.fsWatchers.add(onFs);
    this.store.ownChangeWatchers.add(onOwn);
    this.disposers.push(() => this.store.fsWatchers.delete(onFs), () => this.store.ownChangeWatchers.delete(onOwn));
    const files = [...this.store.nodes.values()].filter((n) => n.type === "file" && !this.skip(n.path) && (n.size ?? 0) <= MAX_BYTES);
    await Promise.all(
      files.map(async (n) => {
        const text = await this.read(n.path);
        if (typeof text === "string" && !this.known.has(n.path)) this.known.set(n.path, text);
      })
    );
  }

  dispose() {
    for (const off of this.disposers) off();
    for (const t of this.timers.values()) window.clearTimeout(t);
    this.listeners.clear();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit() {
    this.pending = [...this.pending];
    for (const fn of this.listeners) fn();
  }

  /** The pending change to a file, if it has one. */
  of(path: string): OutsideChange | null {
    return this.pending.find((c) => c.path === path) ?? null;
  }

  private onFs(events: FsEvent[]) {
    for (const [kind, path] of events) {
      if (!path || this.skip(path)) continue;
      if (kind === "unlinkDir") {
        for (const p of this.known.keys()) if (p.startsWith(`${path}/`)) this.later(p);
        continue;
      }
      if (kind !== "add" && kind !== "change" && kind !== "unlink") continue;
      // Now, before the store takes the change in (an open file follows the
      // disk), what the page itself had: its own writes come back as these.
      const had = this.pageHad.get(path) ?? new Set<string>();
      for (const t of this.store.pageTexts(path)) had.add(t);
      this.pageHad.set(path, had);
      this.later(path);
    }
  }

  private later(path: string) {
    window.clearTimeout(this.timers.get(path));
    this.timers.set(
      path,
      window.setTimeout(() => {
        this.timers.delete(path);
        void this.look(path);
      }, SETTLE_MS)
    );
  }

  /** The file's text, null when it's gone, undefined when it can't be followed (binary, big, unreadable). */
  private async read(path: string): Promise<string | null | undefined> {
    try {
      const got = await workspaceApi.readFile(this.store.id, path);
      if (got.kind !== "text" || got.text.length > MAX_BYTES) return undefined;
      return got.text;
    } catch (err) {
      return err instanceof WorkspaceError && err.status === 404 ? null : undefined;
    }
  }

  private isOwn(path: string): boolean {
    const now = Date.now();
    this.own = this.own.filter((o) => o.until > now);
    return this.own.some((o) => o.prefix === "" || path === o.prefix || path.startsWith(`${o.prefix}/`));
  }

  private async look(path: string) {
    const had = this.pageHad.get(path);
    this.pageHad.delete(path);
    const after = await this.read(path);
    if (after === undefined) {
      this.known.delete(path);
      return;
    }
    const waiting = this.of(path);
    if (waiting) {
      // Under review already: it shows what's there now, against what was
      // there before. Changed back to that, there's nothing left to review.
      if (after === waiting.before) {
        this.pending = this.pending.filter((c) => c !== waiting);
        this.remember(path, after);
      } else {
        waiting.after = after;
      }
      return this.emit();
    }
    const before = this.known.has(path) ? this.known.get(path)! : null;
    if (after === before) return;
    // The page's own doing: its saves, and the Explorer's operations. And in
    // the playground, a file that's new.
    if (this.isOwn(path) || (after !== null && had?.has(after)) || (this.acceptNew && before === null)) return this.remember(path, after);
    this.pending.push({ path, before, after });
    this.emit();
  }

  private remember(path: string, text: string | null) {
    if (text === null) this.known.delete(path);
    else this.known.set(path, text);
  }

  /** Keeps what's on disk. */
  accept(path: string) {
    const change = this.of(path);
    if (!change) return;
    this.pending = this.pending.filter((c) => c !== change);
    this.remember(path, change.after);
    this.emit();
  }

  /** The editor resolved every part of it (kept some, undid the rest): `text` is what's left. */
  resolved(path: string, text: string) {
    const change = this.of(path);
    if (!change) return;
    this.pending = this.pending.filter((c) => c !== change);
    this.remember(path, text);
    this.emit();
  }

  /** Puts back what was there: the old text, no file for a new one, or the
      removed one again. */
  async reject(path: string) {
    const change = this.of(path);
    if (!change) return;
    this.pending = this.pending.filter((c) => c !== change);
    this.remember(path, change.before);
    this.emit();
    const until = Date.now() + OWN_MS;
    this.own.push({ prefix: path, until });
    try {
      if (change.before === null) await workspaceApi.fs(this.store.id, { op: "delete", path });
      else await workspaceApi.writeFile(this.store.id, path, change.before, null);
    } catch {
      /* gone already, or the runner's down: the next look sorts it out */
    }
    this.store.refreshTree(0);
  }

  acceptAll() {
    for (const c of this.pending) this.remember(c.path, c.after);
    this.pending = [];
    this.emit();
  }

  async rejectAll() {
    await Promise.all(this.pending.map((c) => this.reject(c.path)));
  }
}
