import { SANDBOX_REFRESH_EVENT, isSql } from "@/lib/compiler";

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
 * Runs a program in the local sandbox through /api/execute. Pass
 * `refreshStatus: false` when firing several runs at once (practice checks),
 * then refresh the sandbox badge once yourself.
 */
export async function runInSandbox(
  language: string,
  code: string,
  stdin: string,
  { refreshStatus = true }: { refreshStatus?: boolean } = {}
): Promise<RunOutcome> {
  // SQL runs on PostgreSQL right in the browser, and its "stdin" is the setup
  // SQL that runs first (the tables and rows the script works on).
  if (isSql(language)) return runSqlInBrowser(code, stdin);
  try {
    const res = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, code, stdin }),
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

/** How outputs are compared (same rule as scripts/verify-lessons.mjs):
    trailing spaces on a line and trailing blank lines don't count. */
export function normalizeOutput(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}
