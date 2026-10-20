"use client";

import { useEffect, useId, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useCodeEditorSettings } from "@/components/code/editor-settings";
import { editorCompartments, editorExtensions, reconfigureSettings } from "@/lib/editor-extensions";
import { positionAt, showDiagnostics, type EditorDiagnostic } from "@/lib/editor-diagnostics";

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
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartments = useRef(editorCompartments());
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  const settings = useCodeEditorSettings();
  onChangeRef.current = onChange;
  onRunRef.current = onRun;
  const snippet = variant === "snippet";
  const exitHintId = useId();

  // Create the editor once. Each language is its own page, so the grammar is
  // fixed for the editor's lifetime.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || viewRef.current) return;
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
        doc: value,
        extensions: editorExtensions({
          language,
          settings,
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
            EditorView.updateListener.of((u) => {
              if (u.docChanged) onChangeRef.current(u.state.doc.toString());
            }),
            EditorView.contentAttributes.of({ "aria-label": ariaLabel, "aria-describedby": exitHintId }),
          ],
        }),
      }),
    });
    viewRef.current = view;
    view.requestMeasure({ read: () => null, write: reveal });
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
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !cursorAt) return;
    const pos = positionAt(view.state, cursorAt.line, cursorAt.col);
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
