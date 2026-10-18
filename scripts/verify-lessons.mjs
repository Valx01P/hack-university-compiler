#!/usr/bin/env node
// Validates the Learn lessons in content/learn and runs every program in them
// against the local Piston sandbox (npm run piston:up first).
//
//   npm run lessons:verify                         # every language
//   npm run lessons:verify -- python               # one language
//   npm run lessons:verify -- python print loops   # specific lessons
//   npm run lessons:verify -- python --no-run      # schema checks only
//   npm run lessons:verify -- python --json        # machine-readable report
//
// For every lesson it checks that:
//   - the file matches the schema in content/learn/AUTHORING.md, and its prose
//     follows the house style and the Markdown subset the app renders
//   - each practice prompt shows test 1's exact input and expected output
//   - each example prints exactly its `output`, the same way twice in a row
//   - each practice solution passes every test, the same way twice in a row
//   - each practice starter compiles and runs, but does not already pass
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// LEARN_CONTENT_DIR checks a course somewhere else, like a draft outside the repo.
const CONTENT = process.env.LEARN_CONTENT_DIR ? path.resolve(process.env.LEARN_CONTENT_DIR) : path.join(ROOT, "content", "learn");
const RUNTIMES = JSON.parse(readFileSync(path.join(ROOT, "lib", "runtimes.json"), "utf8"));
const PISTON_URL = (process.env.PISTON_URL ?? "http://127.0.0.1:2000/api/v2").replace(/\/+$/, "");
const LANGUAGES = ["python", "javascript", "cpp", "java", "go"];

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));
const asJson = flags.has("--json");
const noRun = flags.has("--no-run");
for (const f of flags) {
  if (f !== "--json" && f !== "--no-run") usage(`unknown option ${f}`);
}
if (positional.length && !LANGUAGES.includes(positional[0])) {
  usage(`"${positional[0]}" is not a language (${LANGUAGES.join(", ")})`);
}
const langs = positional.length ? [positional[0]] : LANGUAGES;
const onlyLessons = positional.slice(1);

function usage(message) {
  console.error(`verify-lessons: ${message}\nusage: node scripts/verify-lessons.mjs [language [lesson-id ...]] [--no-run] [--json]`);
  process.exit(2);
}

// ---------------------------------------------------------------- running

