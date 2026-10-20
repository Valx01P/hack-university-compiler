"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { X } from "lucide-react";
import { useCodeEditorSettings } from "@/components/code/editor-settings";
import { FileIcon } from "@/components/ide/file-icon";
import { formatBytes } from "@/lib/ide-names";
import { commentDecorations, KEPT_MESSAGE, setComments } from "@/lib/comment-decorations";
import { editorCompartments, editorExtensions, reconfigureSettings } from "@/lib/editor-extensions";
import { positionAt, showDiagnostics } from "@/lib/editor-diagnostics";
import { useCodeCommentsHidden } from "@/lib/theme";
import { fileLanguage } from "@/lib/workspace-types";
import { useStore, type EditorHost, type WorkspaceStore } from "@/lib/workspace-store";

/**
 * The editor (architecture §8.2, §8.3): one CodeMirror view, one state per
 * open file, swapped with setState plus a scroll snapshot (the technique
 * CodeMirror's author recommends), so each file keeps its own undo history
 * and scroll. It's the store's EditorHost: the store asks it for a file's
 * text when saving, and hands it a file's new text when the disk changed
 * under a clean buffer. Settings reconfigure the file you see at once and
 * the others when they're next shown. The Code comments switch hides the
 * course's comments as decorations that never change the file.
 */

interface OpenState {
  state: EditorState;
  /** The settings and comments the state was last brought up to date with. */
  key: string;
  scroll?: ReturnType<EditorView["scrollSnapshot"]>;
}

