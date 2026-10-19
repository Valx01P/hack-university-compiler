import type { Job } from "../jobs.ts";
import { SCRIPT_JOB } from "../profiles.ts";
import type { RunRequest, TestSpec, TypeTests } from "../schemas.ts";
import type { TarEntry } from "../tar.ts";
import { scanHonesty } from "./honesty.ts";
import {
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
 * test. Type tests are compiled in that same tsc pass, each case in its own
 * block of a generated type-tests.ts, so every diagnostic lands in exactly one
 * case. Honesty rules are a scan of the source, no container needed.
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
  source: string;
  /** Lines 1 to importLines hold the imports. */
  importLines: number;
  /** Each case's code, as 1-based lines of type-tests.ts (its braces excluded). */
  cases: { name: string; from: number; to: number }[];
}

/** type-tests.ts: the imports line, then each case in its own block. */
export function typeTestsFile(tests: TypeTests): TypeTestLayout {
  const lines = tests.imports.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  const importLines = lines.length;
  const cases: TypeTestLayout["cases"] = [];
  for (const c of tests.cases) {
    const code = c.code.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
    lines.push("{");
    const from = lines.length + 1;
    lines.push(...code);
    cases.push({ name: c.name, from, to: lines.length });
    lines.push("}");
  }
  return { source: `${lines.join("\n")}\n`, importLines, cases };
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
  const inFile = diagnostics.filter((d) => d.file === "type-tests.ts");
  const importErrors = inFile.filter((d) => d.line <= layout.importLines);
  return tests.cases.map((c, i) => {
    const range = layout.cases[i];
    // A diagnostic on a case's braces belongs to the case too.
    const mine = inFile
      .filter((d) => d.line >= range.from - 1 && d.line <= range.to + 1)
      .map((d) => ({ line: d.line - range.from + 1, col: d.col, code: d.code, message: d.message }));
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
  if (layout) entries.push(file("type-tests.ts", layout.source));
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
  const layout = req.typeTests ? typeTestsFile(req.typeTests) : null;
  const response: Omit<RunResponse, "timing"> = {};
  const code = Buffer.from(req.files[0].content, req.files[0].encoding === "base64" ? "base64" : "utf8").toString("utf8");
  if (req.forbid) response.forbid = scanHonesty(code, req.forbid);

  let started = Date.now();
  await job.load(WORK_DIR, workFiles(req, layout));
  time("loadMs", Date.now() - started);

  started = Date.now();
  const tsc = await job.step(COMPILE_CMD, { workDir: WORK_DIR, timeoutMs: limits.compileMs, maxBytes: limits.outputBytes });
  time("compileMs", Date.now() - started);
  const diagnostics = parseDiagnostics(tsc.stdout + tsc.stderr);
  // Type-test diagnostics belong to their cases. Everything else is main.ts's.
  const own = diagnostics.filter((d) => d.file !== "type-tests.ts");
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
    for (const [n, test] of req.tests.entries()) {
      response.results.push(failed ? skippedTest("compile", "main.ts didn't compile, so this test didn't run.") : await runTest(job, req, code, test, n));
    }
  }
  time("runMs", Date.now() - started);
  return response;
}

async function runTest(job: Job, req: RunRequest, code: string, test: TestSpec, n: number): Promise<TestResult> {
  const limits = SCRIPT_JOB;
  let workDir = WORK_DIR;
  if (test.tryIt !== undefined) {
    if (spliceTryIt(code, test.tryIt) === null) {
      const stderr = `This check calls your code after the line ${TRY_IT_MARKER}, and that line is gone. Put it back, then check again.\n`;
      return { ...skippedTest("compile", "The try it line is missing"), skipped: undefined, status: "XX", stderr, output: stderr };
    }
    workDir = `${WORK_DIR}/t${n + 1}`;
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
