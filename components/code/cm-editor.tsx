"use client";

import { useEffect, useId, useRef } from "react";
import { EditorState, Compartment, Prec, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  rectangularSelection,
  crosshairCursor,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import {
  indentOnInput,
  bracketMatching,
  indentUnit,
  codeFolding,
  foldGutter,
  foldKeymap,
  StreamLanguage,
} from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { go } from "@codemirror/lang-go";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { useCodeEditorSettings } from "@/components/code/editor-settings";
import { completionSources, SQL_SCHEMA } from "@/lib/code-editor-completions";
import { bracketColors } from "@/lib/bracket-colors";
import { tokenHighlight } from "@/lib/token-highlight";
import { languageId } from "@/lib/tokenize.mjs";

// Bash through CodeMirror's shell mode: brackets, quotes, and `#` for the
// comment toggle (colors come from the tokenizer, like every language).
const bash = StreamLanguage.define(shell);

/** Language id → CodeMirror language extension (its comment syntax drives
    the comment toggle, Mod-/). */
function langExt(language: string) {
  switch (languageId(language)) {
    case "python":
      return python();
    case "javascript":
      return javascript();
    case "typescript":
      return javascript({ typescript: true });
    case "tsx":
      // JSX comments toggle as {/* */}.
      return javascript({ typescript: true, jsx: true });
    case "jsx":
      return javascript({ jsx: true });
    case "bash":
      return bash;
    case "cpp":
      return cpp();
    case "java":
      return java();
    case "go":
      return go();
    case "sql":
      // Uppercase keywords like the course, and the playground's sample
      // tables and columns.
      return sql({ dialect: PostgreSQL, upperCaseKeywords: true, schema: SQL_SCHEMA });
    default:
      return [];
  }
}

// Go is indented with tabs (gofmt), everything else with spaces.
function indentUnitFor(tabSize: 2 | 4, language: string): string {
  return language === "go" ? "\t" : " ".repeat(tabSize);
}

/** Completion, when it's on: CodeMirror's own for the language (keywords,
    snippets, local names, SQL tables) plus ours (import lines, extra names). */
function completion(on: boolean, language: string) {
  if (!on) return [];
  const { sources, override } = completionSources(language);
  if (override) return autocompletion({ override: sources });
  return [autocompletion(), EditorState.languageData.of(() => sources.map((autocomplete) => ({ autocomplete })))];
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
    // The bracket pair the cursor is at, outlined.
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "color-mix(in oklab, var(--code-gutter) 25%, transparent)",
      outline: "1px solid color-mix(in oklab, var(--code-gutter) 70%, transparent)",
      borderRadius: "2px",
    },
    ".cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket": {
      backgroundColor: "transparent",
      outline: "1px solid var(--danger)",
    },
    // Other places the selected word appears, and search hits.
    ".cm-selectionMatch": { backgroundColor: "color-mix(in oklab, var(--code-selection) 65%, transparent)" },
    ".cm-searchMatch": {
      backgroundColor: "color-mix(in oklab, var(--hl-number) 22%, transparent)",
      outline: "1px solid color-mix(in oklab, var(--hl-number) 55%, transparent)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "color-mix(in oklab, var(--hl-number) 45%, transparent)" },
    // Find and replace (Mod-F), in the editor's own colors.
    ".cm-panels": { backgroundColor: "var(--code-bg)", color: "var(--code-ink)", colorScheme: "dark" },
    ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--code-edge)" },
    ".cm-search": { padding: "6px 30px 6px 8px", fontFamily: "var(--font-body), system-ui, sans-serif", fontSize: "12px" },
    ".cm-search .cm-textfield": {
      backgroundColor: "color-mix(in oklab, var(--code-bg) 88%, var(--code-ink))",
      border: "1px solid var(--code-edge)",
      borderRadius: "5px",
      color: "var(--code-ink)",
      fontFamily: "var(--font-code), ui-monospace, monospace",
      fontSize: "12px",
      padding: "3px 7px",
    },
    ".cm-search .cm-textfield:focus": { outline: "none", borderColor: "var(--code-gutter)" },
    ".cm-search .cm-button": {
      backgroundImage: "none",
      backgroundColor: "transparent",
      border: "1px solid var(--code-edge)",
      borderRadius: "5px",
      color: "var(--code-ink)",
      fontSize: "12px",
      padding: "2px 8px",
    },
    ".cm-search .cm-button:hover": { backgroundColor: "color-mix(in oklab, var(--code-bg) 80%, var(--code-ink))" },
    ".cm-search label": { color: "var(--code-gutter)", fontSize: "12px" },
    ".cm-search input[type=checkbox]": { accentColor: "var(--hl-keyword)", verticalAlign: "-2px" },
    ".cm-search button[name=close]": { color: "var(--code-gutter)", fontSize: "18px", right: "8px", top: "4px", cursor: "pointer" },
    // Completion list.
    ".cm-tooltip": {
      backgroundColor: "var(--code-bg)",
      color: "var(--code-ink)",
      border: "1px solid var(--code-edge)",
      borderRadius: "6px",
      overflow: "hidden",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-code), ui-monospace, monospace", maxHeight: "14em" },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "2px 10px 2px 6px" },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--code-selection)", color: "var(--code-ink)" },
    ".cm-completionLabel": { color: "var(--code-ink)" },
    ".cm-completionMatchedText": { textDecoration: "none", color: "var(--hl-keyword)", fontWeight: "600" },
    ".cm-completionDetail": { color: "var(--code-gutter)", fontStyle: "normal", marginLeft: "0.75em" },
    ".cm-completionIcon": { color: "var(--code-gutter)", opacity: "1" },
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