export function EditorGroup({
  store,
  onRun,
  onCheck,
  className = "",
}: {
  store: WorkspaceStore;
  onRun?: () => void;
  onCheck?: () => void;
  className?: string;
}) {
  useStore(store, "files");
  const diagVersion = useStore(store, "diag");
  const settings = useCodeEditorSettings();
  const commentsHidden = useCodeCommentsHidden();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, OpenState>());
  const shown = useRef<string | null>(null);
  const compartments = useRef(editorCompartments());
  const live = useRef({ settings, commentsHidden, onRun, onCheck });
  live.current = { settings, commentsHidden, onRun, onCheck };
  const labelId = useId();
  const active = store.active;
  const buffer = active ? store.buffers.get(active) : undefined;
  const ready = buffer?.status === "ready";
  const [kept, setKept] = useState(0);

  const stateKey = (path: string) => `${live.current.settings.tabSize}:${live.current.settings.intellisense}:${live.current.commentsHidden}:${store.buffers.get(path)?.original === undefined ? "?" : "o"}`;

  function readOnly(path: string) {
    const node = store.nodes.get(path);
    return store.props.template.readonly.includes(path) || Boolean(node?.generated);
  }

  function createState(path: string, text: string): EditorState {
    const language = fileLanguage(path);
    const buf = store.buffers.get(path);
    return EditorState.create({
      doc: text,
      extensions: editorExtensions({
        language,
        settings: live.current.settings,
        compartments: compartments.current,
        readOnly: readOnly(path),
        keys: [
          keymap.of([
            { key: "Mod-s", preventDefault: true, run: () => (void store.save(path), true) },
            { key: "Mod-Alt-s", preventDefault: true, run: () => (void store.saveAll(), true) },
            { key: "Mod-Enter", run: () => (live.current.onRun ? (live.current.onRun(), true) : false) },
            { key: "Mod-Shift-Enter", run: () => (live.current.onCheck ? (live.current.onCheck(), true) : false) },
          ]),
        ],
        extra: [
          EditorView.updateListener.of((u) => {
            if (u.docChanged && shown.current === path) store.edited(path, u.state.doc.toString());
          }),
          EditorView.contentAttributes.of({ "aria-label": `${path}, editor`, "aria-describedby": labelId }),
          commentDecorations({
            language,
            hidden: live.current.commentsHidden,
            original: buf?.original,
            onKept: () => {
              store.announce(KEPT_MESSAGE);
              setKept((n) => n + 1);
            },
          }),
        ],
      }),
    });
  }

  /** Brings a kept state up to date with settings and the comments switch. */
  function freshen(path: string, open: OpenState): OpenState {
    const key = stateKey(path);
    if (open.key === key) return open;
    const language = fileLanguage(path);
    const tr = open.state.update({
      effects: [
        ...reconfigureSettings(compartments.current, live.current.settings, language),
        setComments.of({ hidden: live.current.commentsHidden, original: store.buffers.get(path)?.original }),
      ],
    });
    return { ...open, state: tr.state, key };
  }

  // The view, made once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({ parent: host, state: EditorState.create({ doc: "" }) });
    viewRef.current = view;
    const editorHost: EditorHost = {
      text: (path) => (shown.current === path ? view.state.doc.toString() : (states.current.get(path)?.state.doc.toString() ?? null)),
      replace: (path, text, opts) => {
        // A reload from disk is undoable, like Reset in the compiler.
        const spec = (state: EditorState) => ({
          changes: { from: 0, to: state.doc.length, insert: text },
          selection: EditorSelection.cursor(Math.min(state.selection.main.head, text.length)),
          userEvent: opts?.clean ? "reload" : "input.replace",
        });
        if (shown.current === path) view.dispatch(spec(view.state));
        else {
          const open = states.current.get(path);
          if (open) states.current.set(path, { ...open, state: open.state.update(spec(open.state)).state });
        }
      },
      rename: (from, to) => {
        // The file you see lives in the view; the others in the map.
        const doc = shown.current === from ? view.state.doc.toString() : states.current.get(from)?.state.doc.toString();
        states.current.delete(from);
        // The language may change with the name: start the state over with its text.
        if (doc !== undefined) states.current.set(to, { state: createState(to, doc), key: stateKey(to) });
        if (shown.current === from) shown.current = null;
      },
      close: (path) => {
        states.current.delete(path);
        if (shown.current === path) shown.current = null;
      },
      reveal: (path, line) => {
        if (shown.current !== path || !line) return;
        const pos = positionAt(view.state, line, 1);
        view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
        view.focus();
      },
    };
    store.host = editorHost;
    return () => {
      store.host = null;
      view.destroy();
      viewRef.current = null;
    };
    // The store and the view live as long as the group.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // Show the active file: its kept state, or a new one once it's read.
  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const leaving = shown.current;
    if (leaving && leaving !== active) {
      const open = states.current.get(leaving);
      if (open) states.current.set(leaving, { ...open, state: view.state, scroll: view.scrollSnapshot() });
    }
    if (!active || !ready) {
      if (shown.current !== null) {
        shown.current = null;
        view.setState(EditorState.create({ doc: "" }));
      }
      return;
    }
    if (shown.current === active) return;
    let open = states.current.get(active);
    if (!open) {
      open = { state: createState(active, store.initialText(active)), key: stateKey(active) };
    } else open = freshen(active, open);
    states.current.set(active, open);
    shown.current = active;
    view.setState(open.state);
    if (open.scroll) view.dispatch({ effects: open.scroll });
    const pending = store.pendingLine;
    if (pending && pending.path === active) {
      store.pendingLine = null;
      const pos = positionAt(view.state, pending.line, 1);
      view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
    }
    // The store's edited() keeps the dirty flag; a state made from unsaved
    // text starts dirty.
    store.edited(active, view.state.doc.toString());
  });

  // Settings and the comments switch: the file you see changes at once.
  useEffect(() => {
    const view = viewRef.current;
    const path = shown.current;
    if (!view || !path) return;
    const open = states.current.get(path);
    if (!open) return;
    const key = stateKey(path);
    if (open.key === key) return;
    view.dispatch({
      effects: [
        ...reconfigureSettings(compartments.current, settings, fileLanguage(path)),
        setComments.of({ hidden: commentsHidden, original: store.buffers.get(path)?.original }),
      ],
    });
    states.current.set(path, { ...open, state: view.state, key });
    // stateKey reads live settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, commentsHidden, buffer?.original]);

  // Squiggles from the Problems panel (on-save diagnostics and Check).
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !active || shown.current !== active) return;
    const items = (store.diagnostics.get(active) ?? []).map((d) => ({ line: d.line, col: d.col, message: `${d.code ? `${d.code}: ` : ""}${d.message}` }));
    showDiagnostics(view, items);
  }, [diagVersion, active, ready, store]);

  return (
    <div className={`code-dark relative flex min-h-0 flex-col bg-code-bg ${className}`}>
      <p id={labelId} className="sr-only">
        Press Escape, then Tab, to move focus out of the editor. Mod+S saves, Mod+P opens a file.
      </p>
      {buffer?.conflict && <ConflictBanner store={store} path={buffer.path} />}
      {buffer?.deleted && !buffer.conflict && (
        <Banner text={`${buffer.path} was deleted on disk. Your text is still here.`}>
          <BannerButton onClick={() => void store.restoreDeleted(buffer.path)}>Restore</BannerButton>
          <BannerButton onClick={() => store.closeFile(buffer.path)}>Close</BannerButton>
        </Banner>
      )}
      {kept > 0 && <span className="sr-only" role="status">{KEPT_MESSAGE}</span>}
      <div className="relative min-h-0 flex-1">
        <div
          ref={hostRef}
          className={`slim-scroll h-full min-h-0 overflow-hidden [--code-fs:max(16px,var(--code-user-fs))] sm:[--code-fs:var(--code-user-fs)] ${
            ready ? "" : "invisible"
          }`}
        />
        {!ready && (
          <div className="absolute inset-0 flex items-start p-4 font-mono text-xs text-code-gutter">
            {!active
              ? "Open a file from the explorer, or press Mod+P."
              : buffer?.status === "binary"
                ? `${active} is a binary file (${formatBytes(buffer.binary?.size)}, ${buffer.binary?.mime}). It opens in its own app, or download the workspace.`
                : buffer?.status === "error"
                  ? (buffer.error ?? "Couldn't open this file.")
                  : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function Banner({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-code-content-line px-3 py-1.5 text-xs text-code-ink">
      <span className="min-w-0 flex-1">{text}</span>
      {children}
    </div>
  );
}

function BannerButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-btn border border-code-content-line px-2 py-0.5 text-xs text-code-ink transition-colors hover:bg-code-edge">
      {children}
    </button>
  );
}

/** The file changed on disk (the terminal, a tool) while you had unsaved
    edits: keep yours, take the disk's, or compare them. */
function ConflictBanner({ store, path }: { store: WorkspaceStore; path: string }) {
  const [compare, setCompare] = useState(false);
  const buffer = store.buffers.get(path);
  return (
    <>
      <Banner text={`${path} changed on disk while you had unsaved edits.`}>
        <BannerButton onClick={() => void store.keepMine(path)}>Keep mine</BannerButton>
        <BannerButton onClick={() => store.loadFromDisk(path)}>Load from disk</BannerButton>
        <BannerButton onClick={() => setCompare((v) => !v)}>{compare ? "Hide comparison" : "Compare"}</BannerButton>
      </Banner>
      {compare && buffer?.conflict && <CompareView mine={store.host?.text(path) ?? ""} disk={buffer.conflict.text} path={path} />}
    </>
  );
}

/** Your text against the disk's, unified, read only (@codemirror/merge). */
function CompareView({ mine, disk, path }: { mine: string; disk: string; path: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let view: EditorView | null = null;
    let cancelled = false;
    void import("@codemirror/merge").then(({ unifiedMergeView }) => {
      if (cancelled) return;
      view = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: mine,
          extensions: [
            ...editorExtensions({ language: fileLanguage(path), settings: { tabSize: 4, intellisense: false }, compartments: editorCompartments(), readOnly: true }),
            unifiedMergeView({ original: disk, mergeControls: false, highlightChanges: true }),
          ],
        }),
      });
    });
    return () => {
      cancelled = true;
      view?.destroy();
    };
  }, [mine, disk, path]);
  return (
    <div className="max-h-[45%] shrink-0 border-b border-code-content-line">
      <p className="px-3 pt-1.5 text-[11px] uppercase tracking-wider text-code-gutter">Disk (removed lines) against yours (added lines)</p>
      <div ref={ref} className="slim-scroll max-h-64 overflow-auto" />
    </div>
  );
}

