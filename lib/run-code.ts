import { SANDBOX_REFRESH_EVENT, isSql, onRunner } from "@/lib/compiler";
import type { LessonTest, TypeTests } from "@/lib/learn-types";
import { splitArgs } from "@/lib/shell-words";
import { applyHarness } from "@/lib/snippet-harness.mjs";
import { filesToCollect, type TypeTestReport } from "@/lib/single-checks.mjs";

/** How outputs are compared (lib/single-checks.mjs, shared with the
    verifiers): trailing spaces on a line and trailing blank lines don't
    count. */
export { normalizeOutput } from "@/lib/single-checks.mjs";

/** One finished run, as /api/execute reports it. */
export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
  /** The sandbox's verdict: "TO" timed out, "OL"/"EL" output too large. */
  verdict: string | null;
  compileCode: number | null;
  compileOutput: string;
  /** For a test that names paths: each regular file's contents, or null
      for anything else (nothing there, a folder, a link). */
  files?: Record<string, string | null>;
  /** For the same paths: whether anything at all is there. */
  exists?: Record<string, boolean>;
  /** The paths whose contents were cut off at the sandbox's cap. */
  truncated?: string[];
}

export type RunState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; error: string }
  | ({ status: "done" } & RunResult);

export type RunOutcome = { ok: true; run: RunResult } | { ok: false; error: string };

/** What one test feeds a program. */
export interface TestInput {
  stdin?: string;
  /** Command-line arguments (Bash). */
  args?: string[];
  /** Paths to report on afterwards (lib/single-checks.mjs filesToCollect). */
  collect?: string[];
}

export type TestsOutcome = { ok: true; runs: RunResult[] } | { ok: false; error: string };

/**
 * What a run gets besides its code and stdin, on the runner (TypeScript,
 * Bash, and the stack courses): command-line arguments, environment
 * variables, the fixture set it starts in (content/fixtures/<course>/<name>),
 * and a frozen clock. Piston and PGlite runs never set these, so their
 * requests stay what they were.
 */
export interface RunExtras {
  args?: string[];
  env?: Record<string, string>;
  fixtures?: string;
  clock?: string;
}

/** The extras that are set, so a request carries nothing it doesn't use. */
function defined(extras: RunExtras): RunExtras {
  return Object.fromEntries(
    Object.entries(extras).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
  );
}

const UNREACHABLE = "Couldn't reach the compiler server. Make sure npm run dev is still running.";

// Every write to the API carries X-HU (lib/local-request.ts).
async function postExecute(body: Record<string, unknown>): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-HU": "1" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error ?? "The run failed. Try again." };
    return { ok: true, data };
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

/**
 * Runs a program in the local sandbox through /api/execute: Piston, or the
 * runner for TypeScript and Bash, which answer the same way. Pass
 * `refreshStatus: false` when firing several runs at once (practice checks),
 * then refresh the sandbox badge once yourself.
 */
export async function runInSandbox(
  language: string,
  code: string,
  stdin: string,
  { refreshStatus = true, ...extras }: { refreshStatus?: boolean } & RunExtras = {}
): Promise<RunOutcome> {
  // SQL runs on PostgreSQL right in the browser, and its "stdin" is the setup
  // SQL that runs first (the tables and rows the script works on).
  if (isSql(language)) return runSqlInBrowser(code, stdin);
  try {
    const sent = await postExecute({ language, code, stdin, ...defined(extras) });
    if (!sent.ok) return sent;
    const r = (sent.data.run ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      run: {
        stdout: (r.stdout as string) ?? "",
        stderr: (r.stderr as string) ?? "",
        code: (r.code as number) ?? null,
        signal: (r.signal as string) ?? null,
        verdict: (r.status as string) ?? null,
        compileCode: (r.compileCode as number) ?? null,
        compileOutput: (r.compileOutput as string) ?? "",
      },
    };
  } finally {
    if (refreshStatus) refreshSandboxStatus();
  }
}

/**
 * Runs a program once per test, for a Check. The courses on the runner send
 * every test in one request, so TypeScript type-checks once however many
 * tests there are. The rest send one request per test at once, as they
 * always have. A compile error comes back on every test's run.
 */
export async function runTests(language: string, code: string, tests: TestInput[]): Promise<TestsOutcome> {
  try {
    if (!onRunner(language)) {
      const outcomes = await Promise.all(
        tests.map((t) => runInSandbox(language, code, t.stdin ?? "", { refreshStatus: false, args: t.args }))
      );
      const runs: RunResult[] = [];
      for (const o of outcomes) {
        if (!o.ok) return o;
        runs.push(o.run);
      }
      return { ok: true, runs };
    }
    const sent = await postExecute({ language, code, tests });
    if (!sent.ok) return sent;
    const compile = (sent.data.compile ?? null) as { code: number | null; output: string } | null;
    const compileCode = compile?.code ?? null;
    const compileOutput = compile?.output ?? "";
    const results = Array.isArray(sent.data.results) ? (sent.data.results as Record<string, unknown>[]) : [];
    const runs = tests.map((_, i): RunResult => {
      const r = results[i] ?? {};
      return {
        stdout: (r.stdout as string) ?? "",
        stderr: (r.stderr as string) ?? "",
        code: (r.code as number) ?? null,
        signal: (r.signal as string) ?? null,
        verdict: (r.status as string) ?? null,
        compileCode,
        compileOutput,
        ...(r.files ? { files: r.files as Record<string, string | null> } : {}),
        ...(r.exists ? { exists: r.exists as Record<string, boolean> } : {}),
        ...(Array.isArray(r.truncated) ? { truncated: r.truncated as string[] } : {}),
      };
    });
    return { ok: true, runs };
  } finally {
    refreshSandboxStatus();
  }
}

