import { promises as fs, readFileSync } from "fs";
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

/** One file the program starts with (runner/schemas.ts FileEntry). */
export interface RunnerFile {
  name: string;
  content: string;
  encoding?: "utf8" | "base64";
  mode?: number;
  type?: "file" | "dir" | "symlink";
  target?: string;
}

/** What one test of a Check feeds the program, and what it reads back
    (runner/schemas.ts TestSpec). Its expectations ride along unjudged:
    lib/single-checks.mjs judges the results. */
export interface RunnerTest {
  stdin?: string;
  args?: string[];
  env?: Record<string, string>;
  clock?: string | null;
  fixtures?: string;
  cwd?: string;
  wrap?: string[];
  files?: Record<string, string>;
  absent?: string[];
  collect?: string[];
  tryIt?: string;
  output?: string;
  exitCode?: number;
  stderrIncludes?: string;
}

export interface RunnerRequest {
  /** The recipe: runner:<recipe> in content/courses.json. */
  recipe: string;
  files: RunnerFile[];
  stdin?: string;
  args?: string[];
  env?: Record<string, string>;
  clock?: string | null;
  /** The fixture set a Run starts in, by name, with every set it or a test names. */
  fixtures?: string;
  fixtureSets?: Record<string, RunnerFile[]>;
  /** Every test of a Check, run in one job (TypeScript compiles once). */
  tests?: RunnerTest[];
  typeTests?: { imports: string; cases: { name: string; expect: "ok" | "error"; errorCode?: string; code: string }[] };
  forbid?: string[];
}

/** A Check's report, as the runner sends it: the compile step, each test's
    run with what it found at the paths the test named (`files` has a
    regular file's contents, `exists` says whether anything is there), and
    type test and honesty verdicts. */
export interface TestsReport {
  compile?: { code: number | null; output: string; [key: string]: unknown } | null;
  results: {
    stdout: string;
    stderr: string;
    code: number | null;
    signal: string | null;
    status: string | null;
    files?: Record<string, string | null>;
    exists?: Record<string, boolean>;
    [key: string]: unknown;
  }[];
  typeTests?: unknown[];
  forbid?: unknown[];
  [key: string]: unknown;
}

type Json = Record<string, unknown> | null;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : null);
const strOrNull = (v: unknown) => (typeof v === "string" ? v : null);

/** What a refusal from the runner means for the learner. It answers
    `{error, message}`, where error is a code like docker_unavailable. */
function failure(status: number, data: Json, label: string): RunnerError {
  const code = str(data?.error);
  const message = str(data?.message);
  // The runner phrases Docker being off ("Start Docker to run this.") or
  // waking up itself.
  if (/docker/.test(code)) return new RunnerError(/docker/i.test(message) ? message : START_DOCKER, 503);
  if (/image/.test(code)) {
    return new RunnerError(
      /being built/i.test(message)
        ? `The ${label} sandbox is being built. Try again in a minute.`
        : `The ${label} sandbox isn't built yet. Run npm run up, then run again.`,
      503
    );
  }
  if (status === 401 || status === 403) {
    return new RunnerError("The runner didn't accept this app's token. Restart the app with npm run up.", 502);
  }
  if (status === 413) return new RunnerError("Code is too long.", 413);
  if (status === 429) return new RunnerError("The runner is busy. Try again in a moment.", 503);
  if (status === 503 && !message) return new RunnerError(START_DOCKER, 503);
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

/** A Run: one program, once, answered in Piston's shape. A failed compile
    is the run's result, as on Piston. */
export async function runOnRunner(body: RunnerRequest, label: string): Promise<RunResult> {
  const data = await post({ ...body, tests: undefined }, label);
  const run = (data?.run ?? {}) as Record<string, unknown>;
  const compile = (data?.compile ?? null) as Json;
  return {
    stdout: str(run.stdout),
    stderr: str(run.stderr),
    code: num(run.code),
    signal: strOrNull(run.signal),
    status: strOrNull(run.status),
    compileCode: compile ? num(compile.code) : null,
    compileOutput: compile ? str(compile.output) : "",
  };
}

/** A Check: every test in one job, answered with the runner's report. A
    failed compile leaves every test skipped. */
export async function testOnRunner(body: RunnerRequest & { tests: RunnerTest[] }, label: string): Promise<TestsReport> {
  const data = await post(body, label);
  if (!data || !Array.isArray(data.results)) throw new RunnerError("The runner didn't send back test results. Try again.", 502);
  return data as TestsReport;
}

const SET_NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;
// Fixture sets are a lesson's data files, small by design.
const SET_MAX_BYTES = 4 * 1024 * 1024;

/**
 * A course's fixture set, the files a program starts among
 * (content/fixtures/<course>/<name>/, or FIXTURES_CONTENT_DIR for drafts),
 * as the runner takes files: text as text, anything else base64, with
 * executable bits and symlinks kept. Null when there's no such set.
 */
export async function readFixtureSet(course: string, name: string): Promise<RunnerFile[] | null> {
  if (!SET_NAME.test(course) || !SET_NAME.test(name)) return null;
  const base = process.env.FIXTURES_CONTENT_DIR
    ? path.resolve(process.env.FIXTURES_CONTENT_DIR)
    : path.join(process.cwd(), "content", "fixtures");
  const root = path.join(base, course, name);
  const files: RunnerFile[] = [];
  let bytes = 0;
  async function walk(rel: string) {
    const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(root, relPath);
      if (entry.isSymbolicLink()) {
        files.push({ name: relPath, content: "", type: "symlink", target: await fs.readlink(full) });
      } else if (entry.isDirectory()) {
        files.push({ name: relPath, content: "", type: "dir" });
        await walk(relPath);
      } else if (entry.isFile()) {
        const [stat, data] = await Promise.all([fs.stat(full), fs.readFile(full)]);
        bytes += data.length;
        if (bytes > SET_MAX_BYTES) throw new RunnerError(`The fixture set ${name} is over 4 MB.`, 413);
        const text = !data.subarray(0, 8000).includes(0);
        files.push({
          name: relPath,
          content: data.toString(text ? "utf8" : "base64"),
          ...(text ? {} : { encoding: "base64" as const }),
          mode: stat.mode & 0o777,
        });
      }
    }
  }
  try {
    await walk("");
  } catch (err) {
    if (err instanceof RunnerError) throw err;
    return null;
  }
  return files;
}

export interface RunnerStatus {
  /** The runner answered. */
  online: boolean;
  /** Docker as the runner sees it. */
  docker: "ready" | "down" | "waking" | null;
  /** Each recipe's image: ready, missing, or building. */
  recipes: Record<string, string>;
}

/** Whether the runner is up, and what it says about Docker and its images. */
export async function runnerStatus(): Promise<RunnerStatus> {
  const offline: RunnerStatus = { online: false, docker: null, recipes: {} };
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
    const recipes = (data?.recipes ?? {}) as Record<string, Json>;
    return {
      online: true,
      docker: docker === "ready" || docker === "down" || docker === "waking" ? docker : null,
      recipes: Object.fromEntries(Object.entries(recipes).map(([id, r]) => [id, str(r?.state)])),
    };
  } catch {
    return offline;
  }
}
