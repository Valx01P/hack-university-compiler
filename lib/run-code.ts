import { SANDBOX_REFRESH_EVENT, isSql } from "@/lib/compiler";
import type { LessonTest, TypeTests } from "@/lib/learn-types";
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

/**
 * Checks a practice on the runner in one request, so the program compiles
 * (TypeScript type-checks) once however many tests there are, and its type
 * tests compile with it. Each test goes as written, with the files it looks
 * at afterwards to `collect`. A failed compile comes back on every test's
 * run, like a Piston compile error. lib/single-checks.mjs judges the runs.
 */
export async function checkInSandbox(
  language: string,
  code: string,
  { tests, typeTests, ...extras }: { tests: LessonTest[]; typeTests?: TypeTests } & RunExtras
): Promise<CheckOutcome> {
  try {
    const res = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language,
        code,
        ...defined(extras),
        tests: tests.map((t) => {
          const collect = filesToCollect(t);
          return collect.length ? { ...t, collect } : t;
        }),
        ...(typeTests ? { typeTests } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error ?? "The check failed. Try again." };
    if (!Array.isArray(data.results)) return { ok: false, error: "The sandbox didn't send back any test results. Try again." };
    const compileCode = data.compile?.code ?? null;
    const compileOutput = data.compile?.output ?? "";
    const runs = tests.map((_, i): RunResult => {
      const r = data.results[i] ?? {};
      return {
        stdout: r.stdout ?? "",
        stderr: r.stderr ?? "",
        code: r.code ?? null,
        signal: r.signal ?? null,
        verdict: r.status ?? null,
        compileCode,
        compileOutput,
        ...(r.files ? { files: r.files } : {}),
      };
    });
    return { ok: true, runs, typeTests: Array.isArray(data.typeTests) ? data.typeTests : [] };
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

/** Splits an Arguments field into arguments the way a shell would: spaces
    separate them, and quotes or a backslash keep spaces inside one.
    Nothing is expanded. */
export function splitArgs(text: string): string[] {
  const args: string[] = [];
  let current = "";
  let started = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && /["\\$`]/.test(text[i + 1] ?? "")) current += text[++i];
      else current += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      started = true;
    } else if (c === "\\" && i + 1 < text.length) {
      current += text[++i];
      started = true;
    } else if (/\s/.test(c)) {
      if (started) args.push(current);
      current = "";
      started = false;
    } else {
      current += c;
      started = true;
    }
  }
  if (started) args.push(current);
  return args;
}

/** Arguments written back as an Arguments field would take them: quoted
    where they hold spaces or quotes. */
export function joinArgs(args: readonly string[]): string {
  return args.map((a) => (a && !/[\s"'\\]/.test(a) ? a : `'${a.replace(/'/g, `'"'"'`)}'`)).join(" ");
}
