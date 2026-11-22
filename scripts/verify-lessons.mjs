#!/usr/bin/env node
// Validates the Learn lessons in content/learn and runs every program in them
// against the local Piston sandbox (npm run piston:up first). The read
// courses (web, react, and the other project courses) run nothing, so they
// need no sandbox.
//
//   npm run lessons:verify                         # every course
//   npm run lessons:verify -- python               # one course
//   npm run lessons:verify -- python print loops   # specific lessons
//   npm run lessons:verify -- python --no-run      # schema checks only
//   npm run lessons:verify -- python --json        # machine-readable report
//
// For every lesson in a language course it checks that:
//   - the file matches the schema in content/learn/AUTHORING.md, and its prose
//     follows the house style and the Markdown subset the app renders
//   - each practice prompt shows test 1's exact input and expected output
//   - each part has 1 to 3 worked examples (`examples`, or the single
//     `example` lessons had before), and each prints exactly its `output`, the
//     same way twice in a row
//   - each practice solution passes every test, the same way twice in a row
//   - each practice starter compiles and runs, but does not already pass
//
// For every lesson in a read course (AUTHORING.md, "Read courses") it checks:
//   - the read schema: only the read fields, 2 to 8 parts, 0 to 3 examples a
//     part, an intro, and a recap list, with an id no deleted lesson used
//   - how long each field is: a part's prose, its examples' explanations,
//     the intro, the prompts, and every block of code
//   - the house style and the Markdown subset, with the read courses' code
//     languages (every one the highlighter colors), no runnable-snippet flags
//     or stdin, no # headings, and JSON, JavaScript, and TypeScript that parse
//   - each diagram a part shows: the file exists and follows the rules in
//     lib/diagram.mjs, a part shows it once and three diagrams at most, and
//     its caption, title, and desc follow the house style. A diagram no
//     lesson shows, and a folder other than diagrams/, are warnings.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { diagramNames, parseDiagram } from "../lib/diagram.mjs";
import {
  ID_RE,
  LANGUAGES,
  READ_FENCES,
  READ_FLAGS,
  READ_LANGUAGES,
  ROOT,
  checkShownTest,
  clip,
  codeFences,
  failure,
  firstDiff,
  isStr,
  lintInline,
  lintMarkdown,
  lintProse,
  nonEmpty,
  normalizeOutput,
  printResult,
  proseWords,
  run,
  syntaxErrors,
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
const COURSE_LIST = [...LANGUAGES, ...READ_LANGUAGES];
if (positional.length && !COURSE_LIST.includes(positional[0])) {
  usage(`"${positional[0]}" is not a course (${COURSE_LIST.join(", ")})`);
}
const langs = positional.length ? [positional[0]] : COURSE_LIST;
const onlyLessons = positional.slice(1);
const isRead = (lang) => READ_LANGUAGES.includes(lang);

function usage(message) {
  console.error(`verify-lessons: ${message}\nusage: node scripts/verify-lessons.mjs [course [lesson-id ...]] [--no-run] [--json]`);
  process.exit(2);
}

// ---------------------------------------------------------------- schema

// A part's worked examples: Example 1 to 3 in the editor
// (lib/learn-types.ts MAX_EXAMPLES).
const MAX_EXAMPLES = 3;

/** A step's worked examples, each with where it is in the file: its
    `examples`, or the single `example` every lesson had before (the app
    reads both, lib/learn-types.ts normalizeLesson). */
function examplesOf(step, at) {
  if (Array.isArray(step?.examples)) return step.examples.map((ex, e) => [`${at}.examples[${e}]`, ex]);
  return step?.example !== undefined ? [[`${at}.example`, step.example]] : [];
}

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
  need(lesson.setup === undefined || isStr(lesson.setup), "setup", "setup must be a string of SQL when present");
  need(Array.isArray(lesson.steps) && lesson.steps.length >= 1 && lesson.steps.length <= 4, "steps", "steps must have 1 to 4 entries");
  for (const [i, step] of (Array.isArray(lesson.steps) ? lesson.steps : []).entries()) {
    const at = `steps[${i}]`;
    need(nonEmpty(step?.title), `${at}.title`, "required");
    need(nonEmpty(step?.body), `${at}.body`, "required");
    if (step?.examples !== undefined) {
      need(step.example === undefined, `${at}.example`, "give examples or example, not both");
      need(
        Array.isArray(step.examples) && step.examples.length >= 1 && step.examples.length <= MAX_EXAMPLES,
        `${at}.examples`,
        `must have 1 to ${MAX_EXAMPLES} examples`
      );
    } else {
      need(step?.example !== undefined, `${at}.example`, "required (or examples)");
    }
    const exs = examplesOf(step, at);
    for (const [where, ex] of exs) {
      need(ex && typeof ex === "object" && !Array.isArray(ex), where, "must be an object");
      if (!ex || typeof ex !== "object") continue;
      for (const k of ["title", "prompt", "code", "output", "explanation"]) need(nonEmpty(ex[k]), `${where}.${k}`, "required");
      need(ex.stdin === undefined || isStr(ex.stdin), `${where}.stdin`, "must be a string when present");
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
      if (isStr(pr.prompt) && Array.isArray(pr.tests) && pr.tests[0] && isStr(pr.tests[0].output)) checkPrompt(pr, `${at}.practice.prompt`, errors, lesson.__lang);
    }
    const programs = [...exs.map(([where, ex]) => [`${where}.code`, ex?.code]), [`${at}.practice.starter`, pr?.starter], [`${at}.practice.solution`, pr?.solution]];
    for (const [where, v] of programs) {
      // A final newline ends the last line, it doesn't start another one.
      const lines = isStr(v) ? v.replace(/\n$/, "").split("\n").length : 0;
      if (lines >= 80) warnings.push({ where, message: `${lines} lines, keep programs under 80` });
      if (isStr(v) && /\t/.test(v) && !/^go$/.test(String(lesson.__lang))) warnings.push({ where, message: "contains tab characters, indent with spaces" });
    }
  }
}


