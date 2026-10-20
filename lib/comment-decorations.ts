import { EditorState, RangeSetBuilder, StateEffect, StateField, type Extension, type Text, type Transaction, type TransactionSpec } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { SearchQuery, setSearchQuery } from "@codemirror/search";
import { commentPieces } from "@/lib/tokenize.mjs";

/**
 * The Code comments switch in editable files (architecture §8.4, decision
 * D7). In the IDE the files are real: the terminal, servers, git diff, and
 * checks read them. So hiding comments is display only and never changes a
 * byte of the file:
 *
 * - The ranges are the static code blocks' (commentPieces, lib/tokenize.mjs):
 *   a comment on a line of its own hides with its whole line, as a block
 *   replacement, so the lines left keep their real numbers and stack traces
 *   still match the gutter. A comment after code hides inline.
 * - They come from a StateField (CodeMirror allows block replacements only
 *   there) and are built when a file opens or the switch flips, then mapped
 *   through each edit, so a comment you type never vanishes as you type it.
 *   Only the course's own comments hide: in a file you changed, a comment
 *   hides only when its text is also in the starting version.
 * - Directives (`// @ts-expect-error`, `//go:build`, a shebang), TODO lines,
 *   and JSDoc types never hide (commentPieces leaves them).
 * - Hidden text is atomic, so the cursor never lands inside it. Backspace or
 *   Delete that would take hidden text without your selecting visible code
 *   is cancelled, with "Hidden comment kept. Turn on Code comments to edit
 *   it.", and typing at the end of a line with a hidden comment after its
 *   code types before the comment, not into it. A selection that takes
 *   visible code takes the comments inside it, and Undo brings them back.
 * - Copy and search skip hidden text.
 * - Files over 5,000 lines, and files that are only comments, keep theirs.
 */

export const KEPT_MESSAGE = "Hidden comment kept. Turn on Code comments to edit it.";
const MAX_LINES = 5000;

/** Hide or show, with the starting version (null: nothing is the course's). */
export const setComments = StateEffect.define<{ hidden: boolean; original: string | null | undefined }>();

class HiddenWidget extends WidgetType {
  readonly block: boolean;
  constructor(block: boolean) {
    super();
    this.block = block;
  }
  eq(other: HiddenWidget) {
    return other.block === this.block;
  }
  toDOM() {
    const el = document.createElement(this.block ? "div" : "span");
    el.className = "cm-hidden-comment";
    el.setAttribute("aria-hidden", "true");
    return el;
  }
  get estimatedHeight() {
    return this.block ? 0 : -1;
  }
}
const blockHide = Decoration.replace({ widget: new HiddenWidget(true), block: true });
const inlineHide = Decoration.replace({ widget: new HiddenWidget(false) });

/** The hidden ranges of a document: [from, to) runs, each made only of
    comments the starting version also has (and the space they leave). */
export function hiddenRuns(doc: string, language: string, original: string | null | undefined): [number, number][] {
  if (original === null || original === undefined) return [];
  if (doc.split("\n", MAX_LINES + 1).length > MAX_LINES) return [];
  const pieces = commentPieces(doc, language);
  const runs: [number, number][] = [];
  let pos = 0;
  let start = -1;
  let ok = true;
  const close = (end: number) => {
    if (start >= 0 && ok && end > start) runs.push([start, end]);
    start = -1;
    ok = true;
  };
  for (const piece of pieces) {
    if (piece.hide) {
      if (start < 0) start = pos;
      if (piece.type === "comment" && doc !== original && !original.includes(piece.text)) ok = false;
    } else close(pos);
    pos += piece.text.length;
  }
  close(pos);
  return runs;
}

/** Block replacements for whole hidden lines, inline ones for the rest
    (never across a line break). */
function decorate(doc: Text, runs: [number, number][]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const [from, to] of runs) {
    let line = doc.lineAt(from);
    let blockStart = -1;
    let blockEnd = -1;
    const flush = () => {
      if (blockStart >= 0) builder.add(blockStart, blockEnd, blockHide);
      blockStart = -1;
    };
    for (;;) {
      // The whole line is in the run (an empty line only when the run goes
      // past its start).
      if (from <= line.from && line.to <= to && line.from < to) {
        if (blockStart < 0) blockStart = line.from;
        blockEnd = line.to;
      } else {
        flush();
        const a = Math.max(from, line.from);
        const b = Math.min(to, line.to);
        if (b > a) builder.add(a, b, inlineHide);
      }
      if (line.number >= doc.lines || doc.line(line.number + 1).from >= to) break;
      line = doc.line(line.number + 1);
    }
    flush();
  }
  return builder.finish();
}

interface CommentsState {
  hidden: boolean;
  original: string | null | undefined;
  deco: DecorationSet;
}

function build(state: EditorState, language: string, hidden: boolean, original: string | null | undefined): CommentsState {
  const deco = hidden ? decorate(state.doc, hiddenRuns(state.doc.toString(), language, original)) : Decoration.none;
  return { hidden, original, deco };
}

/** Whether [from, to) touches hidden text: inside a range, or the line
    break that holds a hidden line, or a hidden comment at a line's end, in
    place (deleting it would join the next line into the comment). */
function touchesHidden(deco: DecorationSet, doc: Text, from: number, to: number): boolean {
  let hit = false;
  deco.between(Math.max(0, from - 1), Math.min(doc.length, to + 1), (a, b, value) => {
    const block = value.spec.block === true;
    const endsLine = block || doc.lineAt(a).to === b;
    if (from < b && to > a) hit = true;
    else if (endsLine && from <= b && to > b) hit = true;
    else if (block && from < a && to >= a) hit = true;
  });
  return hit;
}

