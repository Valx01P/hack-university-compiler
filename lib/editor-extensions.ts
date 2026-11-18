import { Compartment, EditorState, Prec, RangeSetBuilder, countColumn, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
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
import { autocompletion, closeBrackets, closeBracketsKeymap, type CompletionSource } from "@codemirror/autocomplete";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { completionSources, SQL_SCHEMA } from "@/lib/code-editor-completions";
import { bracketColors } from "@/lib/bracket-colors";
import { typeErrorUnderlines } from "@/lib/editor-diagnostics";
import { tokenHighlight } from "@/lib/token-highlight";
import { indentRules, insertNewlineKeepIndent } from "@/lib/indent-rules";
import { languageId } from "@/lib/tokenize.mjs";

/**
 * The code editors' one setup (CodeMirror 6), shared by the compiler, Learn,
 * the runnable snippets, and the IDE: the theme drawn from the app's code
 * CSS variables, the gutters and guides, the keys, the language (for
 * indentation, brackets, and the comment toggle, loaded with loadLanguage
 * before an editor is made), and the colors, which always come from the
 * tokenizer behind the static code blocks (lib/token-highlight.ts), so code
 * reads the same everywhere.
 */

/** A language's CodeMirror support: the extension (indentation, brackets,
    folding, and the comment toggle, Mod-/, from its comment syntax), and
    the completions of its own that ours wrap (Python's, see
    lib/code-editor-completions.ts). */
interface LanguageSupport {
  extension: Extension;
  completions?: CompletionSource[];
}

// Each language's support is its own chunk, loaded the first time an editor
// needs it (loadLanguage), so a page carries only the grammars it shows: a
// compiler or Learn page its own language, the IDE the kinds of files it
// opens. Bash, and the IDE's other file types, go through CodeMirror's
// legacy stream modes, for brackets, quotes, indentation, and comments
// (colors come from the tokenizer, like every language).
const LOADERS: Record<string, () => Promise<LanguageSupport>> = {
  python: () =>
    import("@codemirror/lang-python").then((m) => ({ extension: m.python(), completions: [m.localCompletionSource, m.globalCompletion] })),
  javascript: () => import("@codemirror/lang-javascript").then((m) => ({ extension: m.javascript() })),
  typescript: () => import("@codemirror/lang-javascript").then((m) => ({ extension: m.javascript({ typescript: true }) })),
  // JSX comments toggle as {/* */}.
  tsx: () => import("@codemirror/lang-javascript").then((m) => ({ extension: m.javascript({ typescript: true, jsx: true }) })),
  jsx: () => import("@codemirror/lang-javascript").then((m) => ({ extension: m.javascript({ jsx: true }) })),
  bash: () => import("@codemirror/legacy-modes/mode/shell").then((m) => ({ extension: StreamLanguage.define(m.shell) })),
  cpp: () => import("@codemirror/lang-cpp").then((m) => ({ extension: m.cpp() })),
  java: () => import("@codemirror/lang-java").then((m) => ({ extension: m.java() })),
  go: () => import("@codemirror/lang-go").then((m) => ({ extension: m.go() })),
  // Uppercase keywords like the course, and the playground's sample tables
  // and columns.
  sql: () =>
    import("@codemirror/lang-sql").then((m) => ({ extension: m.sql({ dialect: m.PostgreSQL, upperCaseKeywords: true, schema: SQL_SCHEMA }) })),
  json: () => import("@codemirror/lang-json").then((m) => ({ extension: m.json() })),
  markdown: () => import("@codemirror/lang-markdown").then((m) => ({ extension: m.markdown() })),
  yaml: () => import("@codemirror/lang-yaml").then((m) => ({ extension: m.yaml() })),
  css: () => import("@codemirror/lang-css").then((m) => ({ extension: m.css() })),
  html: () => import("@codemirror/lang-html").then((m) => ({ extension: m.html() })),
  env: () => import("@codemirror/legacy-modes/mode/properties").then((m) => ({ extension: StreamLanguage.define(m.properties) })),
  properties: () => import("@codemirror/legacy-modes/mode/properties").then((m) => ({ extension: StreamLanguage.define(m.properties) })),
  toml: () => import("@codemirror/legacy-modes/mode/toml").then((m) => ({ extension: StreamLanguage.define(m.toml) })),
  dockerfile: () => import("@codemirror/legacy-modes/mode/dockerfile").then((m) => ({ extension: StreamLanguage.define(m.dockerFile) })),
  http: () => import("@codemirror/legacy-modes/mode/http").then((m) => ({ extension: StreamLanguage.define(m.http) })),
};

const supports = new Map<string, LanguageSupport>();
const loads = new Map<string, Promise<void>>();

/** Loads a language's support, once. An editor waits on it before it's
    made, so its code shows with its brackets and folds from the first
    frame, never repainting when the grammar lands. A chunk that won't load
    (the app rebuilt under an open page) leaves the language without
    support, as for a plain text file, rather than holding the editor back. */
export function loadLanguage(language: string): Promise<void> {
  const id = languageId(language);
  let load = loads.get(id);
  if (!load) {
    const loader = LOADERS[id];
    load = loader
      ? loader().then(
          (support) => void supports.set(id, support),
          () => void supports.set(id, { extension: [] })
        )
      : Promise.resolve();
    loads.set(id, load);
  }
  return load;
}

/** Whether an editor in this language can be made right away (its support
    has loaded, or it has none to load). */
export function languageLoaded(language: string): boolean {
  const id = languageId(language);
  return !(id in LOADERS) || supports.has(id);
}

/** Language id → CodeMirror language extension, once loadLanguage has it
    (nothing before, as for a language without one). */
export function langExt(language: string): Extension {
  return supports.get(languageId(language))?.extension ?? [];
}

// The languages whose blocks are their indentation, with no closing line.
const OFFSIDE = new Set(["python", "yaml"]);

/** The line numbers stay put while the code scrolls sideways (they're
    sticky), and with no fill of their own (see-through under the stars) the
    code would show through them. So the code, and the selection and cursor
    drawn over it, are clipped at the gutter's right edge (cmTheme's
    clip-paths): the code by how far it's scrolled, its layers, which start
    at the scroller's left edge, by that and the gutter's width. Kept on
    every scroll, and on every layout change (a gutter widening at line
    100, an editor shown again). */
const clipUnderGutters = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {
      view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
      view.requestMeasure(this.measure);
    }
    measure = {
      read: (view: EditorView) => ({
        x: view.scrollDOM.scrollLeft,
        gutters: (view.scrollDOM.querySelector(".cm-gutters") as HTMLElement | null)?.offsetWidth ?? 0,
      }),
      write: ({ x, gutters }: { x: number; gutters: number }, view: EditorView) => {
        view.dom.style.setProperty("--cm-clip-x", `${x}px`);
        view.dom.style.setProperty("--cm-gutters-w", `${gutters}px`);
      },
    };
    // Right away, in the same frame as the scroll, so nothing shows through
    // for a frame.
    onScroll = () => this.measure.write(this.measure.read(this.view), this.view);
    update(u: { geometryChanged: boolean; view: EditorView }) {
      if (u.geometryChanged) u.view.requestMeasure(this.measure);
    }
    destroy() {
      this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
    }
  }
);

