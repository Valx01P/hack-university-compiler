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
  typeTestFiles,
} from "./single-checks.mjs";

const run = (over = {}) => ({ stdout: "hi\n", stderr: "", code: 0, signal: null, verdict: null, ...over });

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
});

test("stderr, files left behind, and files removed", () => {
  const t = { output: "", stderrIncludes: "error: no data", files: { "out/a.txt": "1\n2" }, absent: ["tmp.log"] };
  assert.deepEqual(filesToCollect(t), ["out/a.txt", "tmp.log"]);
  const good = run({ stdout: "", stderr: "x\nerror: no data\n", files: { "out/a.txt": "1\n2\n", "tmp.log": null } });
  assert.equal(judgeTest(t, good).passed, true);
  const bad = run({ stdout: "", stderr: "", files: { "out/a.txt": "1", "tmp.log": "left" } });
  assert.deepEqual(judgeTest(t, bad).problems, [
    'stderr doesn\'t say "error: no data"',
    "out/a.txt has the wrong contents",
    "tmp.log should not exist",
  ]);
  assert.deepEqual(judgeTest({ output: "", files: { "a.txt": "x" } }, run({ stdout: "" })).problems, ["a.txt is missing"]);
});

const typeTests = {
  imports: 'import { describe, type Payment } from "./main.ts";',
  cases: [
    { name: "accepts a card", expect: "ok", code: 'describe({ kind: "card", last4: "4242" });' },
    { name: "rejects a card without last4", expect: "error", errorCode: "TS2345", code: 'describe({ kind: "card" });' },
    { name: "needs a declare", expect: "error", code: "declare const p: Payment;\nconst n: number = p;" },
  ],
};

test("each type test case gets a file of its own", () => {
  const files = typeTestFiles(typeTests);
  assert.deepEqual(files.map((f) => f.name), ["type-test-1.ts", "type-test-2.ts", "type-test-3.ts"]);
  assert.equal(files[2].content, `${typeTests.imports}\ndeclare const p: Payment;\nconst n: number = p;\nexport {};\n`);
  assert.equal(files[0].importLines, 1);
});

test("type test verdicts", () => {
  const d = (line, code, message = "nope") => ({ line, col: 1, code, message });
  const verdicts = judgeTypeTests(typeTests, [{ diagnostics: [] }, { diagnostics: [d(2, "TS2345")] }, { diagnostics: [d(3, "TS2322")] }]);
  assert.deepEqual(verdicts.map((v) => v.passed), [true, true, true]);
  const wrong = judgeTypeTests(typeTests, [{ diagnostics: [d(2, "TS2322", "bad")] }, { diagnostics: [d(2, "TS2322")] }, { diagnostics: [] }]);
  assert.deepEqual(wrong.map((v) => v.problem), [
    "should compile, but: bad",
    "should be TS2345, but the checker reports TS2322",
    "should be a type error, but it compiles",
  ]);
  const broken = judgeTypeTests(typeTests, [{ diagnostics: [d(1, "TS2305", "no export describe")] }, { diagnostics: [] }, { diagnostics: [] }]);
  assert.equal(broken[0].problem, "the type tests couldn't import from main.ts: no export describe");
});

test("tsc output becomes diagnostics", () => {
  const out = "main.ts(14,11): error TS2322: Type 'string' is not assignable to type 'number'.\n  The expected type comes from here.\nmain.ts(2,1): error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.\n";
  assert.deepEqual(parseTscOutput(out), [
    { file: "main.ts", line: 14, col: 11, code: "TS2322", message: "Type 'string' is not assignable to type 'number'.\nThe expected type comes from here." },
    { file: "main.ts", line: 2, col: 1, code: "TS1294", message: "This syntax is not allowed when 'erasableSyntaxOnly' is enabled." },
  ]);
});

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
  const rules = ["any", "as", "non-null", "ts-comments"];
  assert.deepEqual(
    forbiddenUses(src, rules).map((f) => `${f.line}:${f.rule}`),
    ["5:any", "6:as", "7:non-null", "8:as", "9:ts-comments"]
  );
  assert.deepEqual(forbiddenUses(src, ["any"]).map((f) => f.text), ['const raw: any = JSON.parse(read(0, "utf8"));']);
  assert.deepEqual(forbiddenUses(src, []), []);
});
