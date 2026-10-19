import { JobError, type Job } from "../jobs.ts";
import { SCRIPT_JOB } from "../profiles.ts";
import type { RunRequest, TestSpec, TypeTests } from "../schemas.ts";
import type { TarEntry } from "../tar.ts";
import {
  brokenTest,
  pistonRun,
  skippedTest,
  type Diagnostic,
  type PistonRun,
  type RunResponse,
  type TestResult,
  type TypeTestResult,
} from "./types.ts";

/**
 * The typescript recipe (architecture §4.1, outlines/typescript.md §3 and §8):
 * TypeScript 7.0.2 checks main.ts once, and a type error stops the run like a
 * C++ compile error. Then Node 26.12.0 runs it with type stripping, once per
 * test, each test in a fresh /work (and /tmp), so a file one test writes
 * never reaches the next. Type tests are compiled in that same tsc pass, each
 * case as its own module (type-test-1.ts and on), so every diagnostic lands
 * in exactly one case and a case can `declare` what it needs. Honesty rules
 * (forbid) are judged by lib/single-checks.mjs from the source, not here.
 */

export const IMAGE = "node";
export const WORK_DIR = "/work";
export const HOSTNAME = "workspace";
export const TRY_IT_MARKER = "// --- try it ---";

/** The course tsconfig (outlines/typescript.md §3), next to every program. */
export const TSCONFIG = {
  compilerOptions: {
    target: "esnext",
    module: "nodenext",
    types: ["node"],
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    noImplicitOverride: true,
    noFallthroughCasesInSwitch: true,
    erasableSyntaxOnly: true,
    verbatimModuleSyntax: true,
    isolatedModules: true,
    moduleDetection: "force",
    noUncheckedSideEffectImports: true,
    allowImportingTsExtensions: true,
    noEmit: true,
    skipLibCheck: true,
  },
  include: ["*.ts"],
};

/** Without "type": "module", tsc treats main.ts as CommonJS under nodenext
    (TS1295 and TS1309 on top-level await), while Node runs it as a module. */
export const PACKAGE_JSON = { type: "module" };

export const COMPILE_CMD = ["tsc", "-p", ".", "--pretty", "false"];

/** node runs main.ts with its stdio made blocking first (docker/node/stdio.mjs). */
export function runCmd(args: readonly string[] = []): string[] {
  return ["node", "--import", "/opt/hu/node/stdio.mjs", "main.ts", ...args];
}

/** The environment of every step: the container's, plus the test's own and the clock. */
export function baseEnv(): string[] {
  return ["HOME=/home/learner", "USER=learner", "LOGNAME=learner", "TZ=UTC", "LANG=C.UTF-8", "PATH=/usr/local/bin:/usr/bin:/bin"];
}

export function stepEnv(env: Record<string, string> = {}, clock?: string | null): string[] {
  const vars = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  // One variable carries the frozen clock (PLAN.md 2.11): code that reads
  // HU_FIXED_TIME prints the same thing every run.
  if (clock) vars.push(`HU_FIXED_TIME=${clock}`);
  return vars;
}

export interface TypeTestLayout {
  /** One file per case, in the order of the cases. */
  files: { path: string; source: string }[];
  /** Lines 1 to importLines of each file hold the imports. */
  importLines: number;
}

const TYPE_TEST_FILE = /^type-test-\d+\.ts$/;

/** Whether tsc's diagnostic is in a type-test file rather than main.ts. */
export const isTypeTestFile = (file: string) => TYPE_TEST_FILE.test(file);

/**
 * type-test-1.ts, type-test-2.ts, ...: each case as its own module, the
 * imports line and then the case's code at the top level. A block can't hold
 * `declare const p: Payment;` (TS1184), a module can, and no case sees the
 * names another declares. The tsconfig's "*.ts" puts them all in the one tsc
 * pass.
 */
export function typeTestFiles(tests: TypeTests): TypeTestLayout {
  const imports = tests.imports.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  const files = tests.cases.map((c, i) => ({
    path: `type-test-${i + 1}.ts`,
    source: `${imports}\n${c.code.replace(/\r\n/g, "\n").replace(/\n+$/, "")}\n`,
  }));
  return { files, importLines: imports.split("\n").length };
}

