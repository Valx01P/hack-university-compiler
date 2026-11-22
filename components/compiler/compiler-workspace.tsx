"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EditorSelection } from "@/components/code/cm-editor";
import { Explorer } from "@/components/ide/explorer";
import { FolderTerminal, FolderUnavailable } from "@/components/ide/folder-panes";
import type { CompilerLang } from "@/lib/compiler";
import { fenceOf, fenced, notCode, useFolderWorkspace } from "@/lib/folder-workspace";
import type { OutsideChange, OutsideChanges } from "@/lib/outside-changes";
import { workspaceApi } from "@/lib/workspace-client";
import { useStore, type WorkspaceStore } from "@/lib/workspace-store";
import type { WorkspaceProps } from "@/lib/workspace-types";

export { fenced };

/**
 * The compiler page's own folder (scope compiler/<lang>): a workspace the
 * runner keeps on this computer, one per language, never a challenge's. The
 * editor shows the file you have open in it, the main file (main.py,
 * Main.java…) until you open another, which is remembered. The Explorer shows
 * its files, and the Terminal is a shell in it, on this computer, so your own
 * tools work there (Claude Code reads your files, and the notes the template
 * leaves for it in AGENTS.md).
 *
 * The main file's text is also the page's saved code (localStorage), as it
 * was before there was a folder: the editor opens on it at once, and it's all
 * the page has while the runner is down. Edits made then win when the folder
 * is back. Otherwise the folder does, since a tool in the terminal may have
 * changed the file while the page was closed. The file you had open, when
 * it isn't the main one, is kept the same way, so a reload paints it at once.
 * The folder itself (its store, the review of outside changes, the note for
 * AI tools) is lib/folder-workspace.ts, which the playground shares.
 */

const FILE_KEY = (slug: string) => `hu-compiler-file:${slug}`;
// The main file was edited while the folder couldn't take it (the runner was
// down, or still answering): those edits go to the folder when it's back.
const AHEAD_KEY = (slug: string) => `hu-compiler-ahead:${slug}`;
// The folder has had the page's code once. Before that, the code saved from
// before there was a folder replaces the starter the folder begins with.
const SYNCED_KEY = (slug: string) => `hu-compiler-synced:${slug}`;
const KEPT_CHARS = 200_000;

// What a Run takes along (app/api/execute/route.ts checks the same).
const RUN_FILES = 48;
const RUN_FILE_BYTES = 100_000;

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked */
  }
};

function keptFile(slug: string, main: string): { path: string; text: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const v = JSON.parse(read(FILE_KEY(slug)) ?? "null") as { path?: unknown; text?: unknown } | null;
    if (v && typeof v.path === "string" && v.path !== main && typeof v.text === "string") return { path: v.path, text: v.text };
  } catch {
    /* not ours */
  }
  return null;
}

/**
 * .hu/editor.md: what the learner has open in the compiler's editor, for an
 * AI tool in the Terminal to start from (the folder's AGENTS.md points it
 * here), so "what's wrong with my code" needs no file named. Written as
 * Markdown, which any tool reads.
 */
function editorNote({ path, challenge, selection }: EditorNote, main: string, lang: CompilerLang): string {
  const lines = ["# What the learner has open", "", "The Hack University compiler page keeps this note up to date as the learner works.", ""];
  if (challenge) {
    lines.push(
      `- In the editor: the challenge "${challenge.title}", in ${lang.label}. Its code isn't a file in this folder (it's saved in the page), so here it is, after what the challenge asks:`,
      "",
      fenced(challenge.statement, "markdown"),
      "",
      fenced(challenge.code, lang.slug === "cpp" ? "cpp" : fenceOf(main))
    );
  } else if (path) {
    lines.push(`- In the editor: ${path}${path === main ? " (the main file, which Run runs)" : ""}`);
  }
  if (selection) {
    lines.push(`- Cursor: line ${selection.line}, column ${selection.col}`);
    if (selection.from !== null && selection.to !== null && selection.text) {
      lines.push(`- Selected: ${selection.from === selection.to ? `line ${selection.from}` : `lines ${selection.from} to ${selection.to}`}`, "", fenced(selection.text, challenge ? fenceOf(main) : fenceOf(path ?? main)));
    }
  }
  lines.push("", "Their last run or challenge check (its input, output, and how it ended, or the tests that failed): .hu/last-run.md", "");
  return lines.join("\n");
}