/** The editor's tabs: icon, name (with its folder when two names match),
    the unsaved dot, and close. Arrow keys move between them (one tab stop),
    middle-click closes. */
export function EditorTabs({ store, trailing }: { store: WorkspaceStore; trailing?: React.ReactNode }) {
  useStore(store, "files");
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const names = new Map<string, number>();
  for (const t of store.tabs) {
    const n = t.slice(t.lastIndexOf("/") + 1);
    names.set(n, (names.get(n) ?? 0) + 1);
  }
  const focusTab = (i: number) => {
    const path = store.tabs[(i + store.tabs.length) % store.tabs.length];
    if (!path) return;
    store.setActive(path);
    refs.current.get(path)?.focus();
  };
  return (
    <div className="code-dark flex h-8 shrink-0 items-stretch border-b border-code-content-line bg-code-bg">
      <div role="tablist" aria-label="Open files" className="slim-scroll flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {store.tabs.map((path, i) => {
          const name = path.slice(path.lastIndexOf("/") + 1);
          const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
          const buf = store.buffers.get(path);
          const selected = store.active === path;
          return (
            <div
              key={path}
              className={`group flex shrink-0 items-center border-r border-code-content-line ${selected ? "bg-[color-mix(in_oklab,var(--code-bg)_85%,var(--code-ink))]" : ""}`}
            >
              <button
                ref={(el) => {
                  if (el) refs.current.set(path, el);
                  else refs.current.delete(path);
                }}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                title={path}
                onClick={() => store.setActive(path)}
                onAuxClick={(e) => {
                  if (e.button === 1) store.closeFile(path);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") focusTab(i + 1);
                  else if (e.key === "ArrowLeft") focusTab(i - 1);
                  else if (e.key === "Home") focusTab(0);
                  else if (e.key === "End") focusTab(store.tabs.length - 1);
                  else return;
                  e.preventDefault();
                }}
                className={`flex h-full items-center gap-1.5 pl-2.5 pr-1 font-mono text-xs outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--code-ink)] ${
                  selected ? "text-code-ink" : "text-code-gutter hover:text-code-ink"
                }`}
              >
                <FileIcon name={name} className="size-3.5" />
                <span className="whitespace-nowrap">{name}</span>
                {(names.get(name) ?? 0) > 1 && folder && <span className="whitespace-nowrap text-code-gutter">· {folder}</span>}
                {buf?.conflict && <span className="text-code-ink" title="Changed on disk">!</span>}
              </button>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Close ${name}`}
                title={buf?.dirty ? "Unsaved changes. Close keeps them until you save or reset." : "Close (Alt+W)"}
                onClick={() => store.closeFile(path)}
                className="mr-1 inline-flex size-5 items-center justify-center rounded-btn text-code-gutter hover:bg-code-edge hover:text-code-ink"
              >
                {buf?.dirty ? (
                  <>
                    <span aria-label="unsaved" className="size-2 rounded-full bg-code-ink group-hover:hidden" />
                    <X className="hidden size-3.5 group-hover:block" aria-hidden />
                  </>
                ) : (
                  <X className={`size-3.5 ${selected ? "" : "opacity-0 group-hover:opacity-100"}`} aria-hidden />
                )}
              </button>
            </div>
          );
        })}
      </div>
      {trailing}
    </div>
  );
}