// Many verifiers may run at once (one per author), so they share SLOTS
// sandboxed programs between them. A slot is a directory holding an owner
// file. It is built under a temporary name and renamed into place, so a slot
// never exists without its owner, and it is released or reclaimed by renaming
// it away first, so nobody ever deletes a slot that someone else now holds.
const SLOTS = Math.max(1, Math.floor(Number(process.env.VERIFY_SLOTS ?? 12)) || 12);
const SLOT_DIR = path.join(os.tmpdir(), "hu-verify-slots");
const ME = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
let serial = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readOwner(dir) {
  for (const name of ["owner", "pid"]) {
    try {
      return readFileSync(path.join(dir, name), "utf8").trim();
    } catch {
      /* try the next name */
    }
  }
  return "";
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

/** Moves `dir` aside, and deletes it only if it still belongs to `owner`. */
function takeDown(dir, owner) {
  const tomb = path.join(SLOT_DIR, `.gone-${ME}-${serial++}`);
  try {
    renameSync(dir, tomb);
  } catch {
    return; // already gone
  }
  if (readOwner(tomb) === owner) {
    rmSync(tomb, { recursive: true, force: true });
    return;
  }
  // Someone else's slot after all: put it back, or drop it if the name is taken.
  try {
    renameSync(tomb, dir);
  } catch {
    rmSync(tomb, { recursive: true, force: true });
  }
}

function reclaimIfStale(dir) {
  let age;
  try {
    age = Date.now() - statSync(dir).mtimeMs;
  } catch {
    return;
  }
  const owner = readOwner(dir);
  const stale = owner ? !isAlive(Number(owner.split(/\s+/)[0])) || age > 180_000 : age > 5_000;
  if (stale) takeDown(dir, owner);
}

function sweepLeftovers() {
  try {
    for (const name of readdirSync(SLOT_DIR)) {
      if (!name.startsWith(".")) continue;
      const p = path.join(SLOT_DIR, name);
      if (Date.now() - statSync(p).mtimeMs > 60_000) rmSync(p, { recursive: true, force: true });
    }
  } catch {
    /* best effort */
  }
}

async function acquireSlot() {
  mkdirSync(SLOT_DIR, { recursive: true });
  for (let attempt = 0; ; attempt++) {
    for (let i = 0; i < SLOTS; i++) {
      const dir = path.join(SLOT_DIR, `slot-${i}`);
      if (existsSync(dir)) {
        reclaimIfStale(dir);
        continue;
      }
      const owner = `${process.pid} ${ME}-${serial++}`;
      const tmp = path.join(SLOT_DIR, `.new-${ME}-${serial++}`);
      try {
        mkdirSync(tmp);
        writeFileSync(path.join(tmp, "owner"), owner);
        renameSync(tmp, dir); // fails when another verifier took the slot first
        if (readOwner(dir) === owner) return { dir, owner };
      } catch {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
    if (attempt % 50 === 0) sweepLeftovers();
    await sleep(80 + (attempt % 7) * 30);
  }
}

async function piston(language, code, stdin) {
  const slot = await acquireSlot();
  try {
    const res = await fetch(`${PISTON_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: RUNTIMES[language].runtime, version: "*", files: [{ content: code }], stdin: stdin ?? "" }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`);
    const compileFailed = data.compile && data.compile.code !== 0;
    return {
      compileError: compileFailed ? (data.compile.output ?? "").replace(/^chmod: cannot access .*$/gm, "").trim() || "compile failed" : "",
      stdout: data.run?.stdout ?? "",
      stderr: (data.run?.stderr ?? "").replace(/^chmod: cannot access .*\n?/gm, ""),
      code: data.run?.code ?? null,
      status: data.run?.status ?? null,
    };
  } finally {
    takeDown(slot.dir, slot.owner);
  }
}

/** Run with retries: a timeout under heavy load is retried before it counts. */
async function run(language, code, stdin) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      last = await piston(language, code, stdin);
      if (last.status !== "TO") return last;
    } catch (err) {
      last = { compileError: "", stdout: "", stderr: `sandbox error: ${err.message}`, code: null, status: "XX" };
    }
    await sleep(1500 * (i + 1));
  }
  return last;
}

/** How outputs are compared, here and in the app: trailing whitespace on each
    line and trailing blank lines don't count, everything else does. */
