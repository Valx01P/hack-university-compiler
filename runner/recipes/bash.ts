import path from "node:path";
import type { Job } from "../jobs.ts";
import { SCRIPT_JOB } from "../profiles.ts";
import type { FileEntry, RunRequest, TestSpec } from "../schemas.ts";
import type { TarEntry } from "../tar.ts";
import { pistonRun, skippedTest, type RunResponse, type TestResult } from "./types.ts";

/**
 * The bash recipe (architecture §4.1, outlines/bash.md §3 and §8): `bash
 * main.sh ARGS` on Bash 5.3, with stdin, environment variables, and the
 * lesson's fixture set around it, and the exit code, stderr, and any files the
 * script leaves read back.
 *
 * Every test starts from a fresh copy: the folder is emptied and the fixture
 * set and main.sh are extracted again. The folder is always the home folder,
 * /home/learner, so a Run and every test see the same `pwd` and `~`, and
 * outputs never depend on which test printed them. A frozen clock runs the
 * script under faketime.
 */

export const IMAGE = "bash";
export const HOME = "/home/learner";
export const HOSTNAME = "devbox";

export function baseEnv(): string[] {
  return [
    `HOME=${HOME}`,
    "USER=learner",
    "LOGNAME=learner",
    "SHELL=/bin/bash",
    "TZ=UTC",
    "LANG=C.UTF-8",
    "LC_ALL=C.UTF-8",
    "TERM=dumb",
    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  ];
}

/**
 * The command for one run: `bash main.sh ARGS`, inside the test's wrap
 * command, inside faketime when there's a clock. From a subfolder (cwd), the
 * script is ../main.sh, the way you'd type it standing there.
 */
export function bashCommand(opts: { args?: readonly string[]; cwd?: string; wrap?: readonly string[]; clock?: string | null }): string[] {
  const script = opts.cwd ? path.posix.join(path.posix.relative(`/${opts.cwd}`, "/"), "main.sh") : "main.sh";
  const cmd = [...(opts.wrap ?? []), "bash", script, ...(opts.args ?? [])];
  // faketime starts the clock at the given second and lets it tick, in this
  // process and every one it starts.
  if (opts.clock) cmd.unshift("faketime", `@${Math.floor(Date.parse(opts.clock) / 1000)}`);
  // A missing subfolder gets a plain answer, not a failed exec.
  if (opts.cwd) cmd.unshift("sh", "-c", CD_THEN_RUN, "sh", opts.cwd);
  return cmd;
}

const CD_THEN_RUN = 'cd -- "$1" 2>/dev/null || { echo "This test runs from the folder $1, which doesn\'t exist." >&2; exit 1; }; shift; exec "$@"';

/**
 * The environment for one run. With a clock, NO_FAKE_STAT keeps file times as
 * they are on disk: fixture files carry their own times, and `touch -d "3 days
 * ago"` lands exactly 3 days before the frozen now.
 */
export function bashEnv(env: Record<string, string> = {}, clock?: string | null): string[] {
  const vars = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  if (clock) vars.push(`HU_FIXED_TIME=${clock}`, "NO_FAKE_STAT=1", "FAKETIME_DONT_FAKE_MONOTONIC=1");
  return vars;
}

const seconds = (iso: string | null | undefined) => (iso ? Math.floor(Date.parse(iso) / 1000) : undefined);

function entry(f: FileEntry, clock: number | undefined): TarEntry {
  const type = f.type ?? "file";
  return {
    path: f.name,
    type,
    data: type === "file" ? Buffer.from(f.content, f.encoding === "base64" ? "base64" : "utf8") : undefined,
    mode: f.mode,
    target: f.target,
    mtime: seconds(f.mtime) ?? clock,
  };
}

/** The fixture set, then the program's files (so main.sh wins a name clash). */
export function homeFiles(req: RunRequest, fixtures: string | undefined, clock: string | null | undefined): TarEntry[] {
  const at = seconds(clock);
  const set = fixtures ? (req.fixtureSets?.[fixtures] ?? []) : [];
  return [...set.map((f) => entry(f, at)), ...req.files.map((f) => entry(f, at))];
}

/** Every path a test asks about: files it must leave, paths that must be gone, and extras. */
export function collectPaths(test: TestSpec): string[] {
  return [...new Set([...Object.keys(test.files ?? {}), ...(test.absent ?? []), ...(test.collect ?? [])])];
}

export async function runBash(job: Job, req: RunRequest, time: (key: "loadMs" | "runMs", ms: number) => void): Promise<Omit<RunResponse, "timing">> {
  const limits = SCRIPT_JOB;
  if (!req.tests) {
    let started = Date.now();
    await job.load(HOME, homeFiles(req, req.fixtures, req.clock));
    time("loadMs", Date.now() - started);
    started = Date.now();
    const step = await job.step(bashCommand({ args: req.args, clock: req.clock }), {
      workDir: HOME,
      env: bashEnv(req.env, req.clock),
      stdin: req.stdin ?? "",
      timeoutMs: limits.runMs,
      maxBytes: limits.outputBytes,
    });
    time("runMs", Date.now() - started);
    return { run: pistonRun(step) };
  }

  const results: TestResult[] = [];
  const started = Date.now();
  for (const [n, test] of req.tests.entries()) {
    if (job.dead) {
      results.push(skippedTest("deadline", "The check ran out of time before this test."));
      continue;
    }
    const clock = test.clock === undefined ? req.clock : test.clock;
    const loadStarted = Date.now();
    await job.load(HOME, homeFiles(req, test.fixtures ?? req.fixtures, clock), n > 0);
    if (n === 0) time("loadMs", Date.now() - loadStarted);
    const step = await job.step(bashCommand({ args: test.args, cwd: test.cwd, wrap: test.wrap, clock }), {
      workDir: HOME,
      env: bashEnv({ ...req.env, ...test.env }, clock),
      stdin: test.stdin ?? "",
      timeoutMs: limits.runMs,
      maxBytes: limits.outputBytes,
    });
    const result: TestResult = { ...pistonRun(step), files: {}, exists: {} };
    const paths = collectPaths(test);
    if (paths.length) {
      const found = await job.collect(HOME, paths);
      for (const [p, e] of found) {
        result.exists[p] = e !== null;
        result.files[p] = e?.type === "file" ? (e.data ?? Buffer.alloc(0)).toString("utf8") : null;
      }
    }
    results.push(result);
  }
  time("runMs", Date.now() - started);
  return { results };
}