/** A practice prompt shows test 1 exactly. A SQL test's "stdin" is setup SQL
    (extra rows), which the prompt describes in words instead of showing. */
function checkPrompt(pr, where, errors, lang) {
  const test = pr.tests[0];
  checkShownTest(pr.prompt, lang === "sql" ? { output: test.output } : test, where, errors);
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
      ...examplesOf(s, at).flatMap(([where, ex]) => [
        [`${where}.title`, ex?.title, false],
        [`${where}.prompt`, ex?.prompt, true],
        [`${where}.explanation`, ex?.explanation, true],
      ]),
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

// ---------------------------------------------------------------- read lessons

// Lesson ids the read courses used before they were rewritten. Progress is
// kept by `<id>/<part>`, so a new lesson with an old id would show its
// parts as read already.
const RETIRED_IDS = {
  web: ["semantic-html", "css-layout", "dom-events", "browser-storage", "mvc-and-fetch", "how-the-web-works"],
  react: ["components-props", "state-effects", "lists-forms-events", "tanstack-query", "routing-features-tests"],
  nextjs: ["app-router", "server-and-client-components", "fetching-caching-streaming", "route-handlers-and-server-actions", "rendering-images-metadata"],
  express: ["request-lifecycle", "layers-mvc", "validation-errors", "databases", "tests-and-legacy"],
  fastapi: ["path-operations", "layered-structure", "dependency-injection", "sqlalchemy-and-alembic", "errors-auth-and-tests"],
  spring: ["project-structure", "controllers-and-dtos", "services-and-repositories", "spring-security", "testing-with-mockmvc"],
  "go-api": ["routes-and-handlers", "json-and-errors", "layers", "postgres-and-migrations", "middleware-and-testing"],
};

// The read format's fields, and nothing else: a leftover practice,
// codebase, file, template, setup, or fixtures fails loudly.
const READ_KEYS = {
  lesson: ["id", "title", "section", "summary", "format", "intro", "steps", "recap"],
  step: ["title", "body", "examples"],
  example: ["title", "prompt", "language", "code", "output", "explanation"],
};
// Sizes (words of prose, lines of code). Errors past the outer bounds,
// warnings past the recommended ones.
const READ = {
  steps: [2, 8],
  stepsWarn: [3, 6],
  body: [100, 1200],
  bodyWarn: [150, 1000],
  partWarn: 1500,
  partMax: 1800,
  intro: [30, 150],
  promptWarn: 60,
  explanation: [40, 300],
  recap: [3, 8],
  codeWarn: 80,
  codeMax: 120,
  fencesWarn: 6,
  diagramsPerPart: 3,
  caption: 160,
};
// Languages whose code is indented with tabs.
const TAB_LANGUAGES = new Set(["go", "golang", "makefile", "make"]);

function checkKeys(obj, allowed, where, errors) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) errors.push({ where: `${where}.${k}`, message: `not a read lesson field (only ${allowed.join(", ")})` });
}

