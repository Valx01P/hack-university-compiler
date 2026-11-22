"use client";

import { use, useEffect, useId, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useCodeEditorSettings } from "@/components/code/editor-settings";
import { editorCompartments, editorExtensions, languageLoaded, loadLanguage, reconfigureSettings } from "@/lib/editor-extensions";
import { positionAt, showDiagnostics, type EditorDiagnostic } from "@/lib/editor-diagnostics";

// For a snippet's hover warm-up (components/learn/runnable-snippet.tsx),
// which loads this module lazily.
export { loadLanguage };

/** Where the cursor is and what's selected, 1-based lines. */
export interface EditorSelection {
  line: number;
  col: number;
  /** The selected lines and text, when something is selected. */
  from: number | null;
  to: number | null;
  text: string;
}

/** Where each editor was scrolled to, by its scrollKey, for as long as the
    page is open: the line at the top, how far it's scrolled past that
    line's top, and the sideways scroll. A line, not a position, so another
    text with the same key (your code and the answer) opens on the same
    line. */
const scrollPlaces = new Map<string, { line: number; into: number; left: number }>();

function scrollPlaceOf(view: EditorView) {
  const top = view.scrollDOM.getBoundingClientRect().top;
  const block = view.lineBlockAtHeight(top - view.documentTop);
  // Measured from the line start's caret box, which is what scrolling a
  // position into view lines up (a little below the line block's top), so
  // opening it again lands to the pixel.
  const caret = view.coordsAtPos(block.from);
  const lineTop = caret ? caret.top : view.documentTop + block.top;
  return { line: view.state.doc.lineAt(block.from).number, into: top - lineTop, left: view.scrollDOM.scrollLeft };
}

/** Text to review against what was there before (lib/outside-changes.ts):
    the editor shows the difference, each part to keep or undo. */
export interface EditorReview {
  original: string;
  /** Every part has been kept or undone: the text that's left. */
  onResolved: (text: string) => void;
}