export function normalizeOutput(s) {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

const clip = (s, n = 1200) => (s.length > n ? s.slice(0, n) + `… (${s.length - n} more chars)` : s);

function firstDiff(expected, actual) {
  const e = expected.split("\n");
  const a = actual.split("\n");
  for (let i = 0; i < Math.max(e.length, a.length); i++) {
    if (e[i] !== a[i]) return `line ${i + 1}: expected ${JSON.stringify(e[i] ?? "<missing>")}, got ${JSON.stringify(a[i] ?? "<missing>")}`;
  }
  return "";
}

/** Why a run failed, or "" when it compiled and exited 0. */
function failure(r) {
  if (r.compileError) return `does not compile`;
  if (r.code !== 0) return `exited with ${r.code ?? r.status}`;
  return "";
}

// ---------------------------------------------------------------- schema

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FENCE_LANGS = new Set(["python", "javascript", "cpp", "java", "go", "text"]);
const isStr = (v) => typeof v === "string";
const nonEmpty = (v) => isStr(v) && v.trim().length > 0;

function checkSchema(lesson, id, sectionTitle, errors, warnings) {
  const need = (cond, where, message) => {
    if (!cond) errors.push({ where, message });
  };
  need(lesson && typeof lesson === "object" && !Array.isArray(lesson), "lesson", "file must be a JSON object");
  if (!lesson || typeof lesson !== "object" || Array.isArray(lesson)) return;
  need(lesson.id === id, "id", `id must be "${id}" (the file name)`);
  need(nonEmpty(lesson.title) && lesson.title.length <= 60, "title", "title is required, at most 60 characters");
  need(lesson.section === sectionTitle, "section", `section must be "${sectionTitle}" (from index.json)`);
  need(nonEmpty(lesson.summary) && lesson.summary.length <= 160, "summary", "summary is required, at most 160 characters");
  need(nonEmpty(lesson.intro), "intro", "intro is required");
  need(lesson.recap === undefined || isStr(lesson.recap), "recap", "recap must be a string when present");
  need(Array.isArray(lesson.steps) && lesson.steps.length >= 1 && lesson.steps.length <= 4, "steps", "steps must have 1 to 4 entries");
  for (const [i, step] of (Array.isArray(lesson.steps) ? lesson.steps : []).entries()) {
    const at = `steps[${i}]`;
    need(nonEmpty(step?.title), `${at}.title`, "required");
    need(nonEmpty(step?.body), `${at}.body`, "required");
    const ex = step?.example;
    need(ex && typeof ex === "object", `${at}.example`, "required");
    if (ex) {
      for (const k of ["title", "prompt", "code", "output", "explanation"]) need(nonEmpty(ex[k]), `${at}.example.${k}`, "required");
      need(ex.stdin === undefined || isStr(ex.stdin), `${at}.example.stdin`, "must be a string when present");
    }
    const pr = step?.practice;
    need(pr && typeof pr === "object", `${at}.practice`, "required");
    if (pr) {
      for (const k of ["title", "prompt", "starter", "solution"]) need(nonEmpty(pr[k]), `${at}.practice.${k}`, "required");
      need(Array.isArray(pr.tests) && pr.tests.length >= 1 && pr.tests.length <= 4, `${at}.practice.tests`, "must have 1 to 4 tests");
      for (const [t, test] of (Array.isArray(pr.tests) ? pr.tests : []).entries()) {
        need(nonEmpty(test?.output), `${at}.practice.tests[${t}].output`, "required, non-empty");
        need(test?.stdin === undefined || isStr(test.stdin), `${at}.practice.tests[${t}].stdin`, "must be a string when present");
      }
      need(pr.hints === undefined || (Array.isArray(pr.hints) && pr.hints.length <= 3 && pr.hints.every(nonEmpty)), `${at}.practice.hints`, "up to 3 non-empty strings");
      if (isStr(pr.starter) && isStr(pr.solution) && normalizeOutput(pr.starter) === normalizeOutput(pr.solution)) {
        errors.push({ where: `${at}.practice.starter`, message: "starter is identical to the solution" });
      }
      if (isStr(pr.prompt) && Array.isArray(pr.tests) && pr.tests[0] && isStr(pr.tests[0].output)) checkPrompt(pr, `${at}.practice.prompt`, errors);
    }
    for (const [k, v] of [["example.code", ex?.code], ["practice.starter", pr?.starter], ["practice.solution", pr?.solution]]) {
      // A final newline ends the last line, it doesn't start another one.
      const lines = isStr(v) ? v.replace(/\n$/, "").split("\n").length : 0;
      if (lines >= 80) warnings.push({ where: `${at}.${k}`, message: `${lines} lines, keep programs under 80` });
      if (isStr(v) && /\t/.test(v) && !/^go$/.test(String(lesson.__lang))) warnings.push({ where: `${at}.${k}`, message: "contains tab characters, indent with spaces" });
    }
  }
}

/** The text in the ```text fence that follows a `label` line, or null. */
function fenceAfter(md, label) {
  const m = md.match(new RegExp(`^${label}\\s*\\n(?:[ \\t]*\\n)*\`\`\`text[ \\t]*\\n([\\s\\S]*?)^\`\`\`[ \\t]*$`, "m"));
  return m ? m[1] : null;
}

/** A practice prompt shows test 1 exactly: its input (when it has one) and
    its expected output, so learners never guess at the format. */
function checkPrompt(pr, where, errors) {
  const shown = fenceAfter(pr.prompt, "Expected output:");
  const want = normalizeOutput(pr.tests[0].output);
  if (shown === null) {
    errors.push({ where, message: 'needs an "Expected output:" line followed by a ```text block with test 1\'s output' });
  } else if (normalizeOutput(shown) !== want) {
    errors.push({ where, message: `the Expected output block does not match tests[0].output (${firstDiff(want, normalizeOutput(shown))})`, expected: clip(want), actual: clip(normalizeOutput(shown)) });
  }
  const stdin = pr.tests[0].stdin;
  if (isStr(stdin) && stdin.trim()) {
    const input = fenceAfter(pr.prompt, "Input:");
    if (input === null) errors.push({ where, message: 'test 1 reads input, so the prompt needs an "Input:" line followed by a ```text block with its stdin' });
    else if (normalizeOutput(input) !== normalizeOutput(stdin)) errors.push({ where, message: "the Input block does not match tests[0].stdin", expected: clip(normalizeOutput(stdin)), actual: clip(normalizeOutput(input)) });
  }
}

/** Prose fields, and whether each is rendered as Markdown. */
function proseFields(lesson) {
  const fields = [
    ["title", lesson.title, false],
    ["summary", lesson.summary, false],
    ["intro", lesson.intro, true],
    ["recap", lesson.recap, true],
  ];
  for (const [i, s] of (lesson.steps ?? []).entries()) {
    const at = `steps[${i}]`;
    fields.push(
      [`${at}.title`, s?.title, false],
      [`${at}.body`, s?.body, true],
      [`${at}.example.title`, s?.example?.title, false],
      [`${at}.example.prompt`, s?.example?.prompt, true],
      [`${at}.example.explanation`, s?.example?.explanation, true],
      [`${at}.practice.title`, s?.practice?.title, false],
      [`${at}.practice.prompt`, s?.practice?.prompt, true],
      ...(s?.practice?.hints ?? []).map((h, j) => [`${at}.practice.hints[${j}]`, h, true])
    );
  }
  return fields.filter(([, value]) => isStr(value));
}

/** House style: prose never uses em dashes or semicolons. Code spans and
    fenced blocks are skipped, since code is code. */
function checkProse(lesson, errors) {
  for (const [where, value] of proseFields(lesson)) {
    const prose = value.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
    if (prose.includes("—")) errors.push({ where, message: "em dash in prose (use a comma, a colon, or two sentences)" });
    if (prose.includes(";")) errors.push({ where, message: "semicolon in prose (use a comma, a colon, or two sentences, or put code in backticks)" });
  }
}

/** The Markdown subset that components/learn/lesson-md.tsx renders. Anything
    outside it shows up as literal text, so it is an error here. */
function checkMarkdown(lesson, errors) {
  for (const [where, value, isMarkdown] of proseFields(lesson)) {
    const bad = (message) => errors.push({ where, message });
    if (!isMarkdown) {
      if (/`|\n/.test(value)) bad("plain text only: no backticks or line breaks");
      continue;
    }
    const parts = value.split(/^```/m);
    if (parts.length % 2 === 0) {
      bad("unclosed ``` code fence");
      continue;
    }
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        const fenceLang = part.slice(0, part.indexOf("\n") < 0 ? part.length : part.indexOf("\n")).trim();
        if (!FENCE_LANGS.has(fenceLang)) bad(`code fence language "${fenceLang}" must be one of ${[...FENCE_LANGS].join(", ")}`);
        return;
      }
      for (const block of part.split(/\n{2,}/)) checkBlock(block.replace(/^\n+|\n+$/g, ""), bad);
    });
  }
}

