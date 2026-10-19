import { SANDBOX_REFRESH_EVENT, isSql, onRunner } from "@/lib/compiler";

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

/** What one test feeds a program. */
export interface TestInput {
  stdin?: string;
  /** Command-line arguments (Bash). */
  args?: string[];
  /** Files to report on afterwards (lib/single-checks.mjs filesToCollect). */
  collect?: string[];
}

export type TestsOutcome = { ok: true; runs: RunResult[] } | { ok: false; error: string };

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
  { refreshStatus = true, args }: { refreshStatus?: boolean; args?: string[] } = {}
): Promise<RunOutcome> {
  // SQL runs on PostgreSQL right in the browser, and its "stdin" is the setup
  // SQL that runs first (the tables and rows the script works on).
  if (isSql(language)) return runSqlInBrowser(code, stdin);
  try {
    const sent = await postExecute({ language, code, stdin, ...(args?.length ? { args } : {}) });
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
      };
    });
    return { ok: true, runs };
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