function checkReadSchema(lesson, id, sectionTitle, lang, errors, warnings) {
  const need = (cond, where, message) => {
    if (!cond) errors.push({ where, message });
  };
  const warn = (cond, where, message) => {
    if (!cond) warnings.push({ where, message });
  };
  need(lesson && typeof lesson === "object" && !Array.isArray(lesson), "lesson", "file must be a JSON object");
  if (!lesson || typeof lesson !== "object" || Array.isArray(lesson)) return;
  need(lesson.format === "read", "format", 'a read course\'s lessons are read lessons: "format": "read"');
  checkKeys(lesson, READ_KEYS.lesson, "lesson", errors);
  need(lesson.id === id, "id", `id must be "${id}" (the file name)`);
  need(id !== "diagrams", "id", '"diagrams" is the diagrams folder, pick another id');
  need(!(RETIRED_IDS[lang] ?? []).includes(id), "id", `"${id}" was an earlier lesson's id, and old progress would mark this one's parts as read: pick a new one`);
  need(nonEmpty(lesson.title) && lesson.title.length <= 60, "title", "title is required, at most 60 characters");
  need(lesson.section === sectionTitle, "section", `section must be "${sectionTitle}" (from index.json)`);
  need(nonEmpty(lesson.summary) && lesson.summary.length <= 160, "summary", "summary is required, at most 160 characters");
  if (!nonEmpty(lesson.intro)) need(false, "intro", "intro is required");
  else {
    const n = proseWords(lesson.intro);
    need(n >= READ.intro[0] && n <= READ.intro[1], "intro", `${n} words, write ${READ.intro[0]} to ${READ.intro[1]}`);
  }
  if (!nonEmpty(lesson.recap)) need(false, "recap", "recap is required: a - list of the lesson's takeaways");
  else {
    const lines = lesson.recap.trim().split("\n");
    need(lines.every((l) => /^- \S/.test(l)), "recap", "a - list, one line per takeaway, and nothing else");
    need(lines.length >= READ.recap[0] && lines.length <= READ.recap[1], "recap", `${lines.length} takeaways, give ${READ.recap[0]} to ${READ.recap[1]}`);
  }
  const steps = Array.isArray(lesson.steps) ? lesson.steps : [];
  need(Array.isArray(lesson.steps) && steps.length >= READ.steps[0] && steps.length <= READ.steps[1], "steps", `steps must have ${READ.steps[0]} to ${READ.steps[1]} parts`);
  if (steps.length >= READ.steps[0] && steps.length <= READ.steps[1]) warn(steps.length >= READ.stepsWarn[0] && steps.length <= READ.stepsWarn[1], "steps", `${steps.length} parts, ${READ.stepsWarn[0]} to ${READ.stepsWarn[1]} read best`);
  const titles = new Set();
  for (const [i, step] of steps.entries()) {
    const at = `steps[${i}]`;
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      need(false, at, "must be an object");
      continue;
    }
    checkKeys(step, READ_KEYS.step, at, errors);
    need(nonEmpty(step.title) && step.title.length <= 60, `${at}.title`, "required, at most 60 characters");
    if (nonEmpty(step.title)) {
      need(!titles.has(step.title), `${at}.title`, `"${step.title}" is another part's title too`);
      titles.add(step.title);
    }
    let words = 0;
    if (!nonEmpty(step.body)) need(false, `${at}.body`, "required");
    else {
      const n = proseWords(step.body);
      words += n;
      if (n < READ.body[0] || n > READ.body[1]) need(false, `${at}.body`, `${n} words of prose, it must be ${READ.body[0]} to ${READ.body[1]} (the aim is 400 to 900)`);
      else warn(n >= READ.bodyWarn[0] && n <= READ.bodyWarn[1], `${at}.body`, `${n} words of prose, ${READ.bodyWarn[0]} to ${READ.bodyWarn[1]} read best (the aim is 400 to 900)`);
      const fences = codeFences(step.body);
      warn(fences.length <= READ.fencesWarn, `${at}.body`, `${fences.length} code blocks, keep it to ${READ.fencesWarn}`);
    }
    need(Array.isArray(step.examples) && step.examples.length <= 3, `${at}.examples`, "must be a list of 0 to 3 examples");
    for (const [e, ex] of (Array.isArray(step.examples) ? step.examples : []).entries()) {
      const where = `${at}.examples[${e}]`;
      if (!ex || typeof ex !== "object" || Array.isArray(ex)) {
        need(false, where, "must be an object");
        continue;
      }
      checkKeys(ex, READ_KEYS.example, where, errors);
      for (const k of ["title", "prompt", "language", "code", "explanation"]) need(nonEmpty(ex[k]), `${where}.${k}`, "required");
      need(ex.output === undefined || nonEmpty(ex.output), `${where}.output`, "real output when present, never empty");
      if (isStr(ex.language)) need(READ_FENCES.has(ex.language), `${where}.language`, `"${ex.language}" isn't highlighted (use one of ${[...READ_FENCES].join(", ")})`);
      if (nonEmpty(ex.title)) need(ex.title.length <= 60, `${where}.title`, "at most 60 characters");
      if (nonEmpty(ex.prompt)) {
        const n = proseWords(ex.prompt);
        words += n;
        warn(n <= READ.promptWarn, `${where}.prompt`, `${n} words, keep a prompt to about ${READ.promptWarn}`);
      }
      if (nonEmpty(ex.explanation)) {
        const n = proseWords(ex.explanation);
        words += n;
        need(n >= READ.explanation[0] && n <= READ.explanation[1], `${where}.explanation`, `${n} words, write ${READ.explanation[0]} to ${READ.explanation[1]}`);
      }
    }
    if (words > READ.partMax) need(false, at, `${words} words in the part (body, prompts, and explanations), at most ${READ.partMax}`);
    else warn(words <= READ.partWarn, at, `${words} words in the part (body, prompts, and explanations), ${READ.partWarn} at most read best`);
  }
}

