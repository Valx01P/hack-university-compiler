import { SANDBOX_REFRESH_EVENT, isSql } from "@/lib/compiler";
import type { LessonTest, TypeTests } from "@/lib/learn-types";
import { programForTest, type CheckReport } from "@/lib/single-checks.mjs";

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
}

export type RunState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; error: string }
  | ({ status: "done" } & RunResult);

export type RunOutcome = { ok: true; run: RunResult } | { ok: false; error: string };

/**
 * What a run gets besides its code and stdin, for programs the runner runs
 * (TypeScript, Bash, and the stack courses). Piston and PGlite runs never
 * set these, so their requests stay exactly what they were.
 */
export interface RunExtras {
  /** Where the program comes from, so the server can find its fixture
      files and setup in the content. */
  course?: string;
  lesson?: string;
  /** The part, counting from 1. */
  part?: number;
  args?: string[];
  env?: Record<string, string>;
  /** The fixture set the run starts in (content/fixtures/<course>/<name>). */
  fixtures?: string;
  cwd?: string;
  clock?: string;
  /** The lesson's own runtime, when it isn't the course's. */
  runtime?: string;
}

/** The extras that are set, so a request carries nothing it doesn't use. */
function defined(extras: RunExtras): RunExtras {
  return Object.fromEntries(Object.entries(extras).filter(([, v]) => v !== undefined && v !== ""));
}

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
    return {
      ok: false,
      error: "Couldn't reach the compiler server. Make sure npm run dev is still running.",
    };
  } finally {
    if (refreshStatus) refreshSandboxStatus();
  }
}

export type CheckOutcome = { ok: true; report: CheckReport } | { ok: false; error: string };

/**
 * Checks a practice on the runner in one request: the program is type-checked
 * (or compiled) once, then runs once per test, and the type tests compile
 * against it. A test that needs other code (a harness, or its own try-it
 * calls) sends that program with it. lib/single-checks.mjs judges the report.
 */
export async function checkInSandbox(
  language: string,
  code: string,
  { tests, typeTests, ...extras }: { tests: LessonTest[]; typeTests?: TypeTests } & RunExtras
): Promise<CheckOutcome> {
  const runs = tests.map(({ output: _output, harness: _harness, append: _append, tryIt: _tryIt, ...test }, i) => {
    const program = programForTest(code, tests[i]);
    return program !== null && program !== code ? { ...test, code: program } : test;
  });
  try {
    const res = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, code, stdin: "", ...defined(extras), tests: runs, ...(typeTests ? { typeTests } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error ?? "The check failed. Try again." };
    const report = data.check ?? data;
    if (!Array.isArray(report?.results)) return { ok: false, error: "The sandbox didn't send back test results. Try again." };
    return { ok: true, report };
  } catch {
    return {
      ok: false,
      error: "Couldn't reach the compiler server. Make sure npm run dev is still running.",
    };
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
