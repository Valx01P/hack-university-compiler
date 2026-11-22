"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { OutsideChanges, type OutsideChange } from "@/lib/outside-changes";
import { workspaceApi } from "@/lib/workspace-client";
import { WorkspaceStore, useStore } from "@/lib/workspace-store";
import type { WorkspaceProps } from "@/lib/workspace-types";

/**
 * A folder on this computer, as a page holds it: the compiler's own
 * (components/compiler/compiler-workspace.tsx) or the playground's
 * (components/playground/playground-app.tsx). Its store opens it on the
 * runner once the page mounts and lets it go when the page does. Changes
 * made outside the editor (an AI tool or a command in the Terminal) wait for
 * review from the moment its live tree is in (lib/outside-changes.ts), and
 * the note AI tools read about what the editor has open (.hu/editor.md) is
 * written a moment after the editor settles. What the editor shows, and how,
 * is the page's.
 */

const NO_CHANGES: OutsideChange[] = [];
/** How long the editor settles before its note is written. */
const NOTE_MS = 600;
/** The most of a selection or a challenge's code a note holds. */
export const NOTE_CHARS = 6_000;

const HEAVY = new Set(["node_modules", ".git", ".venv", "target", "__pycache__", "build", "dist", ".next"]);
/** Paths that aren't the learner's code: the template's hidden notes, and
    dependencies and builds. Not run, and not reviewed. */
export const notCode = (hidden: string[]) => (p: string) =>
  hidden.some((h) => p === h || p.startsWith(`${h}/`)) || p.split("/").some((part) => HEAVY.has(part) || part.endsWith(".class"));

const FENCES: Record<string, string> = {
  py: "python", js: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript", tsx: "tsx", jsx: "jsx", java: "java", go: "go",
  cpp: "cpp", cc: "cpp", h: "cpp", hpp: "cpp", sql: "sql", sh: "bash", bash: "bash", json: "json", md: "markdown", html: "html", css: "css", txt: "",
};
/** A file's fence language, for a note's code block. */
export const fenceOf = (path: string) => FENCES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "";

/** A fenced block for the notes AI tools read (the editor's and the last
    run's, compiler-app.tsx), cut off past `max`, that the text in it can't
    close early. `fence` names its language. */
export function fenced(text: string, fence = "", max = NOTE_CHARS): string {
  const clipped = text.length > max ? `${text.slice(0, max)}\n… (cut off here)` : text;
  const ticks = "`".repeat(Math.max(3, ...[...clipped.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return `${ticks}${fence}\n${clipped.replace(/\n?$/, "\n")}${ticks}`;
}

export interface FolderWorkspace {
  store: WorkspaceStore;
  /** Changes made outside the editor, waiting for the learner's review. */
  changes: OutsideChanges;
  pending: OutsideChange[];
  online: boolean;
  /** Leaves what the editor has open where tools read it (.hu/editor.md),
      a moment after the editor settles. */
  writeNote(markdown: string): void;
}

export function useFolderWorkspace({
  props,
  acceptNew = false,
  onOpened,
}: {
  props: WorkspaceProps;
  /** New files a tool makes are kept without a review (the playground). */
  acceptNew?: boolean;
  /** The live tree came in the first time: the page shows its files. */
  onOpened?: () => void;
}): FolderWorkspace {
  const [store] = useState(() => new WorkspaceStore(props));
  const [changes] = useState(() => new OutsideChanges(store, notCode(props.template.hidden), acceptNew));
  const pending = useSyncExternalStore(
    (fn) => changes.subscribe(fn),
    () => changes.pending,
    () => NO_CHANGES
  );
  const live = useRef({ onOpened });
  live.current = { onOpened };
  const note = useRef<{ timer: number; next: string | null; written: string | null }>({ timer: 0, next: null, written: null });
  useStore(store, "status");

  useEffect(() => {
    const abort = new AbortController();
    void store.connect(abort.signal);
    return () => {
      abort.abort();
      window.clearTimeout(note.current.timer);
      changes.dispose();
      store.dispose();
    };
  }, [store, changes]);

  useEffect(() => {
    let opened = false;
    const onTree = () => {
      if (opened || store.runner !== "online" || store.status === "absent") return;
      opened = true;
      // From now, changes made outside the editor wait for review.
      void changes.start();
      live.current.onOpened?.();
    };
    const offTree = store.subscribe("tree", onTree);
    const offStatus = store.subscribe("status", onTree);
    return () => {
      offTree();
      offStatus();
    };
  }, [store, changes]);

  return {
    store,
    changes,
    pending,
    online: store.runner === "online",
    writeNote(markdown) {
      note.current.next = markdown;
      window.clearTimeout(note.current.timer);
      note.current.timer = window.setTimeout(() => {
        const text = note.current.next;
        if (!text || text === note.current.written || store.runner !== "online") return;
        note.current.written = text;
        void workspaceApi.writeFile(store.id, ".hu/editor.md", text, null).catch(() => {
          note.current.written = null;
        });
      }, NOTE_MS);
    },
  };
}