/** A read lesson's prose fields, and whether each is Markdown. */
function readProseFields(lesson) {
  const fields = [
    ["title", lesson.title, false],
    ["summary", lesson.summary, false],
    ["intro", lesson.intro, true],
    ["recap", lesson.recap, true],
  ];
  for (const [i, s] of (lesson.steps ?? []).entries()) {
    const at = `steps[${i}]`;
    fields.push([`${at}.title`, s?.title, false], [`${at}.body`, s?.body, true]);
    for (const [e, ex] of (s?.examples ?? []).entries()) {
      const where = `${at}.examples[${e}]`;
      fields.push([`${where}.title`, ex?.title, false], [`${where}.prompt`, ex?.prompt, true], [`${where}.explanation`, ex?.explanation, true]);
    }
  }
  return fields.filter(([, value]) => isStr(value));
}

/** Which part shows a field's diagrams: the intro is part 1's, the recap
    the last part's, and a step's fields are its own. */
function partOf(where, count) {
  const m = /^steps\[(\d+)\]/.exec(where);
  return m ? Number(m[1]) : where === "intro" ? 0 : where === "recap" ? count - 1 : -1;
}

/** A course's diagram files, each read once. */
function diagramFiles(dir) {
  const found = new Map();
  const folder = path.join(dir, "diagrams");
  if (!existsSync(folder)) return found;
  for (const file of readdirSync(folder)) {
    if (!file.endsWith(".svg")) continue;
    const name = file.slice(0, -4);
    found.set(name, parseDiagram(readFileSync(path.join(folder, file), "utf8"), name));
  }
  return found;
}

