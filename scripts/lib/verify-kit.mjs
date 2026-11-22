// Shared by the content verifiers (lessons, challenges, and the language
// reference): running programs in the local Piston sandbox, comparing their
// output, and linting prose against the house style and the Markdown subset
// the app renders.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { normalizeOutput } from "../../lib/single-checks.mjs";
import { sourceFiles } from "../../lib/source-file.mjs";
import { HIGHLIGHT_LANGUAGES, languageId } from "../../lib/tokenize.mjs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export { normalizeOutput };
export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RUNTIMES = JSON.parse(readFileSync(path.join(ROOT, "lib", "runtimes.json"), "utf8"));
/** The course registry (content/courses.json, typed in lib/courses.ts). */
export const COURSES = JSON.parse(readFileSync(path.join(ROOT, "content", "courses.json"), "utf8")).courses;
// The courses these verifiers can run today, in registry order: those with
// a compiler page whose single file runs on Piston or PGlite.
const PISTON = (c) => c.runtime.startsWith("piston:") && Object.hasOwn(RUNTIMES, c.runtime.slice("piston:".length));
export const LANGUAGES = COURSES.filter((c) => c.page && (PISTON(c) || c.runtime === "pglite")).map((c) => c.slug);
/** The read courses: those with no compiler page, whose lessons are all
    read lessons (the part route's rule), checked with no sandbox. */
export const READ_LANGUAGES = COURSES.filter((c) => !c.page).map((c) => c.slug);
const PISTON_URL = (process.env.PISTON_URL ?? "http://127.0.0.1:2000/api/v2").replace(/\/+$/, "");
// The single-file courses that run on the local runner instead (TypeScript,
// Bash): each one's recipe and the file name the app gives the code.
const RUNNER_COURSES = Object.fromEntries(
  COURSES.filter((c) => c.page === "single" && c.runtime.startsWith("runner:")).map((c) => [c.slug, { recipe: c.runtime.slice("runner:".length), fileName: c.fileName }])
);
export const RUNNER_LANGUAGES = Object.keys(RUNNER_COURSES);
const RUNNER_URL = `http://127.0.0.1:${/^\d{1,5}$/.test(process.env.HU_RUNNER_PORT ?? "") ? process.env.HU_RUNNER_PORT : "3100"}`;
/** The token npm run up gives the runner (lib/runner.ts reads it the same way). */
function runnerToken() {
  if (process.env.HU_RUNNER_TOKEN) return process.env.HU_RUNNER_TOKEN;
  try {
    return readFileSync(path.join(process.env.HU_DATA_DIR || path.join(os.homedir(), ".hack-university"), "runner-token"), "utf8").trim() || null;
  } catch {
    return null;
  }
}
/** Whether the runner answers (npm run up starts it), so its languages can be
    skipped with a note when it's off rather than failing every check. */
