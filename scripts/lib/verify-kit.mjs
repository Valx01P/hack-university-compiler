// Shared by the content verifiers (lessons, challenges, and the language
// reference): running programs in the local Piston sandbox, comparing their
// output, and linting prose against the house style and the Markdown subset
// the app renders.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { normalizeOutput } from "../../lib/single-checks.mjs";
import { sourceFileName } from "../../lib/source-file.mjs";
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
const PISTON_URL = (process.env.PISTON_URL ?? "http://127.0.0.1:2000/api/v2").replace(/\/+$/, "");

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
      body: JSON.stringify({ language: RUNTIMES[language].runtime, version: "*", files: [{ name: sourceFileName(language, code), content: code }], stdin: stdin ?? "" }),
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

// SQL runs on PGlite (PostgreSQL in WebAssembly) right here, a fresh
// database per run, with the same core the app uses. Its "stdin" is the setup
// SQL that runs first. A few at a time, since each database holds real memory.
let sqlRunning = 0;
const sqlWaiting = [];
async function runSqlHere(code, setup) {
  if (sqlRunning >= 4) await new Promise((resolve) => sqlWaiting.push(resolve));
  sqlRunning++;
  const { PGlite } = await import("@electric-sql/pglite");
  const core = await import("../../lib/sql/core.mjs");
  const db = new PGlite();
  try {
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
    await db.close().catch(() => {});
    sqlRunning--;
    sqlWaiting.shift()?.();
  }
}

/** Run with retries: a timeout under heavy load is retried before it counts. */
export async function run(language, code, stdin) {
  if (language === "sql") return runSqlHere(code, stdin);
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
export const FENCE_LANGS = new Set(["python", "javascript", "cpp", "java", "go", "sql", "text"]);
/** Flags after a fence's language, for runnable snippets: norun (shown only),
    error (runs and is meant to fail), harness (hidden wrapper for the next
    snippet). */
export const FENCE_FLAGS = new Set(["norun", "error", "harness"]);
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
    (titles, summaries) take no Markdown at all. */
export function lintMarkdown(where, value, isMarkdown, errors) {
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
      if (fenceLang === "stdin") {
        if (flags.length) bad("a ```stdin block takes no flags");
        return;
      }
      if (!FENCE_LANGS.has(fenceLang)) bad(`code fence language "${fenceLang}" must be one of ${[...FENCE_LANGS].join(", ")}`);
      for (const flag of flags) if (!FENCE_FLAGS.has(flag)) bad(`unknown code fence flag "${flag}" (use ${[...FENCE_FLAGS].join(", ")})`);
      if (flags.includes("harness") && !/^[ \t]*\{\{code\}\}[ \t]*$/m.test(part.slice(nl + 1))) bad("a harness needs a line holding just {{code}}");
      return;
    }
    for (const block of part.split(/\n{2,}/)) checkBlock(block.replace(/^\n+|\n+$/g, ""), bad);
  });
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
