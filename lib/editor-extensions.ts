import { Compartment, EditorState, Prec, type Extension } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { StreamLanguage, bracketMatching, codeFolding, foldGutter, foldKeymap, indentOnInput, indentUnit } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { go } from "@codemirror/lang-go";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { http } from "@codemirror/legacy-modes/mode/http";
import { completionSources, SQL_SCHEMA } from "@/lib/code-editor-completions";
import { bracketColors } from "@/lib/bracket-colors";
import { typeErrorUnderlines } from "@/lib/editor-diagnostics";
import { tokenHighlight } from "@/lib/token-highlight";
import { languageId } from "@/lib/tokenize.mjs";

/**
 * The code editors' one setup (CodeMirror 6), shared by the compiler, Learn,
 * the runnable snippets, and the IDE: the theme drawn from the app's code
 * CSS variables, the gutters and guides, the keys, the language (for
 * indentation, brackets, and the comment toggle), and the colors, which
 * always come from the tokenizer behind the static code blocks
 * (lib/token-highlight.ts), so code reads the same everywhere.
 */

// Bash through CodeMirror's shell mode: brackets, quotes, and `#` for the
// comment toggle (colors come from the tokenizer, like every language).
const bash = StreamLanguage.define(shell);
// The IDE's other file types: the same idea, for indentation and comments.
const propertiesLang = StreamLanguage.define(properties);
const tomlLang = StreamLanguage.define(toml);
const dockerfileLang = StreamLanguage.define(dockerFile);
const httpLang = StreamLanguage.define(http);

/** Language id → CodeMirror language extension (its comment syntax drives
    the comment toggle, Mod-/). */
export function langExt(language: string): Extension {
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
    case "json":
      return json();
    case "markdown":
      return markdown();
    case "yaml":
      return yaml();
    case "css":
      return css();
    case "html":
      return html();
    case "env":
    case "properties":
      return propertiesLang;
    case "toml":
      return tomlLang;
    case "dockerfile":
      return dockerfileLang;
    case "http":
      return httpLang;
    default:
      return [];
  }
}

// Go and Makefiles are indented with tabs (gofmt, make), everything else
// with spaces.
export function indentUnitFor(tabSize: 2 | 4, language: string): string {
  return language === "go" || language === "makefile" ? "\t" : " ".repeat(tabSize);
}

/** Completion, when it's on: CodeMirror's own for the language (keywords,
    snippets, local names, SQL tables) plus ours (import lines, extra names). */
export function completion(on: boolean, language: string): Extension {
  if (!on) return [];
  const { sources, override } = completionSources(language);
  if (override) return autocompletion({ override: sources });
  return [autocompletion(), EditorState.languageData.of(() => sources.map((autocomplete) => ({ autocomplete })))];
}

/* Theme driven by the app's themeable code CSS vars (so the editor follows the
   code-theme picker + dark mode). No active-line highlight, no focus ring, and
   a neutral selection. */
export const cmTheme = EditorView.theme(
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
export const snippetTheme = Prec.highest(
  EditorView.theme({
    "&": { height: "auto", fontSize: "13px" },
    ".cm-scroller": { lineHeight: "24px" },
    ".cm-content": { padding: "16px 0" },
    ".cm-line": { padding: "0 112px 0 16px" },
  })
);

/** The settings an editor reads (components/code/editor-settings.tsx). */
export interface EditorSettingsLike {
  tabSize: 2 | 4;
  intellisense: boolean;
}

/** The parts of an editor's setup that change while it's open, each in a
    compartment so a settings change reconfigures it in place. */
export interface EditorCompartments {
  tab: Compartment;
  indent: Compartment;
  completion: Compartment;
}

export function editorCompartments(): EditorCompartments {
  return { tab: new Compartment(), indent: new Compartment(), completion: new Compartment() };
}

/** The effects that bring an editor's compartments in line with new settings. */
export function reconfigureSettings(c: EditorCompartments, settings: EditorSettingsLike, language: string) {
  return [
    c.tab.reconfigure(EditorState.tabSize.of(settings.tabSize)),
    c.indent.reconfigure(indentUnit.of(indentUnitFor(settings.tabSize, language))),
    c.completion.reconfigure(completion(settings.intellisense, language)),
  ];
}

/**
 * Every editor's extensions, in order: the full editor's gutters and guides
 * (or a snippet's bare code), the editing behavior, the settings
 * compartments, the colors, the language, the keys, and the theme. `keys`
 * come first in precedence (Mod-Enter runs, and the IDE's own), and `extra`
 * goes last.
 */
export function editorExtensions({
  language,
  settings,
  compartments,
  snippet = false,
  readOnly = false,
  keys = [],
  extra = [],
}: {
  language: string;
  settings: EditorSettingsLike;
  compartments: EditorCompartments;
  snippet?: boolean;
  readOnly?: boolean;
  keys?: Extension[];
  extra?: Extension[];
}): Extension[] {
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
  return [
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
    compartments.tab.of(EditorState.tabSize.of(settings.tabSize)),
    compartments.indent.of(indentUnit.of(indentUnitFor(settings.tabSize, language))),
    // The same colors as the static code blocks (lib/highlight.tsx).
    tokenHighlight(language),
    typeErrorUnderlines(),
    langExt(language),
    compartments.completion.of(completion(settings.intellisense, language)),
    ...keys.map((k) => Prec.highest(k)),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
    cmTheme,
    EditorState.readOnly.of(readOnly),
    ...extra,
  ];
}
