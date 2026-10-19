import type { StepResult } from "../jobs.ts";

/**
 * What POST /v1/run answers (architecture §3.5). A Run, with no tests, is
 * Piston-shaped, `{ run, compile }`, so the app's runInSandbox, OutputPanel,
 * and CheckResults read it unchanged. A Check sends every test at once and
 * gets `{ compile, results }`, so tsc runs once however many tests there are.
 * The runner only reports what happened. lib/single-checks.mjs judges it,
 * with the same code for Check and the verifiers, honesty rules included.
 */

/** Piston's run object, plus `limit` when a sandbox limit stopped the step. */
export interface PistonRun {
  stdout: string;
  stderr: string;
  /** The exit code, or null when the program died on a signal. */
  code: number | null;
  signal: string | null;
  /** null on success, "RE" exit code, "SG" signal, "TO" time limit, "OL"/"EL" output limit, "XX" internal. */
  status: StepResult["status"];
  message: string | null;
  /** stdout and stderr in the order they were written. */
  output: string;
  /** Which limit stopped it: "time", "memory", "pids", "fsize", "output", or null. */
  limit: StepResult["limit"];
  wall_time: number;
}

export interface TestResult extends PistonRun {
  /** Contents of every path the test named in files, absent, or collect: null where no regular file is. */
  files: Record<string, string | null>;
  /** Whether anything (a file, folder, or link) exists at each of those paths. */
  exists: Record<string, boolean>;
  /** Paths whose contents were cut: `files` holds their first 1 MB, so they never match. Only when there are some. */
  truncated?: string[];
  /** Why the test didn't run: the compile failed, or the job ran out of time. */
  skipped?: "compile" | "deadline";
}

export interface Diagnostic {
  /** 1-based, relative to the case's own code for type tests. */
  line: number;
  col: number;
  code: string;
  message: string;
}

export interface TypeTestResult {
  name: string;
  expect: "ok" | "error";
  pass: boolean;
  diagnostics: Diagnostic[];
  /** Why it failed, for the learner. */
  message?: string;
}

export interface RunResponse {
  run?: PistonRun;
  compile?: PistonRun;
  results?: TestResult[];
  typeTests?: TypeTestResult[];
  timing: Timing;
}

export interface Timing {
  /** Waiting for a job slot. */
  queueMs: number;
  /** Creating and starting the container. */
  startMs: number;
  /** Loading the files (the first load, for Bash). */
  loadMs: number;
  compileMs: number;
  /** Every run step together. */
  runMs: number;
  /** From the request arriving to the answer, cleanup excluded. */
  totalMs: number;
}

export function pistonRun(step: StepResult): PistonRun {
  return {
    stdout: step.stdout,
    stderr: step.stderr,
    code: step.code,
    signal: step.signal,
    status: step.status,
    message: step.message,
    output: step.output,
    limit: step.limit,
    wall_time: step.wallMs,
  };
}

/** A test that never ran. */
export function skippedTest(reason: "compile" | "deadline", message: string): TestResult {
  return {
    stdout: "",
    stderr: "",
    code: null,
    signal: null,
    status: reason === "deadline" ? "TO" : null,
    message,
    output: "",
    limit: reason === "deadline" ? "time" : null,
    wall_time: 0,
    files: {},
    exists: {},
    skipped: reason,
  };
}

/** A test the runner couldn't run as written, with the reason on stderr. */
export function brokenTest(message: string, stderr: string): TestResult {
  return { ...skippedTest("compile", message), skipped: undefined, status: "XX", stderr, output: stderr };
}
