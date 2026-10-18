#!/usr/bin/env node
// Validates the compiler's challenges in content/challenges and runs every
// reference solution and starter in the local Piston sandbox.
//
//   npm run challenges:verify                          # every challenge
//   npm run challenges:verify -- is-even sum-list      # specific challenges
//   npm run challenges:verify -- --lang=python         # one language only
//   npm run challenges:verify -- --no-run              # schema checks only
//   npm run challenges:verify -- --json                # machine-readable report
//
// For every challenge it checks that:
//   - the file matches the schema in content/challenges/AUTHORING.md, and its
//     statement follows the house style and the Markdown subset the app renders
//   - the statement shows test 1's exact input and expected output
//   - in every language, the solution passes every test the same way twice
//   - in every language, the starter compiles and runs but doesn't pass
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  ID_RE,
  LANGUAGES,
  ROOT,
  checkShownTest,
  clip,
  failure,
  firstDiff,
  isStr,
  lintMarkdown,
  lintProse,
  nonEmpty,
  normalizeOutput,
  printResult,
  run,
} from "./lib/verify-kit.mjs";

const DIR = path.join(ROOT, "content", "challenges");
const DIFFICULTIES = ["very-easy", "easy", "medium"];
// Programming challenges come in the five general languages. SQL challenges
// are their own set, with only SQL code, SQL's categories, and setup data.
const GENERAL = LANGUAGES.filter((l) => l !== "sql");
const readCategories = (file) => JSON.parse(readFileSync(file, "utf8")).categories.map((c) => c.id);
const CATEGORIES = readCategories(path.join(ROOT, "content", "reference", "categories.json"));
const SQL_CATEGORIES = existsSync(path.join(ROOT, "content", "reference", "sql", "categories.json"))
  ? readCategories(path.join(ROOT, "content", "reference", "sql", "categories.json"))
  : [];
const isSqlChallenge = (c) => Boolean(c?.code && typeof c.code === "object" && Object.keys(c.code).join() === "sql");
const languagesOf = (c) => (isSqlChallenge(c) ? ["sql"] : GENERAL);

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const noRun = args.includes("--no-run");
const langArg = args.find((a) => a.startsWith("--lang="));
const langs = langArg ? [langArg.slice(7)] : LANGUAGES;
for (const a of args.filter((x) => x.startsWith("--"))) {
  if (a !== "--json" && a !== "--no-run" && !a.startsWith("--lang=")) usage(`unknown option ${a}`);
}
if (!langs.every((l) => LANGUAGES.includes(l))) usage(`--lang must be one of ${LANGUAGES.join(", ")}`);
const only = args.filter((a) => !a.startsWith("--"));

function usage(message) {
  console.error(`verify-challenges: ${message}\nusage: node scripts/verify-challenges.mjs [id ...] [--lang=<language>] [--no-run] [--json]`);
  process.exit(2);
}

function checkSchema(c, id, errors, warnings) {
  const need = (cond, where, message) => {
    if (!cond) errors.push({ where, message });
  };
  need(c && typeof c === "object" && !Array.isArray(c), "challenge", "file must be a JSON object");
  if (!c || typeof c !== "object" || Array.isArray(c)) return;
  need(c.id === id, "id", `id must be "${id}" (the file name)`);
  need(nonEmpty(c.title) && c.title.length <= 60, "title", "title is required, at most 60 characters");
  const categories = isSqlChallenge(c) ? SQL_CATEGORIES : CATEGORIES;
  need(categories.includes(c.category), "category", `category must be one of ${categories.join(", ")}`);
  need(c.setup === undefined || (isSqlChallenge(c) && isStr(c.setup)), "setup", "setup is SQL for a SQL challenge (code.sql only)");
  need(DIFFICULTIES.includes(c.difficulty), "difficulty", `difficulty must be one of ${DIFFICULTIES.join(", ")}`);
  need(nonEmpty(c.statement), "statement", "required");
  // A program that reads input needs several inputs to prove it. One that
  // reads none prints the same thing every time, so one test is enough.
  const readsInput = Array.isArray(c.tests) && c.tests.some((t) => isStr(t?.stdin) && t.stdin.trim());
  need(
    Array.isArray(c.tests) && c.tests.length >= (readsInput ? 3 : 1) && c.tests.length <= 5,
    "tests",
    readsInput ? "must have 3 to 5 tests" : "must have 1 to 5 tests"
  );
  for (const [t, test] of (Array.isArray(c.tests) ? c.tests : []).entries()) {
    need(nonEmpty(test?.output), `tests[${t}].output`, "required, non-empty");
    need(test?.stdin === undefined || isStr(test.stdin), `tests[${t}].stdin`, "must be a string when present");
  }
  need(c.hints === undefined || (Array.isArray(c.hints) && c.hints.length <= 3 && c.hints.every(nonEmpty)), "hints", "up to 3 non-empty strings");
  need(c.code && typeof c.code === "object", "code", "required: one { starter, solution } per language (or only code.sql)");
  for (const lang of languagesOf(c)) {
    const code = c.code?.[lang];
    need(code && nonEmpty(code.starter) && nonEmpty(code.solution), `code.${lang}`, "needs a starter and a solution");
    if (!code) continue;
    if (isStr(code.starter) && isStr(code.solution) && normalizeOutput(code.starter) === normalizeOutput(code.solution)) {
      errors.push({ where: `code.${lang}.starter`, message: "starter is identical to the solution" });
    }
    for (const k of ["starter", "solution"]) {
      const v = code[k];
      if (!isStr(v)) continue;
      const lines = v.replace(/\n$/, "").split("\n").length;
      if (lines >= 60) warnings.push({ where: `code.${lang}.${k}`, message: `${lines} lines, keep challenge programs under 60` });
      if (/\t/.test(v) && lang !== "go") warnings.push({ where: `code.${lang}.${k}`, message: "contains tab characters, indent with spaces" });
    }
  }
  // A SQL test's "stdin" is setup SQL (extra rows), described in words.
  if (nonEmpty(c.statement) && Array.isArray(c.tests) && c.tests[0] && isStr(c.tests[0].output)) {
    checkShownTest(c.statement, isSqlChallenge(c) ? { output: c.tests[0].output } : c.tests[0], "statement", errors);
  }
}