// Go and Makefiles are indented with tabs (gofmt, make), everything else
// with spaces.
export function indentUnitFor(tabSize: 2 | 4, language: string): string {
  return language === "go" || language === "makefile" ? "\t" : " ".repeat(tabSize);
}

/** Completion, when it's on: CodeMirror's own for the language (keywords,
    snippets, local names, SQL tables) plus ours (import lines, extra names). */
export function completion(on: boolean, language: string): Extension {
  if (!on) return [];
  const { sources, override } = completionSources(language, supports.get(languageId(language))?.completions);
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
      fontSize: "var(--code-fs, 15px)",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: "var(--font-code), ui-monospace, monospace",
      lineHeight: "1.6",
    },
    // Clipped at the line numbers' right edge as the code scrolls under them
    // (clipUnderGutters), and nowhere else (the other sides reach far out).
    ".cm-content": { caretColor: "var(--code-ink)", clipPath: "inset(-100px -100000px -100px var(--cm-clip-x, 0px))" },
    ".cm-layer": { clipPath: "inset(-100000px -100000px -100000px calc(var(--cm-clip-x, 0px) + var(--cm-gutters-w, 0px)))" },
    // A wrapped line's hanging indent (hangingIndent): its indentation, at
    // most half the width, so a deep line still has room. Inline widgets in
    // it (a fold's placeholder) don't take the pull-back themselves.
    ".cm-hu-hang": {
      paddingLeft: "calc(min(var(--hu-hang), 50%) + var(--hu-line-pad, 6px))",
      textIndent: "calc(-1 * min(var(--hu-hang), 50%))",
    },
    ".cm-hu-hang *": { textIndent: "0" },
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
    // One selection on the page at a time: an editor's shows only while it
    // has focus, so clicking or selecting anywhere else clears it from
    // sight, the way a text field's does (it's still there if you Tab
    // back in). The places the selected word appears again go with it.
    "&:not(.cm-focused) .cm-selectionLayer": { display: "none" },
    "&:not(.cm-focused) .cm-selectionMatch": { backgroundColor: "transparent" },
    // The bracket pair the cursor is at, outlined, and nothing filled in, so
    // the brackets keep their own colors (the Matching brackets switch in the
    // settings gear turns it off). A bracket with no partner gets --danger's
    // outline instead (the code's own text color in code areas).
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "transparent",
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
    // --hu-line-pad: the line's own left padding, for wrapped lines'
    // hanging indent (hangingIndent), 6px in the full editor.
    ".cm-line": { padding: "0 112px 0 16px", "--hu-line-pad": "16px" },
  })
);