async function checkReadContent(lesson, diagrams, used, errors, warnings) {
  const count = lesson.steps.length;
  const shown = lesson.steps.map(() => new Map());
  for (const [where, value, isMarkdown] of readProseFields(lesson)) {
    lintProse(where, value, errors);
    const part = partOf(where, count);
    lintMarkdown(where, value, isMarkdown, errors, {
      fences: READ_FENCES,
      flags: READ_FLAGS,
      stdin: false,
      noH1: true,
      onDiagram: (name, caption) => {
        if (!name) return errors.push({ where, message: "a diagram fence needs a name: ```diagram <name>" });
        if (!ID_RE.test(name)) return errors.push({ where, message: `diagram "${name}": name it in kebab-case` });
        used.add(name);
        if (part >= 0) {
          const seen = shown[part];
          if (seen.has(name)) errors.push({ where, message: `diagram "${name}" is shown twice in part ${part + 1} (once a part)` });
          seen.set(name, where);
        }
        if (caption.includes("\n")) errors.push({ where, message: `diagram "${name}": a caption is one line` });
        if (caption.length > READ.caption) errors.push({ where, message: `diagram "${name}": the caption is ${caption.length} characters, at most ${READ.caption}` });
        lintProse(`${where} (${name} caption)`, caption, errors);
        lintInline(`${where} (${name} caption)`, caption, errors);
      },
    });
    if (!isMarkdown) continue;
    // Code in the field: its size, its indent, and that it parses.
    for (const [f, fence] of codeFences(value).entries()) {
      await checkCode(`${where} code block ${f + 1}`, fence.code, fence.language, fence.flags.includes("sketch"), errors, warnings);
    }
  }
  for (const [i, step] of lesson.steps.entries()) {
    for (const [e, ex] of step.examples.entries()) await checkCode(`steps[${i}].examples[${e}].code`, ex.code, ex.language, false, errors, warnings);
  }
  for (const [part, seen] of shown.entries()) {
    if (seen.size > READ.diagramsPerPart) errors.push({ where: `steps[${part}]`, message: `${seen.size} diagrams in one part, at most ${READ.diagramsPerPart}` });
    for (const [name, where] of seen) {
      const found = diagrams.get(name);
      if (!found) {
        errors.push({ where, message: `there's no diagrams/${name}.svg` });
        continue;
      }
      for (const e of found.errors) errors.push({ where: `diagrams/${name}.svg`, message: e });
      for (const w of found.warnings) warnings.push({ where: `diagrams/${name}.svg`, message: w });
      if (found.data) {
        lintProse(`diagrams/${name}.svg title`, found.data.title, errors);
        lintProse(`diagrams/${name}.svg desc`, found.data.desc, errors);
      }
    }
  }
}

