// node --test lib/single-checks.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filesToCollect,
  forbiddenUses,
  judgeTest,
  judgeTypeTests,
  normalizeOutput,
  parseTscOutput,
  tokenize,
} from "./single-checks.mjs";

const run = (over = {}) => ({ stdout: "hi\n", stderr: "", code: 0, signal: null, verdict: null, ...over });

// Answers hu-runner 0.1.0 gave to POST /v1/run on 2026-10-19 (timing left
// out), so these tests read exactly what a Check gets back.
const RUNNER = {
  // mkdir -p tmp/cache, ln -s /etc/passwd link, printf 'ok\n' > report.txt,
  // echo done. The test named report.txt, tmp, and link in files, and tmp,
  // link, and gone.txt in absent.
  leftovers: {
    stdout: "done\n", stderr: "", code: 0, signal: null, status: null, message: null, output: "done\n", limit: null, wall_time: 15,
    files: { "report.txt": "ok\n", tmp: null, link: null, "gone.txt": null },
    exists: { "report.txt": true, tmp: true, link: true, "gone.txt": false },
  },
  // x="", echo y, [ -n "$x" ] && echo z: the right output, then exit 1.
  exitOnly: {
    stdout: "y\n", stderr: "", code: 1, signal: null, status: "RE", message: "Exited with error status 1", output: "y\n", limit: null, wall_time: 14,
    files: {}, exists: {},
  },
  // The plan's Payment example: every case does what it says. The cases are
  // compiled in one tsc pass, so lines count from each case's own code.
  typeTestsPass: [
    { name: "accepts a card", expect: "ok", pass: true, diagnostics: [] },
    {
      name: "rejects a card without last4", expect: "error", pass: true,
      diagnostics: [{ line: 1, col: 10, code: "TS2345", message: "Argument of type '{ kind: \"card\"; }' is not assignable to parameter of type 'Payment'.\nProperty 'last4' is missing in type '{ kind: \"card\"; }' but required in type '{ kind: \"card\"; last4: string; }'." }],
    },
  ],
  typeTestsFail: [
    {
      name: "accepts cash with a note", expect: "ok", pass: false,
      diagnostics: [{ line: 1, col: 26, code: "TS2353", message: "Object literal may only specify known properties, and 'note' does not exist in type '{ kind: \"cash\"; }'." }],
      message: "This should compile, but: Object literal may only specify known properties, and 'note' does not exist in type '{ kind: \"cash\"; }'.",
    },
    { name: "rejects cash", expect: "error", pass: false, diagnostics: [], message: "This should be a type error, but it compiles." },
    {
      name: "rejects a card without last4", expect: "error", pass: false,
      diagnostics: [{ line: 1, col: 10, code: "TS2345", message: "Argument of type '{ kind: \"card\"; }' is not assignable to parameter of type 'Payment'.\nProperty 'last4' is missing in type '{ kind: \"card\"; }' but required in type '{ kind: \"card\"; last4: string; }'." }],
      message: "This should be TS2322, but tsc reported TS2345.",
    },
  ],
  // main.ts stopped exporting describe: the runner keeps the import error
  // out of every case's diagnostics and says so in each message.
  typeTestsImportFails: [
    { name: "accepts a card", expect: "ok", pass: false, diagnostics: [], message: "The type tests couldn't import from main.ts: Module '\"./main.ts\"' declares 'describe' locally, but it is not exported." },
    { name: "rejects a card without last4", expect: "error", pass: false, diagnostics: [], message: "The type tests couldn't import from main.ts: Module '\"./main.ts\"' declares 'describe' locally, but it is not exported." },
  ],
  // forbid: ["any", "as", "non-null", "ts-comments"] on FORBID_SRC.
  forbid: [
    { rule: "as", line: 4, col: 24, message: "A type assertion (as) makes the checker trust you. Fix the type instead of asserting it." },
    { rule: "non-null", line: 5, col: 20, message: "The non-null assertion (!) hides a value that may be undefined. Check for it instead." },
  ],
};

const FORBID_SRC = [
  'const text = "a as b";',
  "const parts = text.split(/ as /);",
  'const loud = /hi!/.test("hi!");',
  "const n = parts.length as number;",
  "console.log(n, loud!);",
  "",
].join("\n");

test("outputs compare without trailing spaces or blank lines", () => {
  assert.equal(normalizeOutput("a  \r\nb\n\n\n"), "a\nb");
  assert.equal(normalizeOutput(null), "");
});

test("a run passes on its output and a clean exit", () => {
  assert.equal(judgeTest({ output: "hi" }, run()).passed, true);
  assert.deepEqual(judgeTest({ output: "hi" }, run({ stdout: "ho" })).problems, ["wrong output"]);
  assert.deepEqual(judgeTest({ output: "hi" }, run({ code: 1 })).problems, ["exited with 1, expected 0"]);
  assert.equal(judgeTest({ output: "hi", exitCode: 3 }, run({ code: 3 })).passed, true);
  assert.deepEqual(judgeTest({ output: "hi" }, run({ code: null, signal: "SIGKILL" })).problems, ["killed by SIGKILL"]);
  // The app calls the verdict verdict, the server status.
  assert.deepEqual(judgeTest({ output: "hi" }, run({ verdict: "TO" })).problems, ["timed out"]);
  assert.deepEqual(judgeTest({ output: "hi" }, { stdout: "hi", code: 0, status: "OL" }).problems, ["printed too much"]);
  // Right output, wrong exit: the problem says which.
  assert.deepEqual(judgeTest({ output: "y" }, RUNNER.exitOnly).problems, ["exited with 1, expected 0"]);
});

