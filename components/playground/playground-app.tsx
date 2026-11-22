"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CourseRail } from "@/components/chrome/course-rail";
import { FloatingNav } from "@/components/chrome/floating-nav";
import type { EditorSelection } from "@/components/code/cm-editor";
import { Explorer } from "@/components/ide/explorer";
import { FolderTerminal } from "@/components/ide/folder-panes";
import { QuickOpen } from "@/components/ide/quick-open";
import { PlaygroundEditor } from "@/components/playground/playground-editor";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { languageLoaded } from "@/lib/editor-extensions";
import { fenceOf, fenced, useFolderWorkspace } from "@/lib/folder-workspace";
import { useFullScreen } from "@/lib/full-screen";
import { useIdeSettings } from "@/lib/ide-settings";
import { PANES, paneValue, paneVar } from "@/lib/panes";
import { setPaneSize, usePaneSize } from "@/lib/pane-size";
import { revealWorkspace } from "@/lib/url-state";
import { useStore } from "@/lib/workspace-store";
import { fileLanguage, type WorkspaceProps } from "@/lib/workspace-types";

/**
 * The playground (/playground): one folder on this computer, shown the way
 * VS Code would, in the compiler's frame with the same rail down the left.
 * The Explorer is on the left, the editor beside it with a tab for each open
 * file, and a terminal under them, a real shell in the folder (in tmux, so
 * it outlives the page). There's no Run: things run in the terminal. A
 * change a tool makes to a file that was there waits for review in its tab,
 * and a file a tool makes just appears (lib/outside-changes.ts, acceptNew).
 *
 * Its borders are lib/panes.ts's: the Explorer's width and the terminal's
 * height, each folding away (the Explorer to nothing, the terminal to its
 * bar) and saved, applied before first paint with their folds
 * (globals.css), so a reload never shifts. Open tabs, unsaved text, opened
 * folders, and the terminal come back from this browser (the store's
 * hu-ws-v1:<id>), and the editor, Explorer, and terminal stay hidden until
 * they have (IDE_GATE, data-restore-editor on <html>), with 1.5 seconds at
 * most, the rail and the bar showing at once.
 *
 * Keys (never while the terminal has focus, so Ctrl+C, Ctrl+Z, Ctrl+R,
 * Ctrl+D, and Ctrl+L reach the shell, except Ctrl+Backquote): Terminal and
 * back Ctrl+Backquote, Save Mod+S, Save all Mod+Alt+S, Quick open Mod+P,
 * Explorer Mod+B, New file Alt+N, Close tab Alt+W. Keys the browser owns
 * (Mod+W, Mod+N, Mod+T, Mod+1 to 9, Mod+L, Mod+R) are never taken.
 */

const EXPLORER = PANES["playground-explorer"];
const TERMINAL = PANES["playground-terminal"];
// Dragged narrower or shorter than this, a pane folds away.
const EXPLORER_FOLD_BELOW = 100;
const TERMINAL_FOLD_BELOW = 8;
const REVEAL_MS = 1500;
const OPENING = "Opening the playground…";

const WIDE = "(min-width: 64rem)";
const subscribeWide = (fn: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
};
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);

const inTerminal = () => Boolean(document.activeElement?.closest("[data-terminal]"));
const mod = (e: KeyboardEvent) => (navigator.platform.toUpperCase().includes("MAC") ? e.metaKey : e.ctrlKey);

/** .hu/editor.md: what the learner has open, for an AI tool in the terminal
    to start from (the folder's AGENTS.md points it here). */