function checkBlock(block, bad) {
  if (!block.trim()) return;
  const lines = block.split("\n");
  if (/^#{1,3}\s/.test(lines[0])) return lines.length > 1 && checkBlock(lines.slice(1).join("\n"), bad);
  if (/^#{4,}\s/.test(lines[0])) return bad("only #, ##, and ### headings are supported");
  if (lines.length >= 2 && lines[0].includes("|") && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[1])) return;
  const kinds = lines.map((l) => (/^-\s/.test(l) ? "bullet" : /^\d+\.\s/.test(l) ? "numbered" : /^>\s?/.test(l) ? "quote" : /^#{1,3}\s/.test(l) ? "heading" : "text"));
  const first = kinds[0];
  if (kinds.every((k) => k === first)) {
    if (first === "text") checkInline(block, bad);
    else for (const l of lines) checkInline(l, bad);
    return;
  }
  const odd = kinds.find((k) => k !== "text") ?? first;
  bad(
    odd === "heading"
      ? `a heading must start its own block (blank line before it): "${clip(lines[kinds.indexOf("heading")], 60)}"`
      : `a ${odd === "quote" ? "quote" : "list"} must be its own block with a blank line before and after it, one line per item: "${clip(block.replace(/\n/g, " ⏎ "), 90)}"`
  );
}

function checkInline(text, bad) {
  const prose = text.replace(/`[^`]+`/g, "");
  if ((text.match(/`/g) ?? []).length % 2) bad(`unbalanced backtick: "${clip(text, 80)}"`);
  if (/!\[[^\]]*\]\(/.test(prose)) bad("images are not supported");
  if (/<\/?[a-zA-Z][a-zA-Z0-9-]*(\s[^<>]*)?\/?>/.test(prose)) bad(`raw HTML or a generic type outside backticks: "${clip(text, 80)}" (put code in backticks)`);
}