export interface CompilerWorkspace {
  store: WorkspaceStore;
  main: string;
  /** The file the editor shows, when no challenge has the editor. */
  path: string;
  /** Its text, for a file other than the main one (the page's code is the main one's). */
  text: string;
  /** Why it can't be edited (a binary file), or null. */
  problem: string | null;
  online: boolean;
  /** The editor's text changed. */
  edited(path: string, text: string): void;
  /** Saves what's unsaved and reads the folder's other files, for a Run. */
  runFiles(): Promise<Record<string, string>>;
  /** Leaves the last run where tools read it (.hu/last-run.md). */
  recordRun(markdown: string): void;
  /** Changes made outside the editor (an AI tool, a command), waiting for
      the learner's review (lib/outside-changes.ts). */
  changes: OutsideChanges;
  pending: OutsideChange[];
  /** Shows a file in the editor (a pending change's, say). */
  show(path: string): void;
  /** What the editor shows, for the note AI tools read (.hu/editor.md). */
  noteEditor(open: EditorNote): void;
}

/** What the editor has open, for .hu/editor.md. */
export interface EditorNote {
  /** A file of the folder's, or a challenge's code (not a file here). */
  path: string | null;
  /** Never the answer: the eye keeps it out of the note. */
  challenge: { title: string; statement: string; code: string } | null;
  selection: EditorSelection | null;
}