/** The settings an editor reads (components/code/editor-settings.tsx). */
export interface EditorSettingsLike {
  tabSize: 2 | 4;
  intellisense: boolean;
  /** Outline the bracket pair at the cursor. */
  bracketHighlight: boolean;
  /** Long lines wrap at the editor's edge instead of scrolling sideways. */
  lineWrap: boolean;
}

/** The parts of an editor's setup that change while it's open, each in a
    compartment so a settings change reconfigures it in place. */
export interface EditorCompartments {
  tab: Compartment;
  indent: Compartment;
  completion: Compartment;
  brackets: Compartment;
  wrap: Compartment;
}

export function editorCompartments(): EditorCompartments {
  return { tab: new Compartment(), indent: new Compartment(), completion: new Compartment(), brackets: new Compartment(), wrap: new Compartment() };
}

const brackets = (on: boolean) => (on ? bracketMatching() : []);

// A line's hanging indent, one decoration per width (in columns).
const hangs = new Map<number, Decoration>();
const hangOf = (columns: number) => {
  let d = hangs.get(columns);
  if (!d) hangs.set(columns, (d = Decoration.line({ class: "cm-hu-hang", attributes: { style: `--hu-hang: ${columns}ch` } })));
  return d;
};

function hangingLines(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let last = -1;
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      pos = line.to + 1;
      if (line.number === last) continue;
      last = line.number;
      const indent = /^[ \t]*/.exec(line.text)![0];
      if (indent && indent.length < line.length) builder.add(line.from, line.from, hangOf(countColumn(indent, view.state.tabSize)));
    }
  }
  return builder.finish();
}

/** With line wrapping on, a wrapped line's later rows line up under its code,
    past its indentation, the way VS Code wraps: each indented line is padded
    by its indentation, and its first row pulled back by as much (cmTheme's
    .cm-hu-hang), so that row stays where it was, and so do the indent
    guides, which are drawn from the line's edge (and run on down through the
    rows' indentation). */
const hangingIndent = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = hangingLines(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.startState.tabSize !== u.state.tabSize) this.decorations = hangingLines(u.view);
    }
  },
  { decorations: (v) => v.decorations }
);

const wrap = (on: boolean) => (on ? [EditorView.lineWrapping, hangingIndent] : []);

/** The effects that bring an editor's compartments in line with new settings. */
export function reconfigureSettings(c: EditorCompartments, settings: EditorSettingsLike, language: string) {
  return [
    c.tab.reconfigure(EditorState.tabSize.of(settings.tabSize)),
    c.indent.reconfigure(indentUnit.of(indentUnitFor(settings.tabSize, language))),
    c.completion.reconfigure(completion(settings.intellisense, language)),
    c.brackets.reconfigure(brackets(settings.bracketHighlight)),
    c.wrap.reconfigure(wrap(settings.lineWrap)),
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
        clipUnderGutters,
        bracketColors(language),
        search({ top: true }),
        indentationMarkers({
          // A blank line inside a block keeps the block's guide, up to the
          // line that closes it ("fullScope"). Python and YAML have no
          // closing line, so their blocks end at the last line of code
          // ("codeOnly"), the way VS Code draws them.
          markerType: OFFSIDE.has(languageId(language)) ? "codeOnly" : "fullScope",
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
    compartments.brackets.of(brackets(settings.bracketHighlight)),
    compartments.wrap.of(wrap(settings.lineWrap)),
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
    // Enter keeps a finished line's level (lib/indent-rules.ts).
    indentRules(language),
    compartments.completion.of(completion(settings.intellisense, language)),
    ...keys.map((k) => Prec.highest(k)),
    // Enter (and Shift-Enter) keep the indentation on the line you leave.
    keymap.of([
      { key: "Enter", run: insertNewlineKeepIndent, shift: insertNewlineKeepIndent },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      indentWithTab,
    ]),
    cmTheme,
    EditorState.readOnly.of(readOnly),
    ...extra,
  ];
}