function checkText(c, errors) {
  const fields = [
    ["title", c.title, false],
    ["statement", c.statement, true],
    ...(c.hints ?? []).map((h, i) => [`hints[${i}]`, h, true]),
  ];
  for (const [where, value, isMarkdown] of fields) {
    if (!isStr(value)) continue;
    lintProse(where, value, errors);
    lintMarkdown(where, value, isMarkdown, errors);
  }
}

async function verifyChallenge(c) {
  const errors = [];
  const input = (lang, stdin) => (lang === "sql" ? [c.setup, stdin].filter((x) => isStr(x) && x.trim()).join("\n") : stdin);
  await Promise.all(
    languagesOf(c).filter((l) => langs.includes(l)).map(async (lang) => {
      const { starter, solution } = c.code[lang];
      const at = `code.${lang}`;
      const pairs = await Promise.all(c.tests.map((t) => Promise.all([run(lang, solution, input(lang, t.stdin)), run(lang, solution, input(lang, t.stdin))])));
      for (const [t, [r, again]] of pairs.entries()) {
        const where = `${at} tests[${t}]`;
        if (r.compileError) {
          errors.push({ where: `${at}.solution`, message: "does not compile", actual: clip(r.compileError) });
          return;
        }
        const why = failure(r) || failure(again);
        if (why) {
          errors.push({ where, message: `solution ${why}`, actual: clip((failure(r) ? r : again).stderr || r.stdout) });
          continue;
        }
        if (r.stderr.trim()) errors.push({ where, message: "solution wrote to stderr", actual: clip(r.stderr) });
        const out = normalizeOutput(r.stdout);
        const want = normalizeOutput(c.tests[t].output);
        if (out !== want) errors.push({ where, message: `solution output does not match (${firstDiff(want, out)})`, expected: clip(want), actual: clip(out) });
        else if (normalizeOutput(again.stdout) !== out) errors.push({ where, message: "solution output differs between two runs (nondeterministic)" });
      }
      const s = await Promise.all(c.tests.map((t) => run(lang, starter, input(lang, t.stdin))));
      if (s[0].compileError) {
        errors.push({ where: `${at}.starter`, message: "starter must compile so you begin from working code", actual: clip(s[0].compileError) });
        return;
      }
      if (s[0].code !== 0) {
        errors.push({ where: `${at}.starter`, message: `starter must run cleanly on test 1, exited with ${s[0].code ?? s[0].status}`, actual: clip(s[0].stderr || s[0].stdout) });
        return;
      }
      if (s.every((x, i) => normalizeOutput(x.stdout) === normalizeOutput(c.tests[i].output))) {
        errors.push({ where: `${at}.starter`, message: "starter already passes every test, so there is nothing to solve" });
      }
    })
  );
  return errors;
}

const report = { ok: true, challenges: [] };
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort() : [];
for (const id of only) {
  if (!files.includes(id)) {
    report.ok = false;
    report.challenges.push({ id, ok: false, errors: [{ where: `${id}.json`, message: "no such challenge" }], warnings: [] });
    if (!asJson) printResult("challenges", id, [{ where: `${id}.json`, message: "no such challenge" }], []);
  }
}
const targets = files.filter((id) => !only.length || only.includes(id));
const titles = new Map();
await Promise.all(
  targets.map(async (id) => {
    const errors = [];
    const warnings = [];
    let c = null;
    if (!ID_RE.test(id)) errors.push({ where: `${id}.json`, message: "file name must be a kebab-case id" });
    try {
      c = JSON.parse(readFileSync(path.join(DIR, `${id}.json`), "utf8"));
    } catch (err) {
      errors.push({ where: `${id}.json`, message: `invalid JSON: ${err.message}` });
    }
    if (c) checkSchema(c, id, errors, warnings);
    if (c && !errors.length) checkText(c, errors);
    if (c && isStr(c.title)) {
      const key = c.title.toLowerCase();
      if (titles.has(key)) errors.push({ where: "title", message: `same title as ${titles.get(key)}` });
      else titles.set(key, id);
    }
    if (c && !errors.length && !noRun) errors.push(...(await verifyChallenge(c)));
    if (errors.length) report.ok = false;
    report.challenges.push({ id, ok: !errors.length, errors, warnings });
    if (!asJson) printResult("challenges", id, errors, warnings);
  })
);

const checked = report.challenges.length;
if (!checked) {
  report.ok = false;
  if (!asJson) console.log("✗ no challenges were checked");
}
if (asJson) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
else console.log(`\n${report.challenges.filter((c) => c.ok).length}/${checked} passed`);
process.exitCode = report.ok ? 0 : 1;