export function useCompilerWorkspace({
  props,
  lang,
  code,
  setCode,
  onReveal,
}: {
  props: WorkspaceProps;
  lang: CompilerLang;
  /** The page's code: the main file's text. */
  code: string;
  /** Sets it (and saves it), when the folder's copy is the newer. */
  setCode: (text: string) => void;
  /** A link in the terminal points at a line of the open file. */
  onReveal?: (line: number) => void;
}): CompilerWorkspace {
  const main = lang.fileName;
  // The tree came in and the main file was squared with the page's code.
  const opened = useRef(false);
  const reconciled = useRef(false);
  const { store, changes, pending, online, writeNote } = useFolderWorkspace({
    props,
    onOpened: () => {
      opened.current = true;
      void ensureMain();
      // The file you had open, again, if it's still there.
      const path = live.current.shown.path;
      if (path !== main && store.nodes.get(path)?.type === "file") store.openFile(path);
      else if (path !== main) show(main, "");
      else store.openFile(main);
    },
  });
  // What the editor shows: a file only once its text is here, so switching
  // never paints an empty editor first. The server renders the main file, and
  // the file you had open comes back before the first paint (below), so the
  // markup hydrates as rendered.
  const [shown, setShown] = useState<{ path: string; text: string }>({ path: main, text: "" });
  const [problem, setProblem] = useState<string | null>(null);
  const texts = useRef(new Map<string, string>());
  const live = useRef({ code, setCode, onReveal, shown });
  live.current = { code, setCode, onReveal, shown };
  useLayoutEffect(() => {
    const kept = keptFile(lang.slug, main);
    if (!kept) return;
    texts.current.set(kept.path, kept.text);
    live.current.shown = kept;
    setShown(kept);
    // Once, on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const show = (path: string, text: string) => {
    live.current.shown = { path, text };
    setShown({ path, text });
    if (path === main) write(FILE_KEY(lang.slug), null);
    else if (text.length <= KEPT_CHARS) write(FILE_KEY(lang.slug), JSON.stringify({ path, text }));
  };

  // The store asks the editor for text and hands it what changed on disk.
  useLayoutEffect(() => {
    store.host = {
      text: (p) => (p === main ? live.current.code : texts.current.get(p) ?? null),
      replace: (p, t) => {
        if (p === main) return live.current.setCode(t);
        texts.current.set(p, t);
        if (live.current.shown.path === p) show(p, t);
      },
      rename: (from, to) => {
        const t = texts.current.get(from);
        texts.current.delete(from);
        if (t !== undefined) texts.current.set(to, t);
      },
      close: (p) => {
        if (live.current.shown.path !== p) texts.current.delete(p);
      },
      reveal: (p, line) => {
        if (p === live.current.shown.path) live.current.onReveal?.(line ?? 1);
      },
    };
    store.hydrate();
    return () => {
      store.host = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, main]);

  /** The main file, made again from the page's code if it's gone (Run runs it). */
  async function ensureMain() {
    if (store.nodes.get(main)?.type === "file") return;
    try {
      await workspaceApi.writeFile(store.id, main, live.current.code, null);
    } catch {
      return;
    }
    store.buffers.delete(main);
    store.refreshTree(0);
    void store.load(main);
  }

  useEffect(() => {
    const onFiles = () => {
      // The main file's first read squares it with the page's code.
      const buf = store.buffers.get(main);
      if (!reconciled.current && buf?.status === "ready") {
        reconciled.current = true;
        const disk = buf.saved;
        const local = live.current.code;
        if (disk !== local) {
          const first = read(SYNCED_KEY(lang.slug)) !== "1";
          if (read(AHEAD_KEY(lang.slug)) === "1" || (first && disk === lang.starter)) {
            store.edited(main, local);
            void store.save(main);
          } else {
            live.current.setCode(disk);
          }
        }
        write(AHEAD_KEY(lang.slug), null);
        write(SYNCED_KEY(lang.slug), "1");
      }
      if (!opened.current) return;
      // The Explorer opened a file (or one went): the editor follows.
      const active = store.active ?? main;
      const current = live.current.shown.path;
      if (active === main) {
        if (current !== main) {
          show(main, "");
          store.closeFile(current);
        }
        setProblem(null);
        return;
      }
      const ab = store.buffers.get(active);
      if (!ab) return;
      if (ab.status === "binary" || ab.status === "error") {
        setProblem(ab.status === "binary" ? "This file isn't text, so it can't be edited here." : ab.error ?? "Couldn't open this file.");
        if (active !== current) {
          show(active, "");
          if (current !== main) store.closeFile(current);
        }
        return;
      }
      setProblem(null);
      if (ab.status !== "ready") return;
      if (!texts.current.has(active)) texts.current.set(active, store.initialText(active));
      if (active !== current) {
        show(active, texts.current.get(active)!);
        if (current !== main) store.closeFile(current);
      }
    };
    return store.subscribe("files", onFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, main, lang.slug, lang.starter]);

  return {
    store,
    main,
    path: shown.path,
    text: shown.text,
    problem: shown.path === main ? null : problem,
    online,
    edited(path, text) {
      if (path === main) {
        const buf = store.buffers.get(main);
        if (reconciled.current && buf?.status === "ready") store.edited(main, text);
        else write(AHEAD_KEY(lang.slug), "1");
        return;
      }
      texts.current.set(path, text);
      if (live.current.shown.path === path) show(path, text);
      store.edited(path, text);
    },
    async runFiles() {
      if (store.runner !== "online") return {};
      await store.saveAll();
      await ensureMain();
      const skip = notCode(store.props.template.hidden);
      const files = [...store.nodes.values()]
        .filter((n) => n.type === "file" && n.path !== main && !skip(n.path) && (n.size ?? 0) <= RUN_FILE_BYTES)
        .slice(0, RUN_FILES);
      const out: Record<string, string> = {};
      await Promise.all(
        files.map(async (n) => {
          const buf = store.buffers.get(n.path);
          if (buf?.status === "ready") {
            out[n.path] = texts.current.get(n.path) ?? buf.saved;
            return;
          }
          const got = await workspaceApi.readFile(store.id, n.path).catch(() => null);
          if (got?.kind === "text" && got.text.length <= RUN_FILE_BYTES) out[n.path] = got.text;
        })
      );
      return out;
    },
    changes,
    pending,
    show(path) {
      store.openFile(path);
    },
    noteEditor(open) {
      writeNote(editorNote(open, main, lang));
    },
    recordRun(markdown) {
      if (store.runner !== "online") return;
      void workspaceApi.writeFile(store.id, ".hu/last-run.md", markdown, null).catch(() => {});
    },
  };
}

/** The folder's files: the playground's Explorer, with no heading (the tab
    already says Explorer), its buttons flipping with the page when the
    editor is on the right. Opening a file shows it in the editor. */
export function CompilerExplorer({ store }: { store: WorkspaceStore }) {
  useStore(store, "status");
  if (store.runner !== "online") return <FolderUnavailable store={store} opening={OPENING} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Explorer store={store} heading="" mirror />
    </div>
  );
}

/** The folder's one shell (components/ide/folder-panes.tsx), the same with
    a challenge open or not. */
export function CompilerTerminal(props: { store: WorkspaceStore; visible: boolean; onOpenFile?: (path: string, line: number) => void }) {
  return <FolderTerminal {...props} opening={OPENING} />;
}

const OPENING = "Opening this language's folder…";
