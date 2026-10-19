import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

/**
 * Type errors underlined in the editor, from the type check of the last run
 * (the Type check strip lists them). Each underline covers the word the
 * error points at and carries its message as a tooltip. They move with the
 * text as you edit, until the next run replaces them.
 */

export interface EditorDiagnostic {
  /** 1-based, as the type checker counts. */
  line: number;
  col: number;
  message: string;
}

const setDiagnostics = StateEffect.define<EditorDiagnostic[]>();

/** Where a line and column are in the document, kept inside it. */
export function positionAt(state: EditorState, line: number, col: number): number {
  const l = state.doc.line(Math.min(Math.max(1, line), state.doc.lines));
  return Math.min(l.from + Math.max(0, col - 1), l.to);
}

function decorations(state: EditorState, diagnostics: EditorDiagnostic[]): DecorationSet {
  const ranges = [];
  for (const d of diagnostics) {
    let from = positionAt(state, d.line, d.col);
    const line = state.doc.lineAt(from);
    // The word it points at, else one character, else the line's last one.
    const word = /^[\w$]+/.exec(line.text.slice(from - line.from))?.[0].length ?? 0;
    let to = from + (word || 1);
    if (to > line.to) {
      from = Math.max(line.from, line.to - 1);
      to = line.to;
    }
    if (from < to) ranges.push(Decoration.mark({ class: "cm-type-error", attributes: { title: d.message } }).range(from, to));
  }
  return Decoration.set(ranges, true);
}

const diagnosticsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setDiagnostics)) return decorations(tr.state, effect.value);
    return value.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

// A wavy underline in the code's own text color: every editor theme stays
// readable, and the strip says what's wrong.
const diagnosticsTheme = EditorView.baseTheme({
  ".cm-type-error": {
    textDecoration: "underline wavy var(--code-ink)",
    textDecorationThickness: "1px",
    textUnderlineOffset: "3px",
  },
});

export function typeErrorUnderlines(): Extension {
  return [diagnosticsField, diagnosticsTheme];
}

/** Underlines these type errors, in place of any before. */
export function showDiagnostics(view: EditorView, diagnostics: EditorDiagnostic[]) {
  view.dispatch({ effects: setDiagnostics.of(diagnostics) });
}