export function CmEditor({
  value,
  language,
  onChange,
  ariaLabel,
  readOnly = false,
  variant = "full",
  onRun,
  focusAt = null,
  diagnostics = null,
  cursorAt = null,
  onSelection,
  review = null,
  scrollKey,
}: {
  value: string;
  language: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  /** Show the code without letting it be edited (fixed when the editor is
      created, so give the editor a new key to switch). */
  readOnly?: boolean;
  /** "full" for the compiler and Learn editors, "snippet" for a code block
      edited where it sits. */
  variant?: "full" | "snippet";
  /** Mod-Enter runs the code (snippets). */
  onRun?: () => void;
  /** Focus the editor when it appears, with the cursor at this point on the
      screen (where you clicked the code block it replaced). */
  focusAt?: { x: number; y: number } | null;
  /** Type errors to underline, found in `doc`: shown only while the editor
      still holds that code (a run of it), then moved along with your edits. */
  diagnostics?: { doc: string; items: EditorDiagnostic[] } | null;
  /** Puts the cursor here (1-based line and column) and focuses the editor,
      each time it's a new object (a type error's link). */
  cursorAt?: { line: number; col: number } | null;
  /** The cursor and selection, each time they move. */
  onSelection?: (selection: EditorSelection) => void;
  /** Shows the text against `original`, changes to keep or undo. */
  review?: EditorReview | null;
  /** Editors with the same key share one scroll place, kept while the page
      is open: a new one opens where the last one was scrolled to. Your code
      and the answer share theirs, so toggling between them keeps the same
      lines in view. */
  scrollKey?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartments = useRef(editorCompartments());
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  const onSelectionRef = useRef(onSelection);
  onSelectionRef.current = onSelection;
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const scrollKeyRef = useRef(scrollKey);
  scrollKeyRef.current = scrollKey;
  // Moved by you (or a jump you asked for), so its scroll is worth keeping.
  // Until then, a scroll is only the place it opened on, which a shorter
  // text may have had to cut short.
  const touched = useRef(false);
  const reviewSlot = useRef(new Compartment());
  const settings = useCodeEditorSettings();
  // What the editor starts from when it's made after its language loads.
  const valueRef = useRef(value);
  const settingsRef = useRef(settings);
  onChangeRef.current = onChange;
  onRunRef.current = onRun;
  valueRef.current = value;
  settingsRef.current = settings;
  const snippet = variant === "snippet";
  const exitHintId = useId();

  // Each language's support is its own chunk (lib/editor-extensions.ts),
  // asked for as soon as the editor renders, so it's usually here before
  // the editor is made. A snippet waits for it in its Suspense fallback,
  // the static block it replaces (runnable-snippet.tsx), so it never shows
  // empty. The full editor waits in the effect below, its box empty until
  // the editor is made anyway, so a page still hydrates without waiting.
  if (typeof window !== "undefined" && !languageLoaded(language)) {
    if (snippet) use(loadLanguage(language));
    else void loadLanguage(language);
  }

  // Create the editor once its language is here (at once when it already
  // is). Each language is its own page, so the grammar is fixed for the
  // editor's lifetime.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || viewRef.current) return;
    if (languageLoaded(language)) return create(host);
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    void loadLanguage(language).then(() => {
      if (!cancelled && hostRef.current === host && !viewRef.current) cleanup = create(host);
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function create(host: HTMLDivElement) {
    // Until its first measure (next frame), CodeMirror lays the line numbers
    // out with a 14px line-height guess. Keep the editor invisible until that
    // measure lands so a load can never show the gutter jumping into place.
    // The fallback reveals it anyway if a measure never comes.
    // (A snippet has no gutter, and it replaces a static block that looks the
    // same, so it shows at once.)
    if (!snippet) host.style.visibility = "hidden";
    const reveal = () => {
      host.style.visibility = "";
    };
    const fallback = window.setTimeout(reveal, 300);
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: valueRef.current,
        extensions: editorExtensions({
          language,
          settings: settingsRef.current,
          compartments: compartments.current,
          snippet,
          readOnly,
          keys: [
            keymap.of([
              {
                key: "Mod-Enter",
                run: () => {
                  if (!onRunRef.current) return false;
                  onRunRef.current();
                  return true;
                },
              },
            ]),
          ],
          extra: [
            reviewSlot.current.of([]),
            EditorView.updateListener.of((u) => {
              if (u.docChanged) onChangeRef.current(u.state.doc.toString());
              if ((u.selectionSet || u.docChanged || u.focusChanged) && onSelectionRef.current) onSelectionRef.current(selectionOf(u.state));
            }),
            EditorView.contentAttributes.of({ "aria-label": ariaLabel, "aria-describedby": exitHintId }),
          ],
        }),
      }),
    });
    viewRef.current = view;
    shownReview.current = null;
    setReview(view, reviewRef.current?.original ?? null);
    view.requestMeasure({ read: () => null, write: reveal });
    // Open where this key was last scrolled to. CodeMirror applies the
    // scroll in the same frame as the reveal, so it never shows the top
    // first. The sideways scroll goes on after it, since scrolling a line
    // into view also brings its start into view.
    touched.current = false;
    const key = scrollKeyRef.current;
    const place = key ? scrollPlaces.get(key) : undefined;
    let leftFrame = 0;
    if (place) {
      const line = view.state.doc.line(Math.min(place.line, view.state.doc.lines));
      view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: -place.into }) });
      if (place.left) {
        leftFrame = requestAnimationFrame(() => {
          leftFrame = requestAnimationFrame(() => {
            if (viewRef.current === view) view.scrollDOM.scrollLeft = place.left;
          });
        });
      }
    }
    const touch = () => {
      touched.current = true;
    };
    const keep = () => {
      const key = scrollKeyRef.current;
      if (key && touched.current && view.dom.isConnected) scrollPlaces.set(key, scrollPlaceOf(view));
    };
    const touches = ["wheel", "pointerdown", "keydown", "touchstart"] as const;
    for (const type of touches) view.dom.addEventListener(type, touch, { passive: true });
    view.scrollDOM.addEventListener("scroll", keep, { passive: true });
    // Put the cursor where the click landed on the block this replaced. On
    // the next frame, outside CodeMirror's own update, where reading the
    // layout is allowed.
    let focusFrame = 0;
    if (focusAt) {
      focusFrame = requestAnimationFrame(() => {
        if (viewRef.current !== view) return;
        const pos = view.posAtCoords(focusAt);
        view.focus();
        if (pos !== null) view.dispatch({ selection: { anchor: pos } });
      });
    }
    return () => {
      window.clearTimeout(fallback);
      cancelAnimationFrame(focusFrame);
      cancelAnimationFrame(leftFrame);
      for (const type of touches) view.dom.removeEventListener(type, touch);
      view.scrollDOM.removeEventListener("scroll", keep);
      view.destroy();
      viewRef.current = null;
    };
  }

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: reconfigureSettings(compartments.current, settings, language) });
  }, [settings, language]);

  // Apply external value changes (restoring saved code, Reset) as a normal
  // transaction so they stay undoable.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value === current) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    showDiagnostics(view, diagnostics && diagnostics.doc === view.state.doc.toString() ? diagnostics.items : []);
  }, [diagnostics]);

  // A review: the merge view's difference against what was there, each
  // part with its keep and undo, until none is left. Loaded when one comes,
  // and put on the editor when it's made, too (it's made once its language
  // loads, maybe after the review came).
  const original = review?.original ?? null;
  const shownReview = useRef<string | null>(null);
  const setReview = useRef((view: EditorView, text: string | null) => {
    if (shownReview.current === text) return;
    shownReview.current = text;
    if (text === null) {
      view.dispatch({ effects: reviewSlot.current.reconfigure([]) });
      return;
    }
    void import("@codemirror/merge").then(({ unifiedMergeView, getChunks }) => {
      if (viewRef.current !== view || shownReview.current !== text) return;
      view.dispatch({
        effects: reviewSlot.current.reconfigure([
          unifiedMergeView({ original: text, mergeControls: true, gutter: true, highlightChanges: true, syntaxHighlightDeletions: true }),
          EditorView.updateListener.of((u) => {
            const chunks = getChunks(u.state)?.chunks;
            if (chunks && chunks.length === 0) reviewRef.current?.onResolved(u.state.doc.toString());
          }),
        ]),
      });
    });
  }).current;
  useEffect(() => {
    if (viewRef.current) setReview(viewRef.current, original);
  }, [original, setReview]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !cursorAt) return;
    const pos = positionAt(view.state, cursorAt.line, cursorAt.col);
    touched.current = true;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  }, [cursorAt]);

  return (
    <div className={snippet ? "relative" : "relative h-full min-h-0"}>
      {/* Zoom comes from --code-user-fs on <html> (set before first paint
          from your saved settings), never from state, so it can't jump. */}
      <div
        ref={hostRef}
        className={
          snippet
            ? "code-dark slim-scroll overflow-hidden bg-code-bg"
            : "code-dark slim-scroll h-full min-h-0 overflow-hidden bg-code-bg [--code-fs:max(16px,var(--code-user-fs))] sm:[--code-fs:var(--code-user-fs)]"
        }
      />
      {/* Tab indents code, so screen readers hear the way out (CodeMirror's
          Escape, then Tab). */}
      <p id={exitHintId} className="sr-only">
        Press Escape, then Tab, to move focus out of the editor.
      </p>
    </div>
  );
}

/** Where the cursor is and what's selected in a state (the playground's
    tabs read it too, components/ide/editor-group.tsx). */
export function selectionOf(state: EditorState): EditorSelection {
  const range = state.selection.main;
  const head = state.doc.lineAt(range.head);
  if (range.empty) return { line: head.number, col: range.head - head.from + 1, from: null, to: null, text: "" };
  const from = state.doc.lineAt(range.from).number;
  const end = state.doc.lineAt(range.to);
  // Ending at a line's very start (Shift+Down from a line's start), that
  // line isn't part of it.
  const to = range.to === end.from && end.number > from ? end.number - 1 : end.number;
  return { line: head.number, col: range.head - head.from + 1, from, to, text: state.sliceDoc(range.from, range.to) };
}