/** A snippet in a lesson or cheatsheet, edited in place: it looks exactly
    like the static code block it replaces (no gutters or guides, the same
    padding, font, and line height) and grows with its code. */
const snippetTheme = Prec.highest(
  EditorView.theme({
    "&": { height: "auto", fontSize: "13px" },
    ".cm-scroller": { lineHeight: "24px" },
    ".cm-content": { padding: "16px 0" },
    ".cm-line": { padding: "0 112px 0 16px" },
  })
);

export function CmEditor({
  value,
  language,
  onChange,
  ariaLabel,
  readOnly = false,
  variant = "full",
  onRun,
  focusAt = null,
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
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const indentComp = useRef(new Compartment());
  const tabComp = useRef(new Compartment());
  const completionComp = useRef(new Compartment());
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
    // The full editor's gutters and guides; a snippet shows just its code.
    const chrome: Extension[] = snippet
      ? [snippetTheme]
      : [
          lineNumbers(),
          bracketColors(language),
          search({ top: true }),
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
        ];
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          ...chrome,
          highlightSpecialChars(),
          history(),
          drawSelection(),
          dropCursor(),
          // Several cursors: Alt-click, Alt-drag for a column, Mod-D for the
          // next match of the selection.
          EditorState.allowMultipleSelections.of(true),
          rectangularSelection(),
          crosshairCursor(),
          indentOnInput(),
          bracketMatching(),
          // Typing ( [ { or a quote adds its partner, and Enter between a
          // pair opens an indented line with the closer on its own line.
          closeBrackets(),
          highlightSelectionMatches(),
          tabComp.current.of(EditorState.tabSize.of(settings.tabSize)),
          indentComp.current.of(indentUnit.of(indentUnitFor(settings.tabSize, language))),
          // The same colors as the static code blocks (lib/highlight.tsx).
          tokenHighlight(language),
          langExt(language),
          completionComp.current.of(completion(settings.intellisense, language)),
          Prec.highest(
            keymap.of([
              {
                key: "Mod-Enter",
                run: () => {
                  if (!onRunRef.current) return false;
                  onRunRef.current();
                  return true;
                },
              },
            ])
          ),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
          cmTheme,
          EditorState.readOnly.of(readOnly),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
          EditorView.contentAttributes.of({ "aria-label": ariaLabel, "aria-describedby": exitHintId }),
        ],
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
    view.dispatch({
      effects: [
        tabComp.current.reconfigure(EditorState.tabSize.of(settings.tabSize)),
        indentComp.current.reconfigure(indentUnit.of(indentUnitFor(settings.tabSize, language))),
        completionComp.current.reconfigure(completion(settings.intellisense, language)),
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