export interface ParsedDiagnostic extends Diagnostic {
  /** The file it's in, or "" for a diagnostic with no location. */
  file: string;
  /** Its full text as tsc printed it, elaboration lines included. */
  text: string;
}

/** tsc --pretty false output: "main.ts(1,7): error TS2322: message", with
    indented elaboration lines under each. */
export function parseDiagnostics(output: string): ParsedDiagnostic[] {
  const out: ParsedDiagnostic[] = [];
  for (const line of output.replace(/\r\n/g, "\n").split("\n")) {
    if (!line) continue;
    if (/^\s/.test(line) && out.length) {
      const last = out[out.length - 1];
      last.text += `\n${line}`;
      last.message += `\n${line.trim()}`;
      continue;
    }
    const located = /^(.+?)\((\d+),(\d+)\): (?:error|warning|message) (TS\d+): (.*)$/.exec(line);
    if (located) {
      out.push({ file: located[1], line: Number(located[2]), col: Number(located[3]), code: located[4], message: located[5], text: line });
      continue;
    }
    const global = /^(?:error|warning|message) (TS\d+): (.*)$/.exec(line);
    out.push({ file: "", line: 0, col: 0, code: global?.[1] ?? "", message: global?.[2] ?? line, text: line });
  }
  return out;
}

/** Each case's diagnostics, and whether the case behaved as it said it would. */
export function judgeTypeTests(tests: TypeTests, layout: TypeTestLayout, diagnostics: ParsedDiagnostic[]): TypeTestResult[] {
  return tests.cases.map((c, i) => {
    const inFile = diagnostics.filter((d) => d.file === layout.files[i].path);
    // Every file starts with the same imports, so when they fail, they fail in every case.
    const importErrors = inFile.filter((d) => d.line <= layout.importLines);
    const mine = inFile
      .filter((d) => d.line > layout.importLines)
      .map((d) => ({ line: d.line - layout.importLines, col: d.col, code: d.code, message: d.message }));
    const result: TypeTestResult = { name: c.name, expect: c.expect, pass: false, diagnostics: mine };
    if (importErrors.length) {
      result.message = `The type tests couldn't import from main.ts: ${importErrors[0].message}`;
    } else if (c.expect === "ok") {
      result.pass = mine.length === 0;
      if (!result.pass) result.message = `This should compile, but: ${mine[0].message}`;
    } else if (!mine.length) {
      result.message = "This should be a type error, but it compiles.";
    } else if (c.errorCode && !mine.some((d) => d.code === c.errorCode)) {
      result.message = `This should be ${c.errorCode}, but tsc reported ${[...new Set(mine.map((d) => d.code))].join(", ")}.`;
    } else {
      result.pass = true;
    }
    return result;
  });
}

/** The program with everything after its `// --- try it ---` line replaced, or null without the line. */
export function spliceTryIt(code: string, tryIt: string): string | null {
  const lines = code.split("\n");
  const at = lines.findIndex((l) => l.trim() === TRY_IT_MARKER);
  if (at < 0) return null;
  return `${lines.slice(0, at + 1).join("\n")}\n${tryIt.replace(/\n*$/, "\n")}`;
}

const seconds = (iso: string | null | undefined) => (iso ? Math.floor(Date.parse(iso) / 1000) : undefined);

/** Everything the job starts with in /work. */
export function workFiles(req: RunRequest, layout: TypeTestLayout | null): TarEntry[] {
  const mtime = seconds(req.clock);
  const file = (path: string, text: string): TarEntry => ({ path, type: "file", data: Buffer.from(text), mtime });
  const main = req.files[0];
  const code = Buffer.from(main.content, main.encoding === "base64" ? "base64" : "utf8").toString("utf8");
  const entries = [
    file("tsconfig.json", `${JSON.stringify(TSCONFIG, null, 2)}\n`),
    file("package.json", `${JSON.stringify(PACKAGE_JSON)}\n`),
    file("main.ts", code),
  ];
  if (layout) entries.push(...layout.files.map((f) => file(f.path, f.source)));
  // A test with tryIt runs its own copy of the program, in t<n>/.
  req.tests?.forEach((t, n) => {
    if (t.tryIt === undefined) return;
    const spliced = spliceTryIt(code, t.tryIt);
    if (spliced !== null) entries.push(file(`t${n + 1}/main.ts`, spliced));
  });
  return entries;
}

