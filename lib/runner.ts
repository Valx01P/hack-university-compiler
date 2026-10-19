import { readFileSync } from "fs";
import os from "os";
import path from "path";
import type { RunResult } from "@/lib/piston";

/**
 * Server-side client for hu-runner, the local service that runs TypeScript,
 * Bash, and the stack courses, each run in a fresh container (runner/,
 * started by npm run up). Only the route handlers import this, and the
 * browser never talks to it for a run. It listens on 127.0.0.1
 * (HU_RUNNER_PORT, 3100 by default) and wants the bearer token npm run up
 * writes to ~/.hack-university/runner-token (HU_DATA_DIR moves that folder)
 * and hands this server as HU_RUNNER_TOKEN. Its answers have Piston's shape,
 * so a run from either reads the same.
 */

/** The runner is started with Docker, so either one being off reads the same. */
export const START_DOCKER = "Start Docker to run this.";

// The runner enforces each recipe's limits (TypeScript compiles for up to
// 30 s, every test runs for up to 10 s), so a request only has to outlast
// them, plus a Docker that's waking up.
const REQUEST_TIMEOUT_MS = 90_000;
const PER_TEST_MS = 10_000;

function runnerUrl(): string {
  const port = process.env.HU_RUNNER_PORT ?? "";
  return `http://127.0.0.1:${/^\d{1,5}$/.test(port) ? port : "3100"}`;
}

/** The token from the environment, or else the file npm run up wrote (read
    each time, since every npm run up makes a new one). */
function runnerToken(): string | null {
  if (process.env.HU_RUNNER_TOKEN) return process.env.HU_RUNNER_TOKEN;
  const dir = process.env.HU_DATA_DIR || path.join(os.homedir(), ".hack-university");
  try {
    return readFileSync(path.join(dir, "runner-token"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

/** A failure the UI shows as-is, plus the HTTP status to answer with. */
export class RunnerError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export interface RunnerTest {
  stdin?: string;
  args?: string[];
  /** Files to report on afterwards: what the test expects to exist or not. */
  collect?: string[];
}

export interface RunnerRequest {
  /** The recipe: runner:<recipe> in content/courses.json. */
  recipe: string;
  files: { name: string; content: string }[];
  stdin?: string;
  args?: string[];
  /** Every test of a Check, run in one job (TypeScript compiles once). */
  tests?: RunnerTest[];
  typeTests?: { imports: string; cases: { name: string; expect: "ok" | "error"; errorCode?: string; code: string }[] };
}

/** One test's run, as /api/execute answers a Check. */
export interface TestRun {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
  status: string | null;
  files?: Record<string, string | null>;
}

export interface TestsResult {
  compile: { code: number | null; output: string } | null;
  results: TestRun[];
  typeTests?: { name: string; diagnostics: { line: number; col: number; code: string; message: string }[] }[];
}

type Json = Record<string, unknown> | null;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : null);
const strOrNull = (v: unknown) => (typeof v === "string" ? v : null);

/** The error's code and words, from `{error, message}` or `{error: {code, message}}`. */
function errorOf(data: Json): { code: string; message: string } {
  const error = data?.error;
  const nested = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const code = str(data?.code) || str(nested?.code) || (typeof error === "string" && !/\s/.test(error) ? error : "");
  const message = str(data?.message) || str(nested?.message) || (typeof error === "string" && /\s/.test(error) ? error : "");
  return { code, message };
}

/** What a refusal from the runner means for the learner. */
function failure(status: number, data: Json, label: string): RunnerError {
  const { code, message } = errorOf(data);
  if (/docker/i.test(code) || (status === 503 && !message)) return new RunnerError(START_DOCKER, 503);
  if (/image/i.test(code)) return new RunnerError(`The ${label} sandbox isn't built yet. npm run up builds it, then run again.`, 503);
  if (status === 401 || status === 403) {
    return new RunnerError("The runner didn't accept this app's token. Restart the app with npm run up.", 502);
  }
  if (status === 413) return new RunnerError("Code is too long.", 413);
  if (status === 429) return new RunnerError("The runner is busy. Try again in a moment.", 503);
  return new RunnerError(message || `The runner returned an error (${status}).`, status >= 400 && status < 500 ? 400 : 502);
}

async function post(body: RunnerRequest, label: string): Promise<Json> {
  const token = runnerToken();
  // No token means npm run up hasn't run, so neither has the runner.
  if (!token) throw new RunnerError(START_DOCKER, 503);
  let res: Response;
  try {
    res = await fetch(`${runnerUrl()}/v1/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS + (body.tests?.length ?? 0) * PER_TEST_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new RunnerError("The sandbox took too long to answer. Try again.", 504);
    }
    // Nothing answers on the runner's port.
    throw new RunnerError(START_DOCKER, 503);
  }
  const data = (await res.json().catch(() => null)) as Json;
  if (!res.ok) throw failure(res.status, data, label);
  return data;
}

function compileOf(data: Json): TestsResult["compile"] {
  const compile = data?.compile as Json;
  return compile ? { code: num(compile.code), output: str(compile.output) } : null;
}

/** A Run: one program, once, answered in Piston's shape. */
export async function runOnRunner(body: RunnerRequest, label: string): Promise<RunResult> {
  const data = await post({ ...body, tests: undefined }, label);
  const run = (data?.run ?? {}) as Record<string, unknown>;
  const compile = compileOf(data);
  return {
    stdout: str(run.stdout),
    stderr: str(run.stderr),
    code: num(run.code),
    signal: strOrNull(run.signal),
    status: strOrNull(run.status),
    compileCode: compile ? compile.code : null,
    compileOutput: compile?.output ?? "",
  };
}

/** A Check: every test in one job. A failed compile answers no results. */
export async function testOnRunner(body: RunnerRequest & { tests: RunnerTest[] }, label: string): Promise<TestsResult> {
  const data = await post(body, label);
  const results = Array.isArray(data?.results) ? (data.results as Record<string, unknown>[]) : [];
  return {
    compile: compileOf(data),
    results: results.map((r) => ({
      stdout: str(r.stdout),
      stderr: str(r.stderr),
      code: num(r.code),
      signal: strOrNull(r.signal),
      status: strOrNull(r.status),
      ...(r.files && typeof r.files === "object" ? { files: r.files as Record<string, string | null> } : {}),
    })),
    ...(Array.isArray(data?.typeTests) ? { typeTests: data.typeTests as TestsResult["typeTests"] } : {}),
  };
}

export interface RunnerStatus {
  /** The runner answered. */
  online: boolean;
  /** Docker as the runner sees it. */
  docker: "ready" | "down" | "waking" | null;
  /** Each hu/* image: ready, missing, or building. */
  images: Record<string, string>;
}

/** Whether the runner is up, and what it says about Docker and its images. */
export async function runnerStatus(): Promise<RunnerStatus> {
  const offline: RunnerStatus = { online: false, docker: null, images: {} };
  const token = runnerToken();
  if (!token) return offline;
  try {
    const res = await fetch(`${runnerUrl()}/v1/health`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });
    if (!res.ok) return offline;
    const data = (await res.json()) as Json;
    const docker = str((data?.docker as Json)?.state);
    return {
      online: true,
      docker: docker === "ready" || docker === "down" || docker === "waking" ? docker : null,
      images: data?.images && typeof data.images === "object" ? (data.images as Record<string, string>) : {},
    };
  } catch {
    return offline;
  }
}
