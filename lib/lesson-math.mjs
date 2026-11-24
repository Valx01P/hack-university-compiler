// Math in lesson prose: where a course with "math": true in
// content/courses.json has TeX, for KaTeX to typeset. Plain JavaScript
// with no KaTeX in it, so the app's renderer (components/learn/lesson-md.tsx,
// which gets KaTeX itself from lib/typeset.ts) and the verifier
// (scripts/verify-lessons.mjs) find exactly the same spans.
//
//   $x^2$          inline, Pandoc's rule: no space just inside either $,
//                  and no digit right after the closing one, so "$5 and
//                  $10" stays prices. One line at most.
//   \$             a literal dollar
//   $$ ... $$      display math: a block of its own (blank lines around
//                  it) whose first line starts with $$ and whose last line
//                  ends with $$, over as many lines as it needs
//
// Code fences and inline code are never math. In other courses a $ is
// always just a dollar.

/** An inline span: a $ that isn't escaped or doubled, TeX that starts and
    ends with something other than a space (a backslash and what follows
    it count as one, so \$ never closes it), and a closing $ with no digit
    or $ after it. It never holds a backtick, so a dollar in prose can't
    run on into inline code (a $10 before a `$x$`). */
export const INLINE_MATH = String.raw`(?<![\\$])\$(?=[^\s$\`])(?:\\[^\n\`]|[^$\\\n\`])+?(?<=\S)\$(?![\d$])`;

/** What KaTeX is asked for, in the app and the verifier: HTML for the eye
    and MathML for screen readers, and no command that could reach outside
    the math (\href, \url, \includegraphics, \htmlClass...). Strict-mode
    notes are the verifier's to report, so the page doesn't log them. */
export const KATEX_OPTIONS = { output: "htmlAndMathml", trust: false, strict: "ignore" };

/** A block's TeX when it's display math, or null. */
export function displayMath(block) {
  const text = String(block).trim();
  if (text.length < 5 || !text.startsWith("$$") || !text.endsWith("$$")) return null;
  const tex = text.slice(2, -2).trim();
  return tex || null;
}

/** A pipe-table separator row, e.g. `|---|:--:|--:|`. */
export function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

const INLINE_RE = new RegExp(INLINE_MATH, "g");

/** One table row's trimmed cells, without the outer pipes. An escaped pipe
    (`\|`, like SQL's `||`) separates nothing and comes back as a literal
    `|`. With `math` (a course that typesets TeX), a math span keeps its own
    pipes, so `$|x|$` and `$\|v\|$` stay whole and exactly as written. */
export function tableCells(row, math = false) {
  const spans = [];
  let s = row.trim();
  if (math) s = s.replace(INLINE_RE, (span) => `\u0000${spans.push(span) - 1}\u0000`);
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|").replace(/\u0000(\d+)\u0000/g, (_, i) => spans[i]));
}

// What the renderer's inline tokenizer reaches before a $ could: an escaped
// dollar, a link (its label is plain text), and inline code. Bold and
// italics never split a span, so they don't change what's found.
const TOKENS = new RegExp(String.raw`(\\\$)|(${INLINE_MATH})|(\[[^\]]+\]\([^)\s]+\))|(\`[^\`]+\`)`, "g");
const LOOSE_DISPLAY = /(?<!\\)\$\$/;

/** The inline spans in one run of inline Markdown, in order. */
function inlineSpans(text, out) {
  for (const m of text.matchAll(TOKENS)) {
    if (m[2]) out.spans.push({ tex: m[2].slice(1, -1), display: false });
  }
  // A $$ that starts no display block shows as typed.
  const bare = text.replace(TOKENS, (whole, _escaped, math) => (math ? " " : whole.startsWith("`") ? " " : whole));
  if (LOOSE_DISPLAY.test(bare)) out.loose.push(text.trim());
}

/** Walks text the way the renderer lays out its blocks: quotes hold
    blocks, a heading's line is inline and the lines after it more blocks,
    a table's cells and a list's items are each inline, and anything else
    is a paragraph. */
function walk(text, out) {
  for (const block of text.split(/\n{2,}/)) {
    if (!block.trim()) continue;
    const tex = displayMath(block);
    if (tex !== null) {
      out.spans.push({ tex, display: true });
      continue;
    }
    const lines = block.split("\n");
    if (/^#{1,3}\s/.test(lines[0])) {
      inlineSpans(lines[0], out);
      walk(lines.slice(1).join("\n"), out);
    } else if (lines.length >= 2 && lines[0].includes("|") && isTableSeparator(lines[1])) {
      for (const row of [lines[0], ...lines.slice(2)]) for (const cell of tableCells(row, true)) inlineSpans(cell, out);
    } else if (lines.every((l) => /^>\s?/.test(l))) {
      walk(lines.map((l) => l.replace(/^>\s?/, "")).join("\n"), out);
    } else if (lines.every((l) => /^-\s/.test(l)) || lines.every((l) => /^\d+\.\s/.test(l))) {
      for (const line of lines) inlineSpans(line, out);
    } else {
      inlineSpans(block, out);
    }
  }
}

/**
 * Every math span a Markdown field shows, in order, each as its TeX and
 * whether it's display math, and the blocks with a $$ that starts no
 * display block (`loose`, shown as typed). Code fences, diagram fences
 * included, are skipped, and so is inline code.
 */
export function mathSpans(md) {
  const out = { spans: [], loose: [] };
  String(md ?? "").split(/^```/m).forEach((part, i) => {
    if (i % 2 === 0) walk(part, out);
  });
  return out;
}

/**
 * The field with its math taken out, for the prose and Markdown linters:
 * each display block and each inline span becomes `word` ("math", a
 * one-word paragraph or word, or "" to count no words for it), so TeX's own
 * \; and dashes never count as prose, and a $$ block's lines that start
 * like a list or a quote (- x, 1. x, > x) are never read as one. Fences and
 * blank lines stay where they are.
 */
export function stripMath(md, word = "math") {
  return String(md ?? "")
    .split(/^```/m)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .split(/(\n{2,})/)
            .map((block, j) => (j % 2 || displayMath(block) === null ? block : block.replace(/\S[\s\S]*\S/, word)))
            .join("")
            .replace(INLINE_RE, word)
    )
    .join("```");
}