async function checkCode(where, code, language, sketch, errors, warnings) {
  if (!isStr(code)) return;
  const lines = code.replace(/\n$/, "").split("\n").length;
  if (lines >= READ.codeMax) errors.push({ where, message: `${lines} lines, keep code under ${READ.codeWarn} (${READ.codeMax} at most)` });
  else if (lines >= READ.codeWarn) warnings.push({ where, message: `${lines} lines, keep code under ${READ.codeWarn}` });
  if (/\t/.test(code) && !TAB_LANGUAGES.has(language)) warnings.push({ where, message: "contains tab characters, indent with spaces" });
  if (!sketch) for (const problem of await syntaxErrors(code, language)) errors.push({ where, message: `${problem} (mark a block that leaves code out with sketch)` });
}

// ---------------------------------------------------------------- lessons

async function verifyLesson(lang, lesson) {
  const errors = [];
  const jobs = [];
  // SQL programs run on a fresh database: the lesson's setup, then the
  // example's or test's own setup ("stdin"), then the program.
  const input = (stdin) => (lang === "sql" ? [lesson.setup, stdin].filter((x) => isStr(x) && x.trim()).join("\n") : stdin);
  for (const [i, step] of lesson.steps.entries()) {
    const at = `steps[${i}]`;
    for (const [where, ex] of examplesOf(step, at)) {
      jobs.push(
        (async () => {
          const [a, b] = await Promise.all([run(lang, ex.code, input(ex.stdin)), run(lang, ex.code, input(ex.stdin))]);
          for (const r of [a, b]) {
            const why = failure(r);
            if (why) return errors.push({ where: `${where}.code`, message: why, actual: clip(r.compileError || r.stderr || r.stdout) });
          }
          if (a.stderr.trim()) errors.push({ where: `${where}.code`, message: "wrote to stderr", actual: clip(a.stderr) });
          const out = normalizeOutput(a.stdout);
          if (out !== normalizeOutput(b.stdout)) errors.push({ where: `${where}.code`, message: "output differs between two runs (nondeterministic)", expected: clip(out), actual: clip(normalizeOutput(b.stdout)) });
          const want = normalizeOutput(ex.output);
          if (out !== want) errors.push({ where: `${where}.output`, message: `does not match what the code prints (${firstDiff(want, out)})`, expected: clip(want), actual: clip(out) });
        })()
      );
    }
    const pr = step.practice;
    jobs.push(
      (async () => {
        // Every test runs twice, so a solution that only sometimes passes is caught.
        const pairs = await Promise.all(pr.tests.map((t) => Promise.all([run(lang, pr.solution, input(t.stdin)), run(lang, pr.solution, input(t.stdin))])));
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
        const r = await run(lang, pr.starter, input(pr.tests[0].stdin));
        if (r.compileError) return errors.push({ where: `${at}.practice.starter`, message: "starter must compile so learners begin from working code", actual: clip(r.compileError) });
        if (r.code !== 0) return errors.push({ where: `${at}.practice.starter`, message: `starter must run cleanly, exited with ${r.code ?? r.status}`, actual: clip(r.stderr || r.stdout) });
        const passesAll = (await Promise.all(pr.tests.map((t, i) => (i === 0 ? r : run(lang, pr.starter, input(t.stdin))))))
          .every((x, i) => normalizeOutput(x.stdout) === normalizeOutput(pr.tests[i].output));
        if (passesAll) errors.push({ where: `${at}.practice.starter`, message: "starter already passes every test, so there is nothing to solve" });
      })()
    );
  }
  await Promise.all(jobs);
  return errors;
}

// ---------------------------------------------------------------- index

/** index.json must have the exact shape lib/learn.ts reads. A read course
    being written may list no lessons yet. */