/** Whether [from, to) holds visible code (anything but spaces outside the
    hidden ranges). */
function hasVisibleCode(deco: DecorationSet, doc: Text, from: number, to: number): boolean {
  let pos = from;
  let visible = false;
  deco.between(from, to, (a, b) => {
    if (a > pos && doc.sliceString(pos, Math.min(a, to)).trim()) visible = true;
    pos = Math.max(pos, b);
  });
  if (pos < to && doc.sliceString(pos, to).trim()) visible = true;
  return visible;
}

/**
 * The switch for one editor state. `hidden` and `original` are read when the
 * state is created, so the first frame is already right; dispatch
 * setComments to flip it (or when the starting version arrives). `onKept`
 * hears when a delete was cancelled, to announce it.
 */
export function commentDecorations({
  language,
  hidden,
  original,
  onKept,
}: {
  language: string;
  hidden: boolean;
  original: string | null | undefined;
  onKept?: () => void;
}): Extension {
  const field = StateField.define<CommentsState>({
    create: (state) => build(state, language, hidden, original),
    update(value, tr) {
      for (const effect of tr.effects) {
        if (effect.is(setComments)) return build(tr.state, language, effect.value.hidden, effect.value.original);
      }
      // The file came back from disk (a reset, the terminal): its comments
      // are found again, rather than mapped through a whole-file change.
      if (tr.isUserEvent("reload")) return build(tr.state, language, value.hidden, value.original);
      return tr.docChanged ? { ...value, deco: value.deco.map(tr.changes) } : value;
    },
    provide: (f) => [EditorView.decorations.from(f, (v) => v.deco), EditorView.atomicRanges.of((view) => view.state.field(f).deco)],
  });

  const guard = EditorState.transactionFilter.of((tr: Transaction): Transaction | readonly TransactionSpec[] => {
    if (!tr.docChanged) return tr;
    const { deco, hidden: on } = tr.startState.field(field);
    if (!on || deco.size === 0 || !tr.isUserEvent("delete") && !tr.isUserEvent("input")) return tr;
    const doc = tr.startState.doc;
    const selected = tr.startState.selection.ranges.some((r) => !r.empty);

    if (tr.isUserEvent("delete")) {
      let blocked = false;
      tr.changes.iterChangedRanges((fromA, toA) => {
        if (fromA === toA || !touchesHidden(deco, doc, fromA, toA)) return;
        // A selection that takes visible code takes the comments inside it.
        if (selected && hasVisibleCode(deco, doc, fromA, toA)) return;
        blocked = true;
      });
      if (blocked) {
        onKept?.();
        return [];
      }
      return tr;
    }

    // Typing right after a hidden comment at the end of a line types before it.
    let single: { from: number; to: number; text: string } | null = null;
    let count = 0;
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      count++;
      single = { from: fromA, to: toA, text: inserted.toString() };
    });
    const change = single as { from: number; to: number; text: string } | null;
    if (count !== 1 || !change || change.from !== change.to || change.text.includes("\n")) return tr;
    // Typing inside hidden text, or right after a hidden comment that ends
    // its line, goes before the comment, on its visible side.
    let moveTo = -1;
    deco.between(change.from, change.from, (a, b, value) => {
      if (change.from > a && change.from < b) moveTo = value.spec.block === true ? doc.lineAt(a).from : a;
      else if (value.spec.block !== true && b === change.from && doc.lineAt(a).to === b) moveTo = a;
    });
    if (moveTo < 0) return tr;
    return [{ changes: { from: moveTo, insert: change.text }, selection: { anchor: moveTo + change.text.length }, userEvent: "input.type", scrollIntoView: true }];
  });

  // Copy leaves the hidden comments out.
  const copy = EditorView.clipboardOutputFilter.of((text, state) => {
    const { deco, hidden: on } = state.field(field);
    if (!on || deco.size === 0) return text;
    const parts: string[] = [];
    for (const range of state.selection.ranges) {
      if (range.empty) continue;
      let pos = range.from;
      let out = "";
      deco.between(range.from, range.to, (a, b) => {
        if (a > pos) out += state.doc.sliceString(pos, a);
        pos = Math.max(pos, b);
      });
      if (pos < range.to) out += state.doc.sliceString(pos, range.to);
      parts.push(out);
    }
    return parts.length ? parts.join(state.lineBreak) : text;
  });

  // Search skips matches inside hidden comments.
  const searchSkip = EditorState.transactionFilter.of((tr) => {
    const effect = tr.effects.find((e) => e.is(setSearchQuery));
    if (!effect) return tr;
    const query = effect.value as SearchQuery;
    if ((query as { test?: unknown }).test) return tr;
    const skipping = new SearchQuery({
      search: query.search,
      caseSensitive: query.caseSensitive,
      literal: query.literal,
      regexp: query.regexp,
      replace: query.replace,
      wholeWord: query.wholeWord,
      test: (_match, state, from, to) => {
        const { deco, hidden: on } = state.field(field);
        if (!on) return true;
        let inside = false;
        deco.between(from, to, (a, b) => {
          if (from < b && to > a) inside = true;
        });
        return !inside;
      },
    });
    return [tr, { effects: setSearchQuery.of(skipping) }];
  });

  return [field, guard, copy, searchSkip, theme];
}

// Hidden text takes no room: an empty line-sized box for whole lines (zero
// high), nothing inline.
const theme = EditorView.baseTheme({
  "div.cm-hidden-comment": { height: "0", overflow: "hidden" },
});
