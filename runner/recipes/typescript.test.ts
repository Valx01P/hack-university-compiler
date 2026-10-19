import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RunRequest } from "../schemas.ts";
import {
  COMPILE_CMD,
  PACKAGE_JSON,
  TSCONFIG,
  judgeTypeTests,
  parseDiagnostics,
  runCmd,
  spliceTryIt,
  stepEnv,
  typeTestsFile,
  workFiles,
} from "./typescript.ts";

const typeTests = {
  imports: 'import { describe, type Payment } from "./main.ts";',
  cases: [
    { name: "accepts a card", expect: "ok" as const, code: 'describe({ kind: "card", last4: "4242" });' },
    { name: "rejects a card without last4", expect: "error" as const, errorCode: "TS2345", code: 'describe({ kind: "card" });' },
    { name: "two lines", expect: "error" as const, code: "const a: number = 1;\nconst b: string = a;" },
  ],
};

describe("typescript recipe commands", () => {
  it("checks once with tsc, then runs main.ts with node", () => {
    assert.deepEqual(COMPILE_CMD, ["tsc", "-p", ".", "--pretty", "false"]);
    assert.deepEqual(runCmd(), ["node", "--import", "/opt/hu/node/stdio.mjs", "main.ts"]);
    assert.deepEqual(runCmd(["a", "b c"]), ["node", "--import", "/opt/hu/node/stdio.mjs", "main.ts", "a", "b c"]);
  });

  it("writes package.json as a module, so tsc and node agree that main.ts is ESM", () => {
    assert.deepEqual(PACKAGE_JSON, { type: "module" });
    assert.equal(TSCONFIG.compilerOptions.module, "nodenext");
    assert.equal(TSCONFIG.compilerOptions.erasableSyntaxOnly, true);
    assert.equal(TSCONFIG.compilerOptions.noEmit, true);
    assert.deepEqual(TSCONFIG.include, ["*.ts"]);
  });

  it("passes the frozen clock as HU_FIXED_TIME, after the test's own variables", () => {
    assert.deepEqual(stepEnv({ A: "1" }, "2026-10-01T09:00:00Z"), ["A=1", "HU_FIXED_TIME=2026-10-01T09:00:00Z"]);
    assert.deepEqual(stepEnv({}, null), []);
    assert.deepEqual(stepEnv(), []);
  });

  it("puts every file the job needs in /work, and each tryIt test's program in t<n>/", () => {
    const req = RunRequest.parse({
      recipe: "typescript",
      files: [{ name: "main.ts", content: "export const x = 1;\n// --- try it ---\nconsole.log(x);\n" }],
      clock: "2026-10-01T09:00:00Z",
      tests: [{}, { tryIt: "console.log(x + 1);" }],
    });
    const files = workFiles(req, typeTestsFile(typeTests));
    assert.deepEqual(files.map((f) => f.path), ["tsconfig.json", "package.json", "main.ts", "type-tests.ts", "t2/main.ts"]);
    assert.equal(files[0].data?.toString(), `${JSON.stringify(TSCONFIG, null, 2)}\n`);
    assert.equal(files[4].data?.toString(), "export const x = 1;\n// --- try it ---\nconsole.log(x + 1);\n");
    assert.equal(files[2].mtime, Date.parse("2026-10-01T09:00:00Z") / 1000);
  });
});

describe("tryIt", () => {
  it("replaces everything after the marker line", () => {
    assert.equal(spliceTryIt("a\n  // --- try it ---  \nb\nc\n", "d();"), "a\n  // --- try it ---  \nd();\n");
  });

  it("needs the marker", () => {
    assert.equal(spliceTryIt("a\nb\n", "d();"), null);
  });
});

describe("type tests", () => {
  it("put each case in its own block, at known lines", () => {
    const layout = typeTestsFile(typeTests);
    assert.equal(
      layout.source,
      [
        typeTests.imports,
        "{",
        typeTests.cases[0].code,
        "}",
        "{",
        typeTests.cases[1].code,
        "}",
        "{",
        "const a: number = 1;",
        "const b: string = a;",
        "}",
        "",
      ].join("\n")
    );
    assert.equal(layout.importLines, 1);
    assert.deepEqual(layout.cases.map((c) => [c.from, c.to]), [[3, 3], [6, 6], [9, 10]]);
  });

  it("judge each case by the diagnostics in its lines", () => {
    const layout = typeTestsFile(typeTests);
    const out = [
      "main.ts(2,3): error TS2322: Type 'x' is not assignable to type 'y'.",
      "type-tests.ts(6,10): error TS2345: Argument of type '{ kind: \"card\"; }' is not assignable to parameter of type 'Payment'.",
      "  Property 'last4' is missing in type '{ kind: \"card\"; }'.",
      "type-tests.ts(10,7): error TS2322: Type 'number' is not assignable to type 'string'.",
    ].join("\n");
    const results = judgeTypeTests(typeTests, layout, parseDiagnostics(out));
    assert.deepEqual(
      results.map((r) => [r.name, r.pass, r.diagnostics.map((d) => `${d.line}:${d.col} ${d.code}`)]),
      [
        ["accepts a card", true, []],
        ["rejects a card without last4", true, ["1:10 TS2345"]],
        ["two lines", true, ["2:7 TS2322"]],
      ]
    );
    assert.match(results[1].diagnostics[0].message, /\nProperty 'last4' is missing/);
  });

  it("explain a case that misbehaves", () => {
    const layout = typeTestsFile(typeTests);
    const results = judgeTypeTests(
      typeTests,
      layout,
      parseDiagnostics("type-tests.ts(3,1): error TS2554: Expected 1 arguments, but got 2.\ntype-tests.ts(6,1): error TS2322: nope")
    );
    assert.equal(results[0].pass, false);
    assert.equal(results[0].message, "This should compile, but: Expected 1 arguments, but got 2.");
    assert.equal(results[1].message, "This should be TS2345, but tsc reported TS2322.");
    assert.equal(results[2].message, "This should be a type error, but it compiles.");
  });

  it("fail every case when the imports line does", () => {
    const layout = typeTestsFile(typeTests);
    const results = judgeTypeTests(
      typeTests,
      layout,
      parseDiagnostics("type-tests.ts(1,10): error TS2305: Module '\"./main.ts\"' has no exported member 'describe'.")
    );
    assert.ok(results.every((r) => !r.pass && r.message?.startsWith("The type tests couldn't import from main.ts")));
  });
});

describe("tsc output", () => {
  it("parses located, elaborated, and global diagnostics", () => {
    const parsed = parseDiagnostics(
      "main.ts(14,11): error TS2322: Type '{ kind: \"square\"; }' is not assignable to type 'never'.\n  More detail.\nerror TS5023: Unknown compiler option 'x'.\n"
    );
    assert.deepEqual(
      parsed.map(({ file, line, col, code }) => ({ file, line, col, code })),
      [
        { file: "main.ts", line: 14, col: 11, code: "TS2322" },
        { file: "", line: 0, col: 0, code: "TS5023" },
      ]
    );
    assert.equal(parsed[0].text, "main.ts(14,11): error TS2322: Type '{ kind: \"square\"; }' is not assignable to type 'never'.\n  More detail.");
  });
});
