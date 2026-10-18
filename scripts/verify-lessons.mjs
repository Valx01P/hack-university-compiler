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

// LEARN_CONTENT_DIR checks a course somewhere else, like a draft outside the repo.
const CONTENT = process.env.LEARN_CONTENT_DIR ? path.resolve(process.env.LEARN_CONTENT_DIR) : path.join(ROOT, "content", "learn");

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

// ---------------------------------------------------------------- schema


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


/** A practice prompt shows test 1 exactly. */
function checkPrompt(pr, where, errors) {
  checkShownTest(pr.prompt, pr.tests[0], where, errors);
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

function checkProse(lesson, errors) {
  for (const [where, value] of proseFields(lesson)) lintProse(where, value, errors);
}

function checkMarkdown(lesson, errors) {
  for (const [where, value, isMarkdown] of proseFields(lesson)) lintMarkdown(where, value, isMarkdown, errors);
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