export type CheckOutcome = { ok: true; runs: RunResult[]; typeTests: TypeTestReport[] } | { ok: false; error: string };

// What a test can carry to the runner (runner/schemas.ts TestSpec).
const TEST_FIELDS = ["stdin", "args", "env", "clock", "fixtures", "cwd", "wrap", "files", "absent", "tryIt", "output", "exitCode", "stderrIncludes"] as const;

/** A test as the runner takes it, with the files it looks at afterwards to
    `collect`. A wrap written as a command line goes as its words. */
function runnerTest(test: LessonTest): Record<string, unknown> {
  const out: Record<string, unknown> = Object.fromEntries(TEST_FIELDS.filter((k) => test[k] !== undefined).map((k) => [k, test[k]]));
  if (typeof test.wrap === "string") out.wrap = splitArgs(test.wrap);
  const collect = filesToCollect(test);
  if (collect.length) out.collect = collect;
  return out;
}

/**
 * Checks a practice on the runner: one request for every test, so the
 * program compiles (TypeScript type-checks) once however many tests there
 * are, and its type tests compile with it. A test with a hidden harness (or
 * `append`) runs its own program, so it goes in a request with the others
 * that share it. A failed compile comes back on each of that request's runs,
 * like a Piston compile error. lib/single-checks.mjs judges the runs.
 */
export async function checkInSandbox(
  language: string,
  code: string,
  { tests, typeTests, ...extras }: { tests: LessonTest[]; typeTests?: TypeTests } & RunExtras
): Promise<CheckOutcome> {
  const programs = tests.map((t) =>
    t.harness != null ? applyHarness(t.harness, code) : t.append != null ? applyHarness(`{{code}}\n${t.append}`, code) : code
  );
  const groups = [...new Set(programs)].sort((a, b) => Number(b === code) - Number(a === code));
  const runs: RunResult[] = [];
  let typeTestReports: TypeTestReport[] = [];
  try {
    for (const [g, program] of groups.entries()) {
      const members = tests.map((t, i) => i).filter((i) => programs[i] === program);
      const sent = await postExecute({
        language,
        code: program,
        ...defined(extras),
        tests: members.map((i) => runnerTest(tests[i])),
        // The type tests compile against the program as written.
        ...(typeTests && g === 0 ? { typeTests } : {}),
      });
      if (!sent.ok) return sent;
      const data = sent.data as {
        results?: Record<string, unknown>[];
        compile?: { code: number | null; output: string } | null;
        typeTests?: TypeTestReport[];
      };
      if (!Array.isArray(data.results)) return { ok: false, error: "The sandbox didn't send back any test results. Try again." };
      const results = data.results;
      members.forEach((i, k) => {
        const r = results[k] ?? {};
        runs[i] = {
          stdout: (r.stdout as string) ?? "",
          stderr: (r.stderr as string) ?? "",
          code: (r.code as number) ?? null,
          signal: (r.signal as string) ?? null,
          verdict: (r.status as string) ?? null,
          compileCode: data.compile?.code ?? null,
          compileOutput: data.compile?.output ?? "",
          ...(r.files ? { files: r.files as Record<string, string | null> } : {}),
          ...(r.exists ? { exists: r.exists as Record<string, boolean> } : {}),
          ...(Array.isArray(r.truncated) ? { truncated: r.truncated as string[] } : {}),
        };
      });
      if (g === 0 && Array.isArray(data.typeTests)) typeTestReports = data.typeTests;
    }
    return { ok: true, runs, typeTests: typeTestReports };
  } finally {
    refreshSandboxStatus();
  }
}

async function runSqlInBrowser(code: string, setup: string): Promise<RunOutcome> {
  try {
    const { runSqlScript } = await import("@/lib/sql/browser");
    const r = await runSqlScript(code, setup);
    return {
      ok: true,
      run: { stdout: r.stdout, stderr: r.stderr, code: r.failed ? 1 : 0, signal: null, verdict: null, compileCode: null, compileOutput: "" },
    };
  } catch (err) {
    return { ok: false, error: `Couldn't start the SQL database: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Ask the sandbox badge to re-check (a failed run is often the first sign
    the sandbox stopped or a runtime is missing). */
export function refreshSandboxStatus() {
  window.dispatchEvent(new Event(SANDBOX_REFRESH_EVENT));
}