function editorNote(path: string | null, tabs: string[], selection: EditorSelection | null): string {
  const lines = ["# What the learner has open", "", "The Hack University playground keeps this note up to date as the learner works.", ""];
  lines.push(path ? `- In the editor: ${path}` : "- In the editor: nothing (no file is open)");
  const others = tabs.filter((t) => t !== path);
  if (others.length) lines.push(`- Their other tabs: ${others.join(", ")}`);
  if (path && selection) {
    lines.push(`- Cursor: line ${selection.line}, column ${selection.col}`);
    if (selection.from !== null && selection.to !== null && selection.text) {
      lines.push(`- Selected: ${selection.from === selection.to ? `line ${selection.from}` : `lines ${selection.from} to ${selection.to}`}`, "", fenced(selection.text, fenceOf(path)));
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function PlaygroundApp({ props }: { props: WorkspaceProps }) {
  const [full, stepFull, screenMode] = useFullScreen();
  const ideSettings = useIdeSettings();
  const { store, changes, pending, writeNote } = useFolderWorkspace({ props, acceptNew: true });
  useStore(store, "status", "files", "notice");
  const wide = useWide();
  const [quickOpen, setQuickOpen] = useState(false);
  const [mobile, setMobile] = useState<"files" | "code" | "terminal">("code");
  const explorer = usePaneSize("playground-explorer");
  const explorerOpenAt = usePaneSize("playground-explorer-open");
  const terminal = usePaneSize("playground-terminal");
  const terminalOpenAt = usePaneSize("playground-terminal-open");
  const explorerFolded = explorer === 0;
  const terminalFolded = terminal === 0;
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const revealed = useRef(false);
  const offline = store.runner === "offline";

  store.autosave = ideSettings.autosave && props.template.autosave;

  // A pane opens again at the size it had: the size it's left at, or, for
  // a drag that folds it (on its way past the smallest), where that drag
  // began.
  const dragFrom = useRef<{ explorer: number | null; terminal: number | null }>({ explorer: null, terminal: null });
  const setExplorer = (width: number, dragging = false) => {
    if (dragging) dragFrom.current.explorer ??= explorer;
    const next = setPaneSize("playground-explorer", width < EXPLORER_FOLD_BELOW ? 0 : width);
    if (next && !dragging) setPaneSize("playground-explorer-open", next);
  };
  const setTerminal = (pct: number, dragging = false) => {
    if (dragging) dragFrom.current.terminal ??= terminal;
    const next = setPaneSize("playground-terminal", pct < TERMINAL_FOLD_BELOW ? 0 : pct);
    if (next && !dragging) setPaneSize("playground-terminal-open", next);
  };
  const endDrag = (pane: "explorer" | "terminal") => {
    const from = dragFrom.current[pane];
    dragFrom.current[pane] = null;
    const [name, openName] = pane === "explorer" ? (["playground-explorer", "playground-explorer-open"] as const) : (["playground-terminal", "playground-terminal-open"] as const);
    const raw = document.documentElement.style.getPropertyValue(paneVar(name)).trim();
    const open = (raw ? Number.parseFloat(raw) : PANES[name].initial) || from;
    if (open) setPaneSize(openName, open);
  };
  const toggleExplorer = useCallback(
    (open = explorerFolded) => setPaneSize("playground-explorer", open ? explorerOpenAt : 0),
    [explorerFolded, explorerOpenAt]
  );
  const toggleTerminal = useCallback(
    (open = terminalFolded) => setPaneSize("playground-terminal", open ? terminalOpenAt : 0),
    [terminalFolded, terminalOpenAt]
  );

  // Shows the region: once the live tree, the open file, and the tabs are
  // in, or at once when the runner can't answer.
  const reveal = useCallback(() => {
    if (revealed.current) return;
    revealed.current = true;
    revealWorkspace();
  }, []);

  // A load: your tabs and folders from before, then the runner (the folder
  // workspace connects it).
  useLayoutEffect(() => {
    const html = document.documentElement;
    // A page reached by a client-side navigation hides itself the same way
    // (a hard load's inline script already did).
    if (!html.hasAttribute("data-restore-editor")) html.setAttribute("data-restore-editor", "");
    const timer = window.setTimeout(reveal, REVEAL_MS);
    store.hydrate();
    return () => {
      window.clearTimeout(timer);
      // Left before it showed: the next page isn't hidden on its account.
      reveal();
    };
  }, [store, reveal]);

  // Ready: the live tree, and the open file read with its language here (or
  // nothing to read).
  const activeBuf = store.active ? store.buffers.get(store.active) : undefined;
  useEffect(() => {
    if (revealed.current) return;
    if (offline) return reveal();
    const fileReady = !store.active || (activeBuf && activeBuf.status !== "loading" && (activeBuf.status !== "ready" || languageLoaded(fileLanguage(store.active))));
    if (store.live && fileReady) requestAnimationFrame(reveal);
  });

  // The note AI tools read: what's open, and where the cursor is.
  const selection = useRef<EditorSelection | null>(null);
  const note = () => writeNote(editorNote(store.active, store.tabs, selection.current));
  useEffect(() => {
    selection.current = null;
    note();
    // When the open file or the tabs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.active, store.tabs.join("\n")]);

  /** The terminal, shown (unfolded, or its tab on a phone) and focused once
      its shell is there. */
  const focusTerminal = useCallback(() => {
    if (!wide) setMobile("terminal");
    else if (terminalFolded) toggleTerminal(true);
    let tries = 0;
    const attempt = () => {
      const input = rootRef.current?.querySelector<HTMLElement>("[data-terminal] textarea");
      if (input) return input.focus();
      if (++tries < 60) requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  }, [wide, terminalFolded, toggleTerminal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!rootRef.current?.isConnected || e.defaultPrevented) return;
      // Ctrl+Backquote: to the terminal, or back to the editor from it.
      if (e.ctrlKey && e.code === "Backquote") {
        e.preventDefault();
        if (!inTerminal()) return focusTerminal();
        if (!wide) setMobile("code");
        return void requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(".cm-content")?.focus());
      }
      if (inTerminal()) return;
      const k = e.key.toLowerCase();
      if (mod(e) && !e.shiftKey && k === "p") {
        e.preventDefault();
        setQuickOpen(true);
      } else if (mod(e) && e.altKey && (k === "s" || e.code === "KeyS")) {
        e.preventDefault();
        void store.saveAll();
      } else if (mod(e) && k === "s") {
        e.preventDefault();
        if (store.active) void store.save(store.active);
      } else if (mod(e) && !e.shiftKey && k === "b") {
        e.preventDefault();
        if (wide) toggleExplorer();
        else setMobile((m) => (m === "files" ? "code" : "files"));
      } else if (e.altKey && !mod(e) && e.code === "KeyN") {
        e.preventDefault();
        if (wide) toggleExplorer(true);
        else setMobile("files");
        window.dispatchEvent(new CustomEvent(`hu:ide-new:${store.id}`, { detail: "file" }));
      } else if (e.altKey && !mod(e) && e.code === "KeyW") {
        e.preventDefault();
        if (store.active) store.closeFile(store.active);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, wide, focusTerminal, toggleExplorer]);

  const style = {
    "--playground-explorer": paneValue("playground-explorer"),
    "--playground-terminal": paneValue("playground-terminal"),
  } as React.CSSProperties;
  const barBtn = "inline-flex size-6 items-center justify-center rounded-btn text-ink-faint transition-colors hover:bg-raised hover:text-ink";

  return (
    <div
      ref={rootRef}
      data-workspace
      data-workspace-id={store.id}
      data-settled={store.settled ? "" : undefined}
      style={style}
      className={`flex bg-canvas ${
        // In the shell it fills the panel's content area exactly (definite
        // height on lg); on phones the panel isn't height-capped, so it's a
        // viewport-sized block.
        full ? "fixed inset-0 z-[100]" : "h-[calc(100dvh_-_var(--header-h))] lg:h-full lg:shrink-0"
      }`}
    >
      <CourseRail current="playground" />

      {/* What a restoring load keeps hidden until it's whole: the rail and
          the bar show at once. */}
      <div data-editor-pane className="@container flex min-w-0 flex-1 flex-col">
        {offline && (
          <p role="status" className="shrink-0 border-b border-line bg-raised px-3 py-1.5 text-xs text-ink">
            {store.runnerMessage} Until then, this is the playground as it starts.
          </p>
        )}

        {/* Phones: one region at a time, with no borders. */}
        <div role="tablist" aria-label="Playground regions" className="flex shrink-0 gap-1 border-b border-line px-2 py-1 lg:hidden">
          {(["files", "code", "terminal"] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={mobile === r}
              onClick={() => setMobile(r)}
              className={`rounded-btn px-2.5 py-1 text-xs font-medium uppercase tracking-wider ${mobile === r ? "bg-raised text-ink dark:text-gold" : "text-ink-faint"}`}
            >
              {r === "files" ? "Files" : r === "code" ? "Code" : "Terminal"}
            </button>
          ))}
        </div>

        <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
          <div ref={rowRef} className={`flex min-h-0 flex-1 ${mobile === "terminal" ? "max-lg:hidden" : ""}`}>
            <div
              data-playground-explorer
              className={`flex min-h-0 shrink-0 flex-col overflow-hidden lg:w-[var(--playground-explorer)] max-lg:flex-1 ${mobile === "files" ? "" : "max-lg:hidden"}`}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("[role=treeitem]") && !wide) setMobile("code");
              }}
            >
              <Explorer store={store} hiddenFiles={ideSettings.hiddenFiles} />
            </div>
            <ResizeHandle
              label="Resize the Explorer"
              value={explorer}
              min={0}
              max={EXPLORER.max}
              step={16}
              bigStep={48}
              // From folded away, any step out opens it at its narrowest.
              onChange={(next) => setExplorer(explorerFolded && next > 0 ? EXPLORER.min : next)}
              onDrag={(x) => setExplorer(x - (rowRef.current?.getBoundingClientRect().left ?? 0) - 4, true)}
              onDragEnd={() => endDrag("explorer")}
              onReset={() => setExplorer(EXPLORER.initial)}
              quiet={explorerFolded}
              className="playground-explorer-handle hidden lg:flex"
            />
            <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${mobile === "code" ? "" : "max-lg:hidden"}`}>
              <PlaygroundEditor
                store={store}
                changes={changes}
                pending={pending}
                explorerFolded={explorerFolded}
                onToggleExplorer={() => toggleExplorer()}
                screenMode={screenMode}
                onStepFull={stepFull}
                onSelection={(_path, at) => {
                  selection.current = at;
                  note();
                }}
              />
            </div>
          </div>
          <ResizeHandle
            orientation="horizontal"
            label="Resize the terminal"
            value={100 - terminal}
            min={100 - TERMINAL.max}
            max={100}
            step={5}
            bigStep={10}
            // From folded down, any step up opens it at its shortest.
            onChange={(v) => setTerminal(terminalFolded && v < 100 ? TERMINAL.min : 100 - v)}
            onDrag={(y) => {
              const r = bodyRef.current?.getBoundingClientRect();
              if (r && r.height) setTerminal(((r.bottom - y) / r.height) * 100, true);
            }}
            onDragEnd={() => endDrag("terminal")}
            onReset={() => setTerminal(TERMINAL.initial)}
            className="hidden lg:flex"
          />
          <section
            data-playground-terminal
            aria-label="Terminal"
            className={`flex min-h-0 shrink-0 flex-col lg:h-[var(--playground-terminal)] ${mobile === "terminal" ? "max-lg:flex-1" : "max-lg:hidden"}`}
          >
            <div className="hidden h-8 shrink-0 items-center gap-1 ps-3 pe-1.5 lg:flex">
              <h2 className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wider text-ink-faint dark:text-gold">Terminal</h2>
              <button
                type="button"
                onClick={() => toggleTerminal()}
                aria-expanded={!terminalFolded}
                aria-label={terminalFolded ? "Show the terminal" : "Fold the terminal away"}
                title={terminalFolded ? "Show the terminal (Ctrl+`)" : "Fold the terminal away"}
                className={barBtn}
              >
                {/* Each icon shows from the first paint, as the fold is
                    (globals.css). */}
                <ChevronUp className="playground-terminal-folded-only size-4" aria-hidden />
                <ChevronDown className="playground-terminal-open-only size-4" aria-hidden />
              </button>
            </div>
            <div data-playground-terminal-body className="flex min-h-0 flex-1 flex-col">
              <FolderTerminal
                store={store}
                visible={wide ? !terminalFolded : mobile === "terminal"}
                opening={OPENING}
                onOpenFile={(path, line) => {
                  store.openFile(path, { line });
                  if (!wide) setMobile("code");
                }}
              />
            </div>
          </section>
        </div>
      </div>
      <p role="status" className="sr-only">
        {store.notice}
      </p>
      {quickOpen && <QuickOpen store={store} onClose={() => setQuickOpen(false)} />}
      <FloatingNav />
    </div>
  );
}
