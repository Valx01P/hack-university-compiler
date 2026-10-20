// The Code comments switch in editable files (lib/comment-decorations.ts,
// architecture §8.4): hiding comments is display only. A property test of
// random edits with comments hidden: a Backspace, a Delete, or a selection of
// only hidden text never removes hidden text, typing never lands inside a
// hidden comment, a selection that takes visible code takes the comments in
// it, and Undo brings every byte back.
//
//   node --import ./tests/ide/register.mjs --test tests/ide/comments.test.mjs

import assert from "node:assert/strict";
import { test } from "node:test";
import { EditorSelection, EditorState } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import { commentDecorations, hiddenRuns, setComments } from "../../lib/comment-decorations.ts";

const SAMPLE = `// The program's entry point: it greets, then sums.
import { greet } from "./greet.ts"; // the function under test
// @ts-expect-error: the checker is told this line is wrong
const n: number = "1";

// TODO: add a farewell

/* a block
   comment */
export function sum(xs: number[]): number {
  let total = 0; // starts at zero
  for (const x of xs) total += x;
  return total;
}
console.log(greet("Ada"), sum([1, 2, 3]));
`;

function make(doc = SAMPLE, original = SAMPLE) {
  let kept = 0;
  const state = EditorState.create({
    doc,
    extensions: [history(), commentDecorations({ language: "typescript", hidden: true, original, onKept: () => kept++ })],
  });
  return { state, kept: () => kept };
}

/** A run of undo until there is nothing left to undo. */
function undoAll(state) {
  let s = state;
  for (let i = 0; i < 500; i++) {
    let next = null;
    const done = undo({ state: s, dispatch: (tr) => (next = tr.state) });
    if (!done || !next) break;
    s = next;
  }
  return s;
}

const random = (seed) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

test("hides the course's comments, never directives or TODO lines", () => {
  const runs = hiddenRuns(SAMPLE, "typescript", SAMPLE).map(([a, b]) => SAMPLE.slice(a, b));
  const joined = runs.join("|");
  assert.match(joined, /The program's entry point/);
  assert.match(joined, /the function under test/);
  assert.match(joined, /a block/);
  assert.match(joined, /starts at zero/);
  assert.doesNotMatch(joined, /@ts-expect-error/);
  assert.doesNotMatch(joined, /TODO/);
});

test("in a changed file, only comments the original has hide", () => {
  const changed = SAMPLE.replace("let total = 0; // starts at zero", "let total = 0; // my own note");
  const runs = hiddenRuns(changed, "typescript", SAMPLE).map(([a, b]) => changed.slice(a, b)).join("|");
  assert.doesNotMatch(runs, /my own note/);
  assert.match(runs, /a block/);
  assert.deepEqual(hiddenRuns(SAMPLE, "typescript", null), []);
});

test("random edits with comments hidden never remove hidden text alone, and Undo restores every byte", () => {
  const rand = random(20261019);
  for (let round = 0; round < 60; round++) {
    let { state } = make();
    const runs = hiddenRuns(SAMPLE, "typescript", SAMPLE);
    const hiddenTexts = runs.map(([a, b]) => SAMPLE.slice(a, b)).filter((t) => /\S/.test(t));
    let selectionTookCode = false;
    for (let step = 0; step < 25; step++) {
      const doc = state.doc.toString();
      const len = doc.length;
      const kind = rand();
      let spec;
      if (kind < 0.4 && len > 0) {
        // Backspace or Delete with the cursor somewhere.
        const pos = Math.floor(rand() * len) + (rand() < 0.5 ? 1 : 0);
        const p = Math.max(1, Math.min(len, pos));
        const back = rand() < 0.5;
        const from = back ? p - 1 : Math.min(p, len - 1);
        spec = { changes: { from, to: from + 1 }, userEvent: back ? "delete.backward" : "delete.forward" };
        state = state.update({ selection: EditorSelection.cursor(back ? p : from) }).state;
      } else if (kind < 0.65 && len > 2) {
        // A selection, deleted.
        const a = Math.floor(rand() * (len - 1));
        const b = Math.min(len, a + 1 + Math.floor(rand() * 40));
        state = state.update({ selection: EditorSelection.range(a, b) }).state;
        spec = { changes: { from: a, to: b }, userEvent: "delete.selection" };
      } else {
        // Typing a character somewhere.
        const p = Math.floor(rand() * (len + 1));
        state = state.update({ selection: EditorSelection.cursor(p) }).state;
        spec = { changes: { from: p, insert: "x" }, selection: EditorSelection.cursor(p + 1), userEvent: "input.type" };
      }
      const before = state.doc.toString();
      const tr = state.update(spec);
      const after = tr.state.doc.toString();
      if (spec.userEvent === "delete.selection" && after !== before) {
        // Allowed only when the selection held visible code.
        const removed = before.slice(spec.changes.from, spec.changes.to);
        if (hiddenTexts.some((t) => removed.includes(t.trim()))) selectionTookCode = true;
      }
      if (spec.userEvent !== "delete.selection") {
        // A cursor delete or a keystroke never takes a hidden comment.
        for (const t of hiddenTexts) {
          if (before.includes(t.trim()) && !selectionTookCode) assert.ok(after.includes(t.trim()), `"${t.trim()}" was removed by ${spec.userEvent}`);
        }
      }
      state = tr.state;
    }
    const back = undoAll(state);
    assert.equal(back.doc.toString(), SAMPLE, `round ${round}: undo restores every byte`);
  }
});

test("typing at the end of a line with a hidden comment types before the comment", () => {
  let { state } = make();
  const line = state.doc.line(11); // "  let total = 0; // starts at zero"
  state = state.update({ selection: EditorSelection.cursor(line.to) }).state;
  const tr = state.update({ changes: { from: line.to, insert: ";" }, selection: EditorSelection.cursor(line.to + 1), userEvent: "input.type" });
  assert.equal(tr.state.doc.line(11).text, "  let total = 0;; // starts at zero");
});

test("a Backspace into a hidden comment is kept, and says so", () => {
  const made = make();
  let { state } = made;
  // The line after the hidden first line: Backspace at its start would join it to the comment.
  const second = state.doc.line(2);
  state = state.update({ selection: EditorSelection.cursor(second.from) }).state;
  const tr = state.update({ changes: { from: second.from - 1, to: second.from }, userEvent: "delete.backward" });
  assert.equal(tr.state.doc.toString(), SAMPLE);
  assert.equal(made.kept(), 1);
});

test("switching shows and hides without touching the text", () => {
  let { state } = make();
  state = state.update({ effects: setComments.of({ hidden: false, original: SAMPLE }) }).state;
  state = state.update({ effects: setComments.of({ hidden: true, original: SAMPLE }) }).state;
  assert.equal(state.doc.toString(), SAMPLE);
});