function checkIndex(lang, index) {
  const errors = [];
  const bad = (message) => errors.push({ where: "index.json", message });
  if (!index || typeof index !== "object" || Array.isArray(index)) return [{ where: "index.json", message: "must be a JSON object" }];
  if (index.language !== lang) bad(`language must be "${lang}"`);
  if (!nonEmpty(index.title)) bad("title is required");
  if (!isStr(index.description)) bad("description must be a string");
  if (!Array.isArray(index.sections) || (!index.sections.length && !isRead(lang))) {
    bad(isRead(lang) ? "sections must be an array" : "sections must be a non-empty array");
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
// Read courses that list no lessons yet.
const emptyCourses = [];
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

  // A read course keeps only lessons and diagrams/.
  const read = isRead(lang);
  const diagrams = read ? diagramFiles(dir) : new Map();
  const usedDiagrams = new Set();
  if (read) {
    const stray = readdirSync(dir).filter((f) => f !== "diagrams" && statSync(path.join(dir, f)).isDirectory());
    if (stray.length) {
      const warnings = stray.map((f) => ({ where: `${f}/`, message: "a read course holds lessons and diagrams/ only" }));
      report.lessons.push({ lang, id: "files", ok: true, errors: [], warnings });
      if (!asJson) printResult(lang, "files", [], warnings);
    }
    if (!listed.length) emptyCourses.push(lang);
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
      if (lesson && read) {
        // Read lessons run nothing: their shape, prose, code, and diagrams.
        checkReadSchema(lesson, id, sectionTitle, lang, errors, warnings);
        if (!errors.length) await checkReadContent(lesson, diagrams, usedDiagrams, errors, warnings);
        else for (const [, value] of readProseFields(lesson)) for (const name of diagramNames(value)) usedDiagrams.add(name);
      } else if (lesson) {
        if (lesson.format === "read") errors.push({ where: "format", message: `read lessons go in a read course (${READ_LANGUAGES.join(", ")})` });
        else checkSchema(lesson, id, sectionTitle, errors, warnings);
      }
      if (lesson && !read && !errors.length) {
        checkProse(lesson, errors);
        checkMarkdown(lesson, errors);
      }
      if (lesson && !read && !errors.length && !noRun) errors.push(...(await verifyLesson(lang, lesson)));
      if (errors.length) report.ok = false;
      report.lessons.push({ lang, id, ok: !errors.length, errors, warnings });
      if (!asJson) printResult(lang, id, errors, warnings);
    })
  );

  // Every diagram file is shown somewhere, once the whole course is checked.
  if (read && !onlyLessons.length) {
    const errors = [];
    const warnings = [];
    for (const [name, found] of diagrams) {
      if (usedDiagrams.has(name)) continue;
      warnings.push({ where: `diagrams/${name}.svg`, message: "no lesson shows it" });
      for (const e of found.errors) errors.push({ where: `diagrams/${name}.svg`, message: e });
    }
    const folder = path.join(dir, "diagrams");
    for (const f of existsSync(folder) ? readdirSync(folder) : []) {
      if (!f.endsWith(".svg")) warnings.push({ where: `diagrams/${f}`, message: "only .svg files go in diagrams/" });
    }
    if (errors.length) report.ok = false;
    if (errors.length || warnings.length) {
      report.lessons.push({ lang, id: "diagrams", ok: !errors.length, errors, warnings });
      if (!asJson) printResult(lang, "diagrams", errors, warnings);
    }
  }
}

const checked = report.lessons.filter((l) => !["index", "files", "diagrams"].includes(l.id));
if (!checked.length && report.ok && emptyCourses.length === langs.length) {
  // Only read courses with no lessons yet: nothing to check, and nothing wrong.
  if (!asJson) console.log(`no lessons yet in ${emptyCourses.join(", ")}`);
} else if (!checked.length && report.ok) {
  report.ok = false;
  report.lessons.push({ lang: langs.join(","), id: "none", ok: false, errors: [{ where: "lessons", message: "no lessons were checked" }], warnings: [] });
  if (!asJson) console.log("✗ no lessons were checked");
}
if (asJson) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
else if (checked.length || !report.ok) {
  const bad = checked.filter((l) => !l.ok).length;
  console.log(`\n${checked.length - bad}/${checked.length} passed${report.ok ? "" : bad ? "" : " (index problems above)"}`);
}
process.exitCode = report.ok ? 0 : 1;