test("stderr, files left behind, and files removed", () => {
  const t = { output: "", stderrIncludes: "error: no data", files: { "out/a.txt": "1\n2" }, absent: ["tmp.log"] };
  assert.deepEqual(filesToCollect(t), ["out/a.txt", "tmp.log"]);
  const good = run({ stdout: "", stderr: "x\nerror: no data\n", files: { "out/a.txt": "1\n2\n", "tmp.log": null }, exists: { "out/a.txt": true, "tmp.log": false } });
  assert.equal(judgeTest(t, good).passed, true);
  const bad = run({ stdout: "", stderr: "", files: { "out/a.txt": "1", "tmp.log": "left" }, exists: { "out/a.txt": true, "tmp.log": true } });
  assert.deepEqual(judgeTest(t, bad).problems, [
    'stderr doesn\'t say "error: no data"',
    "out/a.txt has the wrong contents",
    "tmp.log should not exist",
  ]);
  assert.deepEqual(judgeTest({ output: "", files: { "a.txt": "x" } }, run({ stdout: "" })).problems, ["a.txt is missing"]);
});

test("a folder or a link left behind counts, and isn't a regular file", () => {
  const absent = { output: "done", absent: ["tmp", "link", "gone.txt"] };
  assert.deepEqual(judgeTest(absent, RUNNER.leftovers).problems, ["tmp should not exist", "link should not exist"]);
  const files = { output: "done", files: { "report.txt": "ok", tmp: "", link: "", "gone.txt": "" } };
  assert.deepEqual(judgeTest(files, RUNNER.leftovers).problems, ["tmp isn't a regular file", "link isn't a regular file", "gone.txt is missing"]);
  // A run that doesn't say whether a path exists can't prove it's gone.
  const { exists, ...unsure } = RUNNER.leftovers;
  assert.deepEqual(judgeTest({ output: "done", absent: ["gone.txt"] }, unsure).problems, ["the sandbox didn't say whether gone.txt exists"]);
});

const typeTests = {
  imports: 'import { describe, type Payment } from "./main.ts";',
  cases: [
    { name: "accepts a card", expect: "ok", code: 'describe({ kind: "card", last4: "4242" });' },
    { name: "rejects a card without last4", expect: "error", errorCode: "TS2345", code: 'describe({ kind: "card" });' },
  ],
};

