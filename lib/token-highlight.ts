import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import { tokenize } from "@/lib/highlight";

/**
 * Syntax colors for the code editors, from the same tokenizer as the static
 * code blocks in lessons and cheatsheets (lib/highlight.tsx): keywords,
 * strings, numbers, comments, and calls get the same `tok-*` classes, so code
 * reads the same everywhere, and an example you click into to edit keeps its
 * colors. The whole document is tokenized on each change (a block comment
 * can start above the view, and programs here are small), and only what's
 * on screen is marked.
 */

const marks: Record<string, Decoration> = {};
const mark = (type: string) => (marks[type] ??= Decoration.mark({ class: `tok-${type}` }));

function decorations(view: EditorView, language: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const ranges = view.visibleRanges;
  let r = 0;
  let pos = 0;
  for (const token of tokenize(view.state.doc.toString(), language)) {
    const from = pos;
    pos += token.text.length;
    if (!token.type) continue;
    while (r < ranges.length && ranges[r].to <= from) r++;
    if (r === ranges.length) break;
    if (pos > ranges[r].from) builder.add(from, pos, mark(token.type));
  }
  return builder.finish();
}

export function tokenHighlight(language: string): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorations(view, language);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) this.decorations = decorations(update.view, language);
      }
    },
    { decorations: (v) => v.decorations }
  );
}
