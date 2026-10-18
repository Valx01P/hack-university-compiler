"use client";

import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  drawSelection,
  highlightSpecialChars,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  syntaxHighlighting,
  HighlightStyle,
  indentOnInput,
  bracketMatching,
  indentUnit,
  codeFolding,
  foldGutter,
  foldKeymap,
} from "@codemirror/language";
import { autocompletion } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { go } from "@codemirror/lang-go";
import { useCodeEditorSettings } from "@/components/code/editor-settings";
import { completionFor } from "@/lib/code-editor-completions";

/** Language id → CodeMirror language extension. */
function langExt(language: string) {
  switch (language) {
    case "python":
      return python();
    case "javascript":
      return javascript();
    case "cpp":
      return cpp();
    case "java":
      return java();
    case "go":
      return go();
    default:
      return [];
  }
}

function indentUnitFor(tabSize: 2 | 4): string {
  return " ".repeat(tabSize);
}

/* Theme driven by the app's themeable code CSS vars (so the editor follows the
   code-theme picker + dark mode). No active-line highlight, no focus ring, and
   a neutral selection. */
const cmTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--code-bg)",
      color: "var(--code-ink)",
      height: "100%",
      // 16px on phones so tapping into the editor doesn't trigger iOS
      // focus-zoom; the user's size on >=640px viewports. The host sets
      // `--code-fs` responsively via Tailwind (see the wrapper below).
      fontSize: "var(--code-fs, 13px)",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--font-code), ui-monospace, monospace",
      lineHeight: "1.6",
    },
    ".cm-content": { caretColor: "var(--code-ink)" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--code-ink)" },
    ".cm-gutters": {
      backgroundColor: "var(--code-bg)",
      color: "var(--code-gutter)",
      border: "none",
    },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
    // Neutral light-gray selection (the --code-selection token, stronger in
    // high contrast), not CodeMirror's default editor-blue. The focused
    // selector must match CM's own deep selector (…cm-selectionLayer…), which
    // outranks a plain `.cm-selectionBackground`, hence the full path +
    // !important so the gray wins whether or not the editor is focused.
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { background: "var(--code-selection) !important" },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--code-edge)",
      color: "var(--code-ink)",
      border: "none",
      borderRadius: "3px",
      margin: "0 2px",
      padding: "0 6px",
    },
  },
  { dark: true }
);

const cmHighlight = HighlightStyle.define([
  { tag: t.keyword, color: "var(--hl-keyword)" },
  { tag: [t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: "var(--hl-keyword)" },
  { tag: [t.string, t.special(t.string)], color: "var(--hl-string)" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "var(--hl-comment)", fontStyle: "italic" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--hl-number)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: "var(--hl-fn)" },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--hl-fn)" },
]);

export function CmEditor({
  value,
  language,
  onChange,
  ariaLabel,
}: {
  value: string;
  language: string;
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const indentComp = useRef(new Compartment());
  const tabComp = useRef(new Compartment());
  const completionComp = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const settings = useCodeEditorSettings();
  onChangeRef.current = onChange;

  // Create the editor once. Each language is its own page, so the grammar is
  // fixed for the editor's lifetime.
  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          tabComp.current.of(EditorState.tabSize.of(settings.tabSize)),
          indentComp.current.of(indentUnit.of(indentUnitFor(settings.tabSize))),
          indentationMarkers({
            markerType: "codeOnly",
            thickness: 1,
            activeThickness: 1.5,
            colors: {
              dark: "var(--code-edge)",
              activeDark: "var(--code-gutter)",
              light: "var(--code-edge)",
              activeLight: "var(--code-gutter)",
            },
          }),
          codeFolding({ placeholderText: "⋯ expand" }),
          foldGutter(),
          syntaxHighlighting(cmHighlight),
          langExt(language),
          completionComp.current.of(
            settings.intellisense
              ? autocompletion({ override: [completionFor(language)] })
              : []
          ),
          keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
          cmTheme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
          EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        tabComp.current.reconfigure(EditorState.tabSize.of(settings.tabSize)),
        indentComp.current.reconfigure(indentUnit.of(indentUnitFor(settings.tabSize))),
        completionComp.current.reconfigure(
          settings.intellisense
            ? autocompletion({ override: [completionFor(language)] })
            : []
        ),
      ],
    });
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

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={hostRef}
        style={{ "--code-user-fs": `${settings.fontSize}px` } as React.CSSProperties}
        className="code-dark slim-scroll h-full min-h-0 overflow-hidden bg-code-bg [--code-fs:max(16px,var(--code-user-fs))] sm:[--code-fs:var(--code-user-fs)]"
      />
    </div>
  );
}