test("type test verdicts are the runner's", () => {
  assert.deepEqual(judgeTypeTests(typeTests, RUNNER.typeTestsPass), [
    { name: "accepts a card", passed: true, problem: null },
    { name: "rejects a card without last4", passed: true, problem: null },
  ]);
  const failing = {
    imports: typeTests.imports,
    cases: [
      { name: "accepts cash with a note", expect: "ok", code: 'describe({ kind: "cash", note: "tip" });' },
      { name: "rejects cash", expect: "error", code: 'describe({ kind: "cash" });' },
      { name: "rejects a card without last4", expect: "error", errorCode: "TS2322", code: 'describe({ kind: "card" });' },
    ],
  };
  assert.deepEqual(judgeTypeTests(failing, RUNNER.typeTestsFail).map((v) => [v.passed, v.problem]), [
    [false, RUNNER.typeTestsFail[0].message],
    [false, "This should be a type error, but it compiles."],
    [false, "This should be TS2322, but tsc reported TS2345."],
  ]);
  // Every case fails when the imports do, even an error case with no
  // diagnostics of its own.
  assert.deepEqual(judgeTypeTests(typeTests, RUNNER.typeTestsImportFails).map((v) => v.passed), [false, false]);
  assert.match(judgeTypeTests(typeTests, RUNNER.typeTestsImportFails)[1].problem, /^The type tests couldn't import from main\.ts: /);
  // A case the runner didn't report on (or no report at all) fails.
  assert.deepEqual(judgeTypeTests(typeTests, RUNNER.typeTestsPass.slice(0, 1))[1], {
    name: "rejects a card without last4",
    passed: false,
    problem: "the type checker didn't report on this case",
  });
  assert.deepEqual(judgeTypeTests(typeTests, undefined).map((v) => v.passed), [false, false]);
});

test("tsc output becomes diagnostics", () => {
  const out = "main.ts(14,11): error TS2322: Type 'string' is not assignable to type 'number'.\n  The expected type comes from here.\nmain.ts(2,1): error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.\n";
  assert.deepEqual(parseTscOutput(out), [
    { file: "main.ts", line: 14, col: 11, code: "TS2322", message: "Type 'string' is not assignable to type 'number'.\nThe expected type comes from here." },
    { file: "main.ts", line: 2, col: 1, code: "TS1294", message: "This syntax is not allowed when 'erasableSyntaxOnly' is enabled." },
  ]);
});

const RULES = ["any", "as", "non-null", "ts-comments"];
const hits = (src) => forbiddenUses(src, RULES).map((h) => `${h.rule}@${h.line}:${h.col}`);

test("honesty rules find what they forbid, and only that", () => {
  const src = [
    'import { readFileSync as read } from "node:fs";', // 1: renaming is fine
    "export { read as load };", // 2: so is this
    'const tag = "use any as you like"; // any, as', // 3: strings and comments
    "const sizes = [1, 2] as const;", // 4: as const is fine
    "const raw: any = JSON.parse(read(0, \"utf8\"));", // 5: any
    "const n = raw as number;", // 6: as
    "const el = document.querySelector(\"p\")!;", // 7: non-null
    "if (n !== 1 && !el) console.log(`${n as number} ${tag}`);", // 8: as inside a template
    "// @ts-expect-error: on purpose", // 9: ts-comments
    "const opts = { any: true, as: 1 };", // 10: keys are fine
    "Promise.any([]);", // 11: a property is fine
  ].join("\n");
  assert.deepEqual(
    forbiddenUses(src, RULES).map((f) => `${f.line}:${f.rule}`),
    ["5:any", "6:as", "7:non-null", "8:as", "9:ts-comments"]
  );
  assert.deepEqual(forbiddenUses(src, ["any"]).map((f) => f.text), ['const raw: any = JSON.parse(read(0, "utf8"));']);
  assert.deepEqual(forbiddenUses(src, []), []);
});

test("regular expressions are skipped, the way the runner skips them", () => {
  // The runner's own scan of the same file.
  assert.deepEqual(
    forbiddenUses(FORBID_SRC, RULES).map(({ rule, line, col }) => ({ rule, line, col })),
    RUNNER.forbid.map(({ rule, line, col }) => ({ rule, line, col }))
  );
  assert.deepEqual(hits("const re = /as any!/g;\nconst ok = re.test(s);"), []);
  assert.deepEqual(hits("return /x!/.test(s);"), []);
  assert.deepEqual(hits("const parts = s.split(/[/] as /);"), []);
  // Division is still division.
  assert.deepEqual(hits("const half = total / 2 / count;\nconst r = (a as number) / 2;"), ["as@2:14"]);
});

test("strings, template text, and comments never count, the code in ${...} does", () => {
  assert.deepEqual(hits('const s = "x as any!";\nconst t = \'as any\';'), []);
  assert.deepEqual(hits("const u = `as any ${n} any!`;"), []);
  assert.deepEqual(hits("// const x = y as any;\n/* z! */"), []);
  assert.deepEqual(hits("const u = `total ${(n as number) + 1} and ${m!}`;"), ["as@1:23", "non-null@1:46"]);
  assert.deepEqual(hits("const u = `a ${`b ${x as T}`}`;"), ["as@1:23"]);
});

test("names and renames are fine", () => {
  assert.deepEqual(hits("await Promise.any([p]);\nconst o = { any: 1 };\ntype O = { any?: string };\nfunction f(any: string) {}\nx?.any;"), []);
  assert.deepEqual(hits('import * as z from "zod";\nimport { a as b, type C as D } from "./m.ts";\nexport * as ns from "./m.ts";\nexport type { A as B };'), []);
  assert.deepEqual(hits("const as = 1;\nf(as);\nconst o = { as: 2 };"), []);
  assert.deepEqual(hits("export { a as b };\nconst y = x as T;"), ["as@2:13"]);
});

test("only the postfix ! is a non-null assertion", () => {
  assert.deepEqual(hits("const a = m.get(k)!;\nconst b = arr[0]!.x;\nlet c!: number;"), ["non-null@1:19", "non-null@2:17", "non-null@3:6"]);
  assert.deepEqual(hits("if (!x) {}\nconst y = a !== b && c != d;\nreturn !done;"), []);
  assert.deepEqual(hits("const t = typeof !x;\nconst u = await !y;\nconst z = x\n!y;"), []);
});

test("only a comment that starts with @ts- silences the checker", () => {
  assert.deepEqual(hits("// @ts-ignore\nconst a = 1;"), ["ts-comments@1:1"]);
  assert.deepEqual(hits("/* @ts-expect-error */ f();\n// @ts-nocheck"), ["ts-comments@1:1", "ts-comments@2:1"]);
  assert.deepEqual(hits("/**\n * @ts-ignore\n */"), ["ts-comments@1:1"]);
  assert.deepEqual(hits("// @ts-check\n// a note about @ts-ignore\n/// <reference types=\"node\" />"), []);
});

test("tokens keep their positions across lines", () => {
  const bang = tokenize("const a = 1;\n  b!").find((t) => t.value === "!");
  assert.deepEqual([bang?.line, bang?.col], [2, 4]);
  assert.deepEqual(tokenize("x = /a b/g;").map((t) => t.type), ["ident", "punct", "regex", "punct"]);
});