export async function runTypeScript(job: Job, req: RunRequest, time: (key: "loadMs" | "compileMs" | "runMs", ms: number) => void): Promise<Omit<RunResponse, "timing">> {
  const limits = SCRIPT_JOB;
  const layout = req.typeTests ? typeTestFiles(req.typeTests) : null;
  const response: Omit<RunResponse, "timing"> = {};
  const code = Buffer.from(req.files[0].content, req.files[0].encoding === "base64" ? "base64" : "utf8").toString("utf8");
  const files = workFiles(req, layout);

  let started = Date.now();
  await job.load(WORK_DIR, files);
  time("loadMs", Date.now() - started);

  started = Date.now();
  const tsc = await job.step(COMPILE_CMD, { workDir: WORK_DIR, timeoutMs: limits.compileMs, maxBytes: limits.outputBytes });
  time("compileMs", Date.now() - started);
  const diagnostics = parseDiagnostics(tsc.stdout + tsc.stderr);
  // Type-test diagnostics belong to their cases. Everything else is main.ts's.
  const own = diagnostics.filter((d) => !isTypeTestFile(d.file));
  const compile: PistonRun = pistonRun(tsc);
  if (layout && tsc.status !== "TO" && tsc.status !== "OL" && tsc.status !== "EL") {
    compile.stdout = own.map((d) => d.text).join("\n");
    if (compile.stdout) compile.stdout += "\n";
    compile.output = compile.stdout + tsc.stderr;
    if (!own.length && tsc.code !== null && tsc.code !== 0) {
      compile.code = 0;
      compile.status = null;
      compile.message = null;
    }
  }
  response.compile = compile;
  if (layout && req.typeTests) response.typeTests = judgeTypeTests(req.typeTests, layout, diagnostics);

  const failed = compile.code !== 0 || compile.status !== null;
  started = Date.now();
  if (!req.tests) {
    // Like Piston, a failed compile is also the run's result.
    response.run = failed
      ? { ...compile }
      : pistonRun(
          await job.step(runCmd(req.args), {
            workDir: WORK_DIR,
            env: stepEnv(req.env, req.clock),
            stdin: req.stdin ?? "",
            timeoutMs: limits.runMs,
            maxBytes: limits.outputBytes,
          })
        );
  } else {
    response.results = [];
    // Whether a test has run in /work yet. tsc writes nothing (noEmit).
    let used = false;
    for (const [n, test] of req.tests.entries()) {
      if (failed) response.results.push(skippedTest("compile", "main.ts didn't compile, so this test didn't run."));
      else if (job.dead) response.results.push(skippedTest("deadline", "The check ran out of time before this test."));
      else {
        response.results.push(await runTest(job, req, code, test, n, used ? files : null));
        used = true;
      }
    }
  }
  time("runMs", Date.now() - started);
  return response;
}

/**
 * One test of a Check. `reload` is the job's files when an earlier test has
 * run: /work, /tmp, and /dev/shm are emptied and the files extracted again
 * first. A test the sandbox can't load is that test's broken result.
 */
async function runTest(job: Job, req: RunRequest, code: string, test: TestSpec, n: number, reload: TarEntry[] | null): Promise<TestResult> {
  const limits = SCRIPT_JOB;
  let workDir = WORK_DIR;
  if (test.tryIt !== undefined) {
    if (spliceTryIt(code, test.tryIt) === null) {
      const stderr = `This check calls your code after the line ${TRY_IT_MARKER}, and that line is gone. Put it back, then check again.\n`;
      return brokenTest("The try it line is missing", stderr);
    }
    workDir = `${WORK_DIR}/t${n + 1}`;
  }
  if (reload) {
    try {
      await job.load(WORK_DIR, reload, true);
    } catch (err) {
      if (err instanceof JobError) return brokenTest("This test's files couldn't be loaded", `${err.message}\n`);
      throw err;
    }
  }
  const step = await job.step(runCmd(test.args), {
    workDir,
    env: stepEnv({ ...req.env, ...test.env }, test.clock === undefined ? req.clock : test.clock),
    stdin: test.stdin ?? "",
    timeoutMs: limits.runMs,
    maxBytes: limits.outputBytes,
  });
  return { ...pistonRun(step), files: {}, exists: {} };
}