export async function runnerUp() {
  const token = runnerToken();
  if (!token) return false;
  try {
    return (await fetch(`${RUNNER_URL}/v1/health`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
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

/** At most `limit` calls of `fn` at a time, the rest waiting in order. */
function limiter(limit) {
  let active = 0;
  const waiting = [];
  return async (fn) => {
    if (active < limit) active++;
    else await new Promise((resolve) => waiting.push(resolve)); // handed a place by one that finished
    try {
      return await fn();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

// This verifier can hold at most SLOTS slots, so its runs past that wait
// here instead of each polling the slot directory. Every challenge in every
// language starts at once, and thousands of runs each checking a dozen slot
// files every few hundred milliseconds kept node busy for nothing. A slot
// freed here also goes straight to the next run, without a poll's delay.
const local = limiter(SLOTS);

async function inSlot(fn) {
  return local(async () => {
    const slot = await acquireSlot();
    try {
      return await fn();
    } finally {
      takeDown(slot.dir, slot.owner);
    }
  });
}

function piston(language, code, stdin) {
  return inSlot(async () => {
    const res = await fetch(`${PISTON_URL}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: RUNTIMES[language].runtime, version: "*", files: sourceFiles(language, code), stdin: stdin ?? "" }),
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
  });
}

// TypeScript and Bash run on the local runner, a fresh container per run,
// sharing the same slots as Piston's runs.
function runner(language, code, stdin) {
  return inSlot(async () => {
    const { recipe, fileName } = RUNNER_COURSES[language];
    const res = await fetch(`${RUNNER_URL}/v1/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${runnerToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipe, files: [{ name: fileName, content: code }], stdin: stdin ?? "" }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? data?.message ?? `HTTP ${res.status}`);
    const compileFailed = data?.compile && data.compile.code !== 0;
    return {
      compileError: compileFailed ? String(data.compile.output ?? "").trim() || "compile failed" : "",
      stdout: data?.run?.stdout ?? "",
      stderr: data?.run?.stderr ?? "",
      code: data?.run?.code ?? null,
      status: data?.run?.status ?? null,
    };
  });
}

// SQL runs on PGlite (PostgreSQL in WebAssembly) right here, a fresh
// database per run, with the same core the app uses. Its "stdin" is the setup
// SQL that runs first. A few at a time, since each database holds real memory.
const sqlSlots = limiter(4);
let blankFiles = null;

/** A brand-new database. Making one runs initdb, half a second of CPU, so
    the first is made that way and the rest start from a copy of its files
    (what PGlite's clone does), the same empty database five times cheaper. */
async function freshDatabase() {
  const { PGlite } = await import("@electric-sql/pglite");
  blankFiles ??= (async () => {
    const db = new PGlite();
    await db.waitReady;
    const files = await db.dumpDataDir("none");
    await db.close();
    return files;
  })().catch((err) => {
    blankFiles = null; // the next run tries again
    throw err;
  });
  return new PGlite({ loadDataDir: await blankFiles });
}

function runSqlHere(code, setup) {
  return sqlSlots(() => runSqlOnce(code, setup));
}

async function runSqlOnce(code, setup) {
  const core = await import("../../lib/sql/core.mjs");
  let db = null;
  try {
    db = await freshDatabase();
    await core.prepareDatabase(db);
    if (setup && setup.trim()) {
      const prepared = await core.runSql(db, setup);
      if (prepared.error) return { compileError: `The setup failed. ${core.formatError(prepared.error)}`, stdout: "", stderr: "", code: 1, status: null };
    }
    const result = await core.runSql(db, code);
    return { compileError: "", stdout: core.formatRun(result), stderr: result.error ? core.formatError(result.error) : "", code: result.error ? 1 : 0, status: null };
  } catch (err) {
    return { compileError: "", stdout: "", stderr: `sandbox error: ${err.message}`, code: null, status: "XX" };
  } finally {
    await db?.close().catch(() => {});
  }
}

/** Run with retries: a timeout under heavy load is retried before it counts. */
export async function run(language, code, stdin) {
  if (language === "sql") return runSqlHere(code, stdin);
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      last = await (Object.hasOwn(RUNNER_COURSES, language) ? runner : piston)(language, code, stdin);
      if (last.status !== "TO") return last;
    } catch (err) {
      last = { compileError: "", stdout: "", stderr: `sandbox error: ${err.message}`, code: null, status: "XX" };
    }
    if (i < 2) await sleep(1500 * (i + 1)); // no wait after the last try
  }
  return last;
}

export const clip = (s, n = 1200) => (s.length > n ? s.slice(0, n) + `… (${s.length - n} more chars)` : s);

export function firstDiff(expected, actual) {
  const e = expected.split("\n");
  const a = actual.split("\n");
  for (let i = 0; i < Math.max(e.length, a.length); i++) {
    if (e[i] !== a[i]) return `line ${i + 1}: expected ${JSON.stringify(e[i] ?? "<missing>")}, got ${JSON.stringify(a[i] ?? "<missing>")}`;
  }
  return "";
}

/** Why a run failed, or "" when it compiled and exited 0. */
export function failure(r) {
  if (r.compileError) return `does not compile`;
  if (r.code !== 0) return `exited with ${r.code ?? r.status}`;
  return "";
}

// ---------------------------------------------------------------- prose

export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Fence languages content may use: every fence a course with a compiler
    page lists in content/courses.json (runnable there or shown only, the way
    lib/snippet-harness.mjs reads them), and text. */
export const FENCE_LANGS = new Set([...COURSES.filter((c) => c.page).flatMap((c) => Object.keys(c.fences ?? {})), "text"]);
/** Flags after a fence's language, for runnable snippets: norun (shown only),
    error (runs and is meant to fail), harness (hidden wrapper for the next
    snippet). */
// dom: browser code, never run. types: TypeScript that shows types and prints
// nothing, so it only has to type-check.
export const FENCE_FLAGS = new Set(["norun", "error", "harness", "dom", "types"]);
/** Fence languages a read lesson may use: every one the highlighter
    colors (lib/tokenize.mjs), aliases included, and text. */
export const READ_FENCES = new Set([...HIGHLIGHT_LANGUAGES, "text"]);
/** A read lesson's only fence flag: `sketch` marks code with `...` in
    place of the rest, so its syntax isn't checked. */
export const READ_FLAGS = new Set(["sketch"]);
export const isStr = (v) => typeof v === "string";
export const nonEmpty = (v) => isStr(v) && v.trim().length > 0;

/** The text in the ```text fence that follows a `label` line, or null. */
export function fenceAfter(md, label) {
  const m = md.match(new RegExp(`^${label}\\s*\\n(?:[ \\t]*\\n)*\`\`\`text[ \\t]*\\n([\\s\\S]*?)^\`\`\`[ \\t]*$`, "m"));
  return m ? m[1] : null;
}

/** Markdown that shows a test as an example (a practice prompt, a challenge
    statement) shows test 1 exactly: its input when it has one, and its
    expected output, so nobody guesses at the format. */
export function checkShownTest(md, test, where, errors) {
  const shown = fenceAfter(md, "Expected output:");
  const want = normalizeOutput(test.output);
  if (shown === null) {
    errors.push({ where, message: 'needs an "Expected output:" line followed by a ```text block with test 1\'s output' });
  } else if (normalizeOutput(shown) !== want) {
    errors.push({ where, message: `the Expected output block does not match tests[0].output (${firstDiff(want, normalizeOutput(shown))})`, expected: clip(want), actual: clip(normalizeOutput(shown)) });
  }
  if (isStr(test.stdin) && test.stdin.trim()) {
    const input = fenceAfter(md, "Input:");
    if (input === null) errors.push({ where, message: 'test 1 reads input, so it needs an "Input:" line followed by a ```text block with its stdin' });
    else if (normalizeOutput(input) !== normalizeOutput(test.stdin)) errors.push({ where, message: "the Input block does not match tests[0].stdin", expected: clip(normalizeOutput(test.stdin)), actual: clip(normalizeOutput(input)) });
  }
}

/** House style: prose never uses em dashes or semicolons. Code spans and
    fenced blocks are skipped, since code is code. */
export function lintProse(where, value, errors) {
  const prose = value.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  if (prose.includes("\u2014")) errors.push({ where, message: "em dash in prose (use a comma, a colon, or two sentences)" });
  if (prose.includes(";")) errors.push({ where, message: "semicolon in prose (use a comma, a colon, or two sentences, or put code in backticks)" });
}

/** The Markdown subset that components/learn/lesson-md.tsx renders. Anything
    outside it shows up as literal text, so it is an error. Plain-text fields
    (titles, summaries) take no Markdown at all. Options, for read lessons:
    `fences` and `flags` (the fence languages and flags allowed, FENCE_LANGS
    and FENCE_FLAGS by default), `stdin` (false: no ```stdin blocks),
    `onDiagram(name, caption)` (```diagram fences are allowed, each handed
    to it), and `noH1` (a # heading is an error: it would render at the
    part title's level). */
export function lintMarkdown(where, value, isMarkdown, errors, options = {}) {
  const { fences = FENCE_LANGS, flags: allowedFlags = FENCE_FLAGS, stdin = true, onDiagram = null, noH1 = false } = options;
  const bad = (message) => errors.push({ where, message });
  if (!isMarkdown) {
    if (/`|\n/.test(value)) bad("plain text only: no backticks or line breaks");
    return;
  }
  const parts = value.split(/^```/m);
  if (parts.length % 2 === 0) {
    bad("unclosed ``` code fence");
    return;
  }
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      // The info string: a language, then flags for runnable snippets (see
      // lib/snippet-harness.mjs). A ```stdin block is hidden input.
      const nl = part.indexOf("\n");
      const [fenceLang = "", ...flags] = part.slice(0, nl < 0 ? part.length : nl).trim().split(/\s+/);
      if (fenceLang === "diagram" && onDiagram) {
        const [name = "", ...more] = flags;
        if (more.length) bad(`a diagram fence names one diagram: \`\`\`diagram ${name}`);
        onDiagram(name, nl < 0 ? "" : part.slice(nl + 1).replace(/\n$/, ""));
        return;
      }
      if (fenceLang === "stdin") {
        if (!stdin) bad("no ```stdin blocks here: nothing in a read lesson runs");
        else if (flags.length) bad("a ```stdin block takes no flags");
        return;
      }
      if (!fences.has(fenceLang)) bad(`code fence language "${fenceLang}" must be one of ${[...fences].join(", ")}`);
      for (const flag of flags) {
        if (!allowedFlags.has(flag)) bad(allowedFlags.size ? `unknown code fence flag "${flag}" (use ${[...allowedFlags].join(", ")})` : `no code fence flags here ("${flag}")`);
      }
      if (flags.includes("harness") && allowedFlags.has("harness") && !/^[ \t]*\{\{code\}\}[ \t]*$/m.test(part.slice(nl + 1))) bad("a harness needs a line holding just {{code}}");
      return;
    }
    for (const block of part.split(/\n{2,}/)) checkBlock(block.replace(/^\n+|\n+$/g, ""), bad, noH1);
  });
}

function checkBlock(block, bad, noH1 = false) {
  if (!block.trim()) return;
  const lines = block.split("\n");
  if (noH1 && /^#\s/.test(lines[0])) bad(`a # heading renders at the part title's level, use ## and ###: "${clip(lines[0], 60)}"`);
  if (/^#{1,3}\s/.test(lines[0])) return lines.length > 1 && checkBlock(lines.slice(1).join("\n"), bad, noH1);
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

/** Lint one line of inline Markdown (a diagram's caption): balanced
    backticks, no images, no raw HTML. */
export function lintInline(where, text, errors) {
  checkInline(text, (message) => errors.push({ where, message }));
}

/** How many words of prose a Markdown field has: code fences (diagrams
    included) left out, and only words with a letter or digit counted, so
    list dashes and heading marks don't count. */
export function proseWords(md) {
  return String(md ?? "")
    .split(/^```/m)
    .filter((_, i) => i % 2 === 0)
    .join("\n")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** The code fences in a Markdown field: language (lowercased), flags,
    and code. Diagram fences are left out. */
export function codeFences(md) {
  const out = [];
  String(md ?? "").split(/^```/m).forEach((part, i) => {
    if (i % 2 === 0) return;
    const nl = part.indexOf("\n");
    const [lang = "", ...flags] = part.slice(0, nl < 0 ? part.length : nl).trim().split(/\s+/);
    if (lang.toLowerCase() === "diagram") return;
    out.push({ language: lang.toLowerCase() || "text", flags, code: nl < 0 ? "" : part.slice(nl + 1).replace(/\n$/, "") });
  });
  return out;
}

let lezer = null;
/**
 * A light syntax check for code a read lesson shows: JSON must parse, and
 * JavaScript, JSX, TypeScript, and TSX must parse with no error nodes in
 * Lezer (the parser the highlighter uses), so displayed code can't carry a
 * typo. Other languages aren't checked. Returns the problems (empty when
 * it parses), each with its line.
 */
export async function syntaxErrors(code, language) {
  const lang = languageId(language);
  if (lang === "json") {
    try {
      JSON.parse(code);
      return [];
    } catch (err) {
      return [`doesn't parse as JSON (${err.message})`];
    }
  }
  const dialect = { javascript: "", jsx: "jsx", typescript: "ts", tsx: "ts jsx" }[lang];
  if (dialect === undefined) return [];
  lezer ??= (await import("@lezer/javascript")).parser;
  const tree = lezer.configure({ dialect }).parse(code);
  const problems = [];
  tree.iterate({
    enter(node) {
      if (!node.type.isError || problems.length >= 3) return;
      const line = code.slice(0, node.from).split("\n").length;
      problems.push(`doesn't parse as ${language}: line ${line} near ${JSON.stringify(code.slice(node.from, node.from + 20) || "the end")}`);
    },
  });
  return problems;
}

function checkInline(text, bad) {
  const prose = text.replace(/`[^`]+`/g, "");
  if ((text.match(/`/g) ?? []).length % 2) bad(`unbalanced backtick: "${clip(text, 80)}"`);
  if (/!\[[^\]]*\]\(/.test(prose)) bad("images are not supported");
  if (/<\/?[a-zA-Z][a-zA-Z0-9-]*(\s[^<>]*)?\/?>/.test(prose)) bad(`raw HTML or a generic type outside backticks: "${clip(text, 80)}" (put code in backticks)`);
}

// ---------------------------------------------------------------- report

export function printResult(lang, id, errors, warnings) {
  console.log(`${errors.length ? "✗" : "✓"} ${lang}/${id}${warnings.length ? `  (${warnings.length} warning${warnings.length > 1 ? "s" : ""})` : ""}`);
  for (const e of errors) {
    console.log(`    ${e.where}: ${e.message}`);
    if (e.expected !== undefined) console.log(`      expected:\n${e.expected.replace(/^/gm, "        ")}`);
    if (e.actual !== undefined) console.log(`      actual:\n${e.actual.replace(/^/gm, "        ")}`);
  }
  for (const w of warnings) console.log(`    warning ${w.where}: ${w.message}`);
}