// ---------------------------------------------------------------- lessons

async function verifyLesson(lang, lesson) {
  const errors = [];
  const jobs = [];
  for (const [i, step] of lesson.steps.entries()) {
    const at = `steps[${i}]`;
    const ex = step.example;
    jobs.push(
      (async () => {
        const [a, b] = await Promise.all([run(lang, ex.code, ex.stdin), run(lang, ex.code, ex.stdin)]);
        for (const r of [a, b]) {
          const why = failure(r);
          if (why) return errors.push({ where: `${at}.example.code`, message: why, actual: clip(r.compileError || r.stderr || r.stdout) });
        }
        if (a.stderr.trim()) errors.push({ where: `${at}.example.code`, message: "wrote to stderr", actual: clip(a.stderr) });
        const out = normalizeOutput(a.stdout);
        if (out !== normalizeOutput(b.stdout)) errors.push({ where: `${at}.example.code`, message: "output differs between two runs (nondeterministic)", expected: clip(out), actual: clip(normalizeOutput(b.stdout)) });
        const want = normalizeOutput(ex.output);
        if (out !== want) errors.push({ where: `${at}.example.output`, message: `does not match what the code prints (${firstDiff(want, out)})`, expected: clip(want), actual: clip(out) });
      })()
    );
    const pr = step.practice;
    jobs.push(
      (async () => {
        // Every test runs twice, so a solution that only sometimes passes is caught.
        const pairs = await Promise.all(pr.tests.map((t) => Promise.all([run(lang, pr.solution, t.stdin), run(lang, pr.solution, t.stdin)])));
        for (const [t, [r, again]] of pairs.entries()) {
          const where = `${at}.practice.tests[${t}]`;
          if (r.compileError) return errors.push({ where: `${at}.practice.solution`, message: "does not compile", actual: clip(r.compileError) });
          const why = failure(r) || failure(again);
          if (why) {
            errors.push({ where, message: `solution ${why}`, actual: clip((failure(r) ? r : again).stderr || r.stdout) });
            continue;
          }
          if (r.stderr.trim()) errors.push({ where, message: "solution wrote to stderr", actual: clip(r.stderr) });
          const out = normalizeOutput(r.stdout);
          const want = normalizeOutput(pr.tests[t].output);
          if (out !== want) errors.push({ where, message: `solution output does not match (${firstDiff(want, out)})`, expected: clip(want), actual: clip(out) });
          else if (normalizeOutput(again.stdout) !== out) errors.push({ where, message: "solution output differs between two runs (nondeterministic)", expected: clip(out), actual: clip(normalizeOutput(again.stdout)) });
        }
      })()
    );
    jobs.push(
      (async () => {
        const r = await run(lang, pr.starter, pr.tests[0].stdin);
        if (r.compileError) return errors.push({ where: `${at}.practice.starter`, message: "starter must compile so learners begin from working code", actual: clip(r.compileError) });
        if (r.code !== 0) return errors.push({ where: `${at}.practice.starter`, message: `starter must run cleanly, exited with ${r.code ?? r.status}`, actual: clip(r.stderr || r.stdout) });
        const passesAll = (await Promise.all(pr.tests.map((t, i) => (i === 0 ? r : run(lang, pr.starter, t.stdin)))))
          .every((x, i) => normalizeOutput(x.stdout) === normalizeOutput(pr.tests[i].output));
        if (passesAll) errors.push({ where: `${at}.practice.starter`, message: "starter already passes every test, so there is nothing to solve" });
      })()
    );
  }
  await Promise.all(jobs);
  return errors;
}

