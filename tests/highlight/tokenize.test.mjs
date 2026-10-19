// Snapshot tests for the syntax highlighter's tokenizer (lib/tokenize.mjs),
// which colors every code block and editor. Each sample in samples/ is
// tokenized and compared with its snapshot in __snapshots__/, which shows
// each token's type inline and then the code as it reads with comments
// hidden. A change in colors shows up as a diff there.
//
//   npm run highlight:test                                  # check
//   UPDATE_SNAPSHOTS=1 npm run highlight:test               # rewrite them
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { commentPieces, stripComments, tokenize } from "../../lib/tokenize.mjs";

const SAMPLES = new URL("samples/", import.meta.url);
const SNAPSHOTS = new URL("__snapshots__/", import.meta.url);
const UPDATE = process.env.UPDATE_SNAPSHOTS === "1";

// One letter per token type, so a line of code stays readable.
const SHORT = { keyword: "k", string: "s", escape: "e", number: "n", comment: "c", fn: "f", directive: "d" };
const LEGEND = `# ${Object.entries(SHORT)
  .map(([type, short]) => `«${short}|…» ${type}`)
  .join(", ")}, anything else plain`;

const annotate = (tokens) => tokens.map((t) => (t.type ? `«${SHORT[t.type] ?? t.type}|${t.text}»` : t.text)).join("");

function snapshot(language, code) {
  return `# tokenize(sample, "${language}")\n${LEGEND}\n${annotate(tokenize(code, language))}\n# stripComments(sample, "${language}")\n${stripComments(code, language)}\n`;
}

// Per character, the type it's colored with (whitespace has no color).
const colors = (tokens) => tokens.flatMap((t) => [...t.text].filter((c) => c.trim()).map(() => t.type));

const samples = readdirSync(SAMPLES)
  .filter((f) => f.endsWith(".txt"))
  .sort()
  .map((f) => ({ language: f.replace(/\.txt$/, ""), code: readFileSync(new URL(f, SAMPLES), "utf8") }));

for (const { language, code } of samples) {
  test(`${language}: tokens match the snapshot`, () => {
    const file = new URL(`${language}.snap`, SNAPSHOTS);
    const actual = snapshot(language, code);
    if (UPDATE || !existsSync(file)) writeFileSync(file, actual);
    assert.equal(actual, readFileSync(file, "utf8"));
  });

  test(`${language}: the tokens are the code, piece by piece`, () => {
    assert.equal(tokenize(code, language).map((t) => t.text).join(""), code);
    assert.equal(commentPieces(code, language).map((p) => p.text).join(""), code);
  });

  // An example edited with comments hidden shows the stripped code in an
  // editor, colored by tokenizing it again, while the static block hides
  // the comment pieces: both must color what's left the same.
  test(`${language}: stripped code keeps the colors of what stays`, () => {
    const kept = commentPieces(code, language).filter((p) => !p.hide);
    assert.equal(kept.map((p) => p.text).join(""), stripComments(code, language));
    assert.deepEqual(colors(tokenize(stripComments(code, language), language)), colors(kept));
  });
}
