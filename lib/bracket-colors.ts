import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { bashTokens } from "@/lib/bash-tokens.mjs";
import { languageId } from "@/lib/tokenize.mjs";

/**
 * Bracket pair colors: every ( [ { and its partner get a color by how deeply
 * they're nested (three colors, cycling), so nested blocks and calls are easy
 * to follow. Brackets inside strings and comments are left alone, and a
 * closing bracket with no partner is marked as an error.
 */

const OPEN = "([{";
const CLOSE = ")]}";
const LEVELS = 3;
const level = Array.from({ length: LEVELS }, (_, i) => Decoration.mark({ class: `cm-bracket-${i}` }));
const unmatched = Decoration.mark({ class: "cm-bracket-unmatched" });

// Syntax nodes whose brackets are just text.
const TEXTUAL = /String|Comment|Char|Rune|RegExp|Regex|Template|Escape|QuotedIdentifier/;

/** Bash's shell mode only guesses at its syntax (it reads `2#101` as a
    comment), so Bash's brackets go by the tokenizer that colors it: the
    offsets of brackets that are text, in strings, comments, and heredocs, or
    the `)` that ends a case pattern, which has no partner and needs none. */
function bashText(text: string): Set<number> {
  const skip = new Set<number>();
  const patterns: number[] = [];
  let pos = 0;
  for (const t of bashTokens(text, patterns)) {
    if (t.type) for (let i = 0; i < t.text.length; i++) if ("()[]{}".includes(t.text[i])) skip.add(pos + i);
    pos += t.text.length;
  }
  patterns.forEach((p) => skip.add(p));
  return skip;
}

function decorations(view: EditorView, bash: boolean): DecorationSet {
  const { state } = view;
  const tree = syntaxTree(state);
  const text = state.doc.toString();
  const skip = bash ? bashText(text) : null;
  // Depth has to be counted from the top of the document, so a block that
  // scrolls into view keeps its real depth. Programs here are small.
  const end = view.visibleRanges.length ? view.visibleRanges[view.visibleRanges.length - 1].to : text.length;
  const start = view.visibleRanges.length ? view.visibleRanges[0].from : 0;
  const builder = new RangeSetBuilder<Decoration>();
  const stack: string[] = [];
  for (let pos = 0; pos < end; pos++) {
    const ch = text[pos];
    const opens = OPEN.indexOf(ch);
    const closes = CLOSE.indexOf(ch);
    if (opens < 0 && closes < 0) continue;
    if (skip ? skip.has(pos) : TEXTUAL.test(tree.resolveInner(pos, 1).name)) continue;
    let mark: Decoration | null = null;
    if (opens >= 0) {
      mark = level[stack.length % LEVELS];
      stack.push(CLOSE[opens]);
    } else if (stack[stack.length - 1] === ch) {
      stack.pop();
      mark = level[stack.length % LEVELS];
    } else {
      mark = unmatched;
    }
    if (pos >= start) builder.add(pos, pos + 1, mark);
  }
  return builder.finish();
}

const plugin = (bash: boolean) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorations(view, bash);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
          this.decorations = decorations(update.view, bash);
        }
      }
    },
    { decorations: (v) => v.decorations }
  );

/** Colors follow the code theme: they reuse its number, keyword, and
    function colors, so they keep its contrast at every level. */
const theme = EditorView.baseTheme({
  ".cm-bracket-0": { color: "var(--hl-number)" },
  ".cm-bracket-1": { color: "var(--hl-keyword)" },
  ".cm-bracket-2": { color: "var(--hl-fn)" },
  ".cm-bracket-unmatched": { color: "var(--danger)", textDecoration: "underline wavy var(--danger)" },
});

export const bracketColors = (language: string): Extension => [plugin(languageId(language) === "bash"), theme];