// ---------------------------------------------------------------- index

/** index.json must have the exact shape lib/learn.ts reads. */
function checkIndex(lang, index) {
  const errors = [];
  const bad = (message) => errors.push({ where: "index.json", message });
  if (!index || typeof index !== "object" || Array.isArray(index)) return [{ where: "index.json", message: "must be a JSON object" }];
  if (index.language !== lang) bad(`language must be "${lang}"`);
  if (!nonEmpty(index.title)) bad("title is required");
  if (!isStr(index.description)) bad("description must be a string");
  if (!Array.isArray(index.sections) || !index.sections.length) {
    bad("sections must be a non-empty array");
    return errors;
  }
  const titles = new Set();
  for (const [i, s] of index.sections.entries()) {
    if (!s || typeof s !== "object" || !nonEmpty(s.title)) bad(`sections[${i}] needs a title`);
    else if (titles.has(s.title)) bad(`section title "${s.title}" is used twice`);
    else titles.add(s.title);
    if (!Array.isArray(s?.lessons) || !s.lessons.length || !s.lessons.every(isStr)) bad(`sections[${i}].lessons must be a non-empty array of lesson ids`);
  }
  for (const [where, v] of [["title", index.title], ["description", index.description], ...index.sections.map((s, i) => [`sections[${i}].title`, s?.title])]) {
    if (isStr(v) && (v.includes("—") || v.includes(";"))) bad(`${where}: no em dashes or semicolons`);
  }
  return errors;
}

// ---------------------------------------------------------------- main

const report = { ok: true, lessons: [] };
const fail = (lang, id, errors) => {
  report.ok = false;
  report.lessons.push({ lang, id, ok: false, errors, warnings: [] });
  if (!asJson) printResult(lang, id, errors, []);
};

function printResult(lang, id, errors, warnings) {
  console.log(`${errors.length ? "✗" : "✓"} ${lang}/${id}${warnings.length ? `  (${warnings.length} warning${warnings.length > 1 ? "s" : ""})` : ""}`);
  for (const e of errors) {
    console.log(`    ${e.where}: ${e.message}`);
    if (e.expected !== undefined) console.log(`      expected:\n${e.expected.replace(/^/gm, "        ")}`);
    if (e.actual !== undefined) console.log(`      actual:\n${e.actual.replace(/^/gm, "        ")}`);
  }
  for (const w of warnings) console.log(`    warning ${w.where}: ${w.message}`);
}

