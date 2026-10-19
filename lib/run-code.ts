import { SANDBOX_REFRESH_EVENT, isSql } from "@/lib/compiler";
import type { LessonTest, TypeTests } from "@/lib/learn-types";
import { splitArgs } from "@/lib/shell-words";
import { applyHarness } from "@/lib/snippet-harness.mjs";
import { filesToCollect, type Diagnostic } from "@/lib/single-checks.mjs";

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
  /** For a test that names files: each one's contents, or null when it
      doesn't exist. */
  files?: Record<string, string | null>;
}

export type RunState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; error: string }
  | ({ status: "done" } & RunResult);

export type RunOutcome = { ok: true; run: RunResult } | { ok: false; error: string };

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
  return Object.fromEntries(Object.entries(extras).filter(([, v]) => v !== undefined && v !== ""));
}

const UNREACHABLE = "Couldn't reach the compiler server. Make sure npm run dev is still running.";

/**
 * Runs a program in the local sandbox through /api/execute. Pass
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
    const res = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, code, stdin, ...defined(extras) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error ?? "The run failed. Try again." };
    const r = data.run ?? {};
    return {
      ok: true,
      run: {
        stdout: r.stdout ?? "",
        stderr: r.stderr ?? "",
        code: r.code ?? null,
        signal: r.signal ?? null,
        verdict: r.status ?? null,
        compileCode: r.compileCode ?? null,
        compileOutput: r.compileOutput ?? "",
      },
    };
  } catch {
    return { ok: false, error: UNREACHABLE };
  } finally {
    if (refreshStatus) refreshSandboxStatus();
  }
}

/** Each type-test case's diagnostics, in the order of the practice's cases. */
export type TypeTestRuns = { name: string; diagnostics: Diagnostic[] }[];

export type CheckOutcome = { ok: true; runs: RunResult[]; typeTests: TypeTestRuns } | { ok: false; error: string };

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
  let typeTestRuns: TypeTestRuns = [];
  try {
    for (const [g, program] of groups.entries()) {
      const members = tests.map((t, i) => i).filter((i) => programs[i] === program);
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          code: program,
          ...defined(extras),
          tests: members.map((i) => runnerTest(tests[i])),
          // The type tests compile against the program as written.
          ...(typeTests && g === 0 ? { typeTests } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data?.error ?? "The check failed. Try again." };
      if (!Array.isArray(data.results)) return { ok: false, error: "The sandbox didn't send back any test results. Try again." };
      members.forEach((i, k) => {
        const r = data.results[k] ?? {};
        runs[i] = {
          stdout: r.stdout ?? "",
          stderr: r.stderr ?? "",
          code: r.code ?? null,
          signal: r.signal ?? null,
          verdict: r.status ?? null,
          compileCode: data.compile?.code ?? null,
          compileOutput: data.compile?.output ?? "",
          ...(r.files ? { files: r.files } : {}),
        };
      });
      if (g === 0 && Array.isArray(data.typeTests)) typeTestRuns = data.typeTests;
    }
    return { ok: true, runs, typeTests: typeTestRuns };
  } catch {
    return { ok: false, error: UNREACHABLE };
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