for (const lang of langs) {
  const dir = path.join(CONTENT, lang);
  const indexPath = path.join(dir, "index.json");
  if (!existsSync(indexPath)) {
    // A language without a course is fine, unless you asked for it.
    if (positional.length) fail(lang, "index", [{ where: "index.json", message: "missing" }]);
    continue;
  }
  let index;
  try {
    index = JSON.parse(readFileSync(indexPath, "utf8"));
  } catch (err) {
    fail(lang, "index", [{ where: "index.json", message: `invalid JSON: ${err.message}` }]);
    continue;
  }
  const shapeErrors = checkIndex(lang, index);
  const listed = [];
  for (const section of Array.isArray(index?.sections) ? index.sections : []) {
    for (const id of Array.isArray(section?.lessons) ? section.lessons : []) listed.push([id, section.title]);
  }
  const seen = new Set();
  const idErrors = [];
  for (const [id] of listed) {
    if (!isStr(id) || !ID_RE.test(id)) idErrors.push({ id, where: "index.json", message: `bad lesson id ${JSON.stringify(id)} (kebab-case)` });
    else if (seen.has(id)) idErrors.push({ id, where: "index.json", message: `lesson "${id}" is listed twice` });
    seen.add(id);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => f.slice(0, -5));
  if (onlyLessons.length) {
    // Checking some lessons: report the index problems that concern them.
    const problems = [...shapeErrors, ...idErrors.filter((e) => onlyLessons.includes(e.id))];
    for (const id of onlyLessons) {
      if (!seen.has(id)) problems.push({ where: "index.json", message: files.includes(id) ? `${id}.json exists but index.json does not list it` : `no lesson "${id}" in index.json` });
    }
    if (problems.length) fail(lang, "index", problems.map(({ where, message }) => ({ where, message })));
  } else {
    const problems = [...shapeErrors, ...idErrors.map(({ where, message }) => ({ where, message }))];
    for (const f of files) if (!seen.has(f)) problems.push({ where: "index.json", message: `${f}.json is not listed in index.json` });
    if (problems.length) fail(lang, "index", problems);
  }

  const targets = listed.filter(([id], i) => isStr(id) && ID_RE.test(id) && listed.findIndex(([x]) => x === id) === i && (!onlyLessons.length || onlyLessons.includes(id)));
  await Promise.all(
    targets.map(async ([id, sectionTitle]) => {
      const errors = [];
      const warnings = [];
      const file = path.join(dir, `${id}.json`);
      let lesson = null;
      if (!existsSync(file)) {
        errors.push({ where: `${id}.json`, message: "listed in index.json but the file is missing" });
      } else {
        try {
          lesson = JSON.parse(readFileSync(file, "utf8"));
          if (lesson && typeof lesson === "object") Object.defineProperty(lesson, "__lang", { value: lang, enumerable: false });
        } catch (err) {
          errors.push({ where: `${id}.json`, message: `invalid JSON: ${err.message}` });
        }
      }
      if (lesson) checkSchema(lesson, id, sectionTitle, errors, warnings);
      if (lesson && !errors.length) {
        checkProse(lesson, errors);
        checkMarkdown(lesson, errors);
      }
      if (lesson && !errors.length && !noRun) errors.push(...(await verifyLesson(lang, lesson)));
      if (errors.length) report.ok = false;
      report.lessons.push({ lang, id, ok: !errors.length, errors, warnings });
      if (!asJson) printResult(lang, id, errors, warnings);
    })
  );
}

const checked = report.lessons.filter((l) => l.id !== "index");
if (!checked.length && report.ok) {
  report.ok = false;
  report.lessons.push({ lang: langs.join(","), id: "none", ok: false, errors: [{ where: "lessons", message: "no lessons were checked" }], warnings: [] });
  if (!asJson) console.log("✗ no lessons were checked");
}
if (asJson) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
else {
  const bad = checked.filter((l) => !l.ok).length;
  console.log(`\n${checked.length - bad}/${checked.length} passed${report.ok ? "" : bad ? "" : " (index problems above)"}`);
}
process.exitCode = report.ok ? 0 : 1;
