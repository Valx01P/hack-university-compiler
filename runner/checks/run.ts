import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Docker from "dockerode";
import { base32 } from "../../lib/workspace-id.mjs";
import type { Capacity } from "../capacity.ts";
import type { Owner } from "../docker.ts";
import { execCollect } from "../exec.ts";
import { HttpError } from "../http-util.ts";
import { isImageName, type Images } from "../images.ts";
import { Job, type JobPool } from "../jobs.ts";
import type { Log } from "../log.ts";
import type { JobLimits } from "../profiles.ts";
import { checkRel } from "../storage/host.ts";
import { launchTask, signalTask } from "../tasks.ts";
import { HttpThroughError, requestThrough } from "../tunnel.ts";
import type { Workspace } from "../workspaces.ts";
import { fill, jsonPath, matchJson } from "./match.ts";
import { CmdStep, HttpStep, ProcessStep, Suite, type HttpCall } from "./suite.ts";

/**
 * The check sandbox (architecture §7.2): a check never runs in the learner's
 * container. The files are copied (tar) into a fresh job container from the
 * suite's image, on a tmpfs /work, with the course's check limits and network
 * none. The suite's server starts there when a step needs one, then every
 * step runs in order (a failure never stops the next), each finished step
 * streams to the browser as a check event, and the container is removed.
 * Results follow §7.3.
 */

const MiB = 1024 * 1024;
const FIELD_CAP = 8 * 1024;
const RESULT_CAP = 256 * 1024;
const MAX_TESTS = 200;
const KEEP = 200;
const WORK = "/work";

export type TestStatus = "pass" | "fail" | "error" | "skip";

export interface TestResult {
  id: string;
  title: string;
  kind: string;
  status: TestStatus;
  message?: string;
  expected?: string;
  actual?: string;
  request?: { method: string; path: string; headers: Record<string, string>; body: string };
  response?: { status: number; headers: Record<string, string | string[]>; body: string };
  location?: { file: string; line: number; col?: number };
  ms: number;
}

export interface CheckResult {
  version: 1;
  checkId: string;
  workspace: string;
  target: Record<string, unknown>;
  status: "running" | "passed" | "failed" | "error" | "timeout";
  durationMs: number;
  tests: TestResult[];
  infra: { kind: "copy" | "image" | "server" | "timeout" | "crash"; message: string } | null;
  logs: { server?: string; build?: string };
}

export interface ChecksDeps {
  docker: Docker;
  owner: Owner;
  images: Images;
  pool: JobPool;
  log: Log;
  capacity: Capacity;
  contentDir: string;
}

const cap = (s: string, n = FIELD_CAP) => (s.length > n ? `${s.slice(0, n)}…` : s);

class Deadline extends Error {}

export class Checks {
  private readonly deps: ChecksDeps;
  private readonly results = new Map<string, CheckResult>();

  constructor(deps: ChecksDeps) {
    this.deps = deps;
  }

  get(checkId: string): CheckResult | undefined {
    return this.results.get(checkId);
  }

  private keep(result: CheckResult) {
    this.results.set(result.checkId, result);
    while (this.results.size > KEEP) this.results.delete(this.results.keys().next().value!);
  }

  /** Reads the suite, answers a check id at once, and runs the check in the background. */
  start(ws: Workspace, suitePath: string, target: Record<string, unknown>): string {
    const suiteDir = this.suiteDir(suitePath);
    let suite: Suite;
    try {
      suite = Suite.parse(JSON.parse(fs.readFileSync(path.join(suiteDir, "suite.json"), "utf8")));
    } catch (err) {
      throw new HttpError(400, "bad_request", `The suite ${suitePath} isn't valid: ${(err as Error).message.slice(0, 300)}`);
    }
    const checkId = `c${base32(randomBytes(7)).slice(0, 10)}`;
    const result: CheckResult = {
      version: 1,
      checkId,
      workspace: ws.id,
      target,
      status: "running",
      durationMs: 0,
      tests: [],
      infra: null,
      logs: {},
    };
    this.keep(result);
    ws.touch();
    void this.run(ws, suite, result).catch((err: Error) => {
      this.deps.log.error("check.failed", { checkId, error: err.message });
      result.infra = { kind: "crash", message: cap(err.message) };
      this.finish(ws, result, Date.now());
    });
    return checkId;
  }

  private suiteDir(suitePath: string): string {
    checkRel(suitePath);
    let real: string;
    try {
      real = fs.realpathSync(path.join(this.deps.contentDir, suitePath));
    } catch {
      throw new HttpError(404, "not_found", `There is no suite at ${suitePath}.`);
    }
    if (!real.startsWith(`${this.deps.contentDir}/`)) throw new HttpError(400, "bad_request", "The suite must be a folder of the content.");
    return real;
  }

  private emit(ws: Workspace, message: Record<string, unknown>) {
    ws.hub.emit({ t: "check", ...message });
  }

  private finish(ws: Workspace, result: CheckResult, started: number) {
    result.durationMs = Date.now() - started;
    if (result.status === "running") {
      result.status = result.infra ? "error" : result.tests.every((t) => t.status === "pass") ? "passed" : "failed";
    }
    // At most 256 KiB: drop the bulkiest fields first.
    while (JSON.stringify(result).length > RESULT_CAP) {
      const t = result.tests.find((x) => x.response || x.request || (x.actual?.length ?? 0) > 512);
      if (!t) break;
      delete t.response;
      delete t.request;
      if (t.actual) t.actual = cap(t.actual, 512);
    }
    ws.meta.lastCheck = { checkId: result.checkId, status: result.status, durationMs: result.durationMs, at: Date.now(), target: result.target };
    try {
      ws.saveMeta();
    } catch {
      /* the workspace was deleted meanwhile */
    }
    this.emit(ws, { checkId: result.checkId, phase: "done", result });
    this.deps.log.info("check.done", { checkId: result.checkId, workspace: ws.id, status: result.status, ms: result.durationMs });
  }

  private async run(ws: Workspace, suite: Suite, result: CheckResult) {
    const started = Date.now();
    const deadlineMs = suite.deadlineMs ?? 60_000;
    const imageName = suite.image ?? ws.meta.config.image ?? "";
    this.emit(ws, { checkId: result.checkId, phase: "copy" });
    if (!isImageName(imageName) || this.deps.images.state(imageName) !== "ready") {
      if (isImageName(imageName)) await this.deps.images.refresh();
      if (!isImageName(imageName) || this.deps.images.state(imageName) !== "ready") {
        result.infra = { kind: "image", message: `The ${imageName || ws.meta.course} sandbox isn't built yet. Prepare this course first.` };
        return this.finish(ws, result, started);
      }
    }
    let archive: Buffer;
    try {
      archive = await ws.archiveForCheck(suite.copy?.exclude ?? [], suite.copy?.git ?? false);
    } catch (err) {
      result.infra = { kind: "copy", message: cap((err as Error).message) };
      return this.finish(ws, result, started);
    }
    const limits = ws.limits;
    const release = await this.deps.capacity.admitCheck(limits.checkBytes);
    try {
      await this.deps.pool.run(async () => {
        const jobLimits: JobLimits = {
          memoryBytes: limits.checkBytes,
          cpus: Math.max(1, limits.cpus),
          pids: 512,
          workBytes: 512 * MiB,
          fsizeBytes: 512 * MiB,
          compileMs: 30_000,
          runMs: 30_000,
          outputBytes: MiB,
        };
        const leases = ws.leasedPorts();
        const portVar = suite.server?.port ?? "PORT";
        const port = leases[portVar] ?? 8080;
        const env = [
          ...Object.entries(ws.meta.config.env).map(([k, v]) => `${k}=${v}`),
          "HOME=/tmp",
          "npm_config_cache=/tmp/.npm",
          "TZ=UTC",
          "LANG=C.UTF-8",
          "HOST=0.0.0.0",
          `${portVar}=${port}`,
          "CI=1",
        ];
        const job = await Job.start(
          this.deps.docker,
          this.deps.owner,
          { image: this.deps.images.tag(imageName as never), recipe: "check", workDir: WORK, hostname: "workspace", env, limits: jobLimits, deadlineMs: deadlineMs + 15_000 },
          this.deps.log
        );
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          void job.kill("check deadline");
        }, deadlineMs);
        try {
          await job.loadTar(WORK, archive);
          const ctx = new Context(job.handle, suite, ws, env, port, () => timedOut);
          ctx.onServer = () => this.emit(ws, { checkId: result.checkId, phase: "server" });
          for (const step of suite.steps) {
            if (result.tests.length >= MAX_TESTS) break;
            const test = await this.step(ctx, step, suite).catch((err: Error): TestResult => ({
              id: step.id,
              title: suite.acceptance?.[step.id] ?? step.id,
              kind: step.kind,
              status: "error",
              message: timedOut ? `The check ran past ${Math.round(deadlineMs / 1000)} s.` : cap(err instanceof Deadline ? "The check ran out of time." : err.message),
              ms: 0,
            }));
            if (timedOut && test.status !== "pass") test.status = "error";
            result.tests.push(test);
            this.emit(ws, { checkId: result.checkId, phase: "tests", test });
            if (timedOut) break;
          }
          if (ctx.serverLog !== null || ctx.serverStarted) result.logs.server = await ctx.tail("server");
          if (ctx.serverFailed) result.infra = { kind: "server", message: ctx.serverFailed };
          if (timedOut) {
            result.status = "timeout";
            for (const step of suite.steps.slice(result.tests.length)) {
              result.tests.push({ id: step.id, title: suite.acceptance?.[step.id] ?? step.id, kind: step.kind, status: "skip", message: "The check ran out of time first.", ms: 0 });
            }
          }
        } finally {
          clearTimeout(timer);
          await job.dispose();
        }
      });
    } catch (err) {
      result.infra = { kind: "crash", message: cap((err as Error).message) };
    } finally {
      release();
    }
    this.finish(ws, result, started);
  }

  private async step(ctx: Context, raw: { id: string; kind: string }, suite: Suite): Promise<TestResult> {
    const title = suite.acceptance?.[raw.id] ?? raw.id;
    const base = { id: raw.id, title, kind: raw.kind };
    const t0 = Date.now();
    const done = (rest: Partial<TestResult> & { status: TestStatus }): TestResult => ({ ...base, ...rest, ms: Date.now() - t0 });
    if (raw.kind === "cmd") {
      const step = CmdStep.parse(raw);
      return done(await ctx.cmd(step));
    }
    if (raw.kind === "http") {
      const step = HttpStep.parse(raw);
      if (step.as) return done({ status: "error", message: "Steps that log in as a seed user (as) arrive with the databases in P2." });
      const ready = await ctx.ensureServer();
      if (ready) return done({ status: "error", message: ready });
      return done(await ctx.http(step.steps, {}));
    }
    if (raw.kind === "process") {
      const step = ProcessStep.parse(raw);
      return done(await ctx.process(step));
    }
    return done({ status: "error", message: `This check kind (${raw.kind}) isn't supported yet.` });
  }
}

/** One check's sandbox: its container, the suite, and the server it started. */
class Context {
  readonly container: Docker.Container;
  readonly suite: Suite;
  readonly ws: Workspace;
  readonly env: string[];
  readonly port: number;
  private readonly over: () => boolean;
  serverStarted = false;
  serverFailed: string | null = null;
  serverLog: string | null = null;
  private serverReady: Promise<string | null> | null = null;
  private launches = 0;
  /** Tells the browser the suite's server is starting (the check's "server" phase). */
  onServer: () => void = () => {};

  constructor(container: Docker.Container, suite: Suite, ws: Workspace, env: string[], port: number, over: () => boolean) {
    this.container = container;
    this.suite = suite;
    this.ws = ws;
    this.env = env;
    this.port = port;
    this.over = over;
  }

  /** The server command: the suite's own, or a task of the workspace's template. */
  private serverCmd(spec?: { task?: string; cmd?: string }): string | null {
    const s = spec ?? this.suite.server;
    if (s?.cmd) return s.cmd;
    const task = this.ws.meta.config.tasks[s?.task ?? "start"] ?? this.ws.meta.config.tasks.dev;
    return task?.cmd ?? null;
  }

  /** Starts the suite's server once, and waits for it to answer. Answers why not, or null when it's up. */
  ensureServer(): Promise<string | null> {
    this.serverReady ??= (async () => {
      const cmd = this.serverCmd();
      if (!cmd) return "The suite needs a server, and the template has no start task.";
      this.serverStarted = true;
      this.onServer();
      const why = await this.launch("server", cmd);
      if (why) this.serverFailed = why;
      return why;
    })();
    return this.serverReady;
  }

  /** Launches a server under `name` and waits until it answers its ready path. */
  private async launch(name: string, cmd: string): Promise<string | null> {
    this.launches++;
    await launchTask(this.container, name, cmd, this.env, WORK);
    const ready = this.suite.server?.ready;
    const until = Date.now() + (ready?.timeoutMs ?? 20_000);
    const readyPath = ready?.path ?? "/";
    while (Date.now() < until && !this.over()) {
      try {
        const res = await requestThrough(this.container, this.port, { method: "GET", path: readyPath, timeoutMs: 2_000, maxBytes: 64 * 1024 });
        if (res.status < 500) return null;
      } catch {
        /* not yet */
      }
      const state = await this.procState(name);
      if (state && !state.alive) {
        return `The server stopped before it answered (exit ${state.exit ?? "unknown"}). The end of its log:\n${await this.tail(name)}`;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return `The server didn't answer ${readyPath} on port ${this.port} within ${Math.round((ready?.timeoutMs ?? 20_000) / 1000)} s.`;
  }

  async procState(name: string): Promise<{ alive: boolean; exit: number | null } | null> {
    const r = await execCollect(
      this.container,
      ["sh", "-c", 'p=$(cat "/tmp/hu/proc/$1.pid" 2>/dev/null) || exit 0; a=0; kill -0 "$p" 2>/dev/null && a=1; echo "$a $(cat "/tmp/hu/proc/$1.exit" 2>/dev/null)"', "sh", name],
      { user: "learner", timeoutMs: 5_000 }
    ).catch(() => null);
    const out = r?.stdout.toString().trim();
    if (!out) return null;
    const [a, e] = out.split(" ");
    const exit = e !== undefined && e !== "" ? Number(e) : null;
    return { alive: a === "1" && exit === null, exit };
  }

  /** The last 200 lines of a launched process's log. */
  async tail(name: string): Promise<string> {
    const r = await execCollect(this.container, ["sh", "-c", 'tail -n 200 "/tmp/hu/proc/$1.log" 2>/dev/null; exit 0', "sh", name], {
      user: "learner",
      timeoutMs: 5_000,
      maxBytes: 64 * 1024,
    }).catch(() => null);
    return cap(r?.stdout.toString("utf8") ?? "", 16 * 1024);
  }

  async cmd(step: CmdStep): Promise<Partial<TestResult> & { status: TestStatus }> {
    const secs = Math.ceil((step.timeoutMs ?? 30_000) / 1000);
    const cwd = step.cwd ? path.posix.join(WORK, checkRel(step.cwd)) : WORK;
    const env = [...this.env, ...Object.entries(step.env ?? {}).map(([k, v]) => `${k}=${v}`)];
    const r = await execCollect(this.container, ["timeout", "-k", "2", String(secs), ...step.run], {
      user: "learner",
      workDir: cwd,
      env,
      timeoutMs: secs * 1000 + 5_000,
      maxBytes: MiB,
    });
    const stdout = r.stdout.toString("utf8");
    const stderr = r.stderr.toString("utf8");
    const location = step.parse === "tsc" ? tscLocation(stdout + stderr) : undefined;
    if (r.timedOut || r.code === 124) return { status: "fail", message: `It ran past ${secs} s and was stopped.`, actual: cap(stdout + stderr), location };
    const expect = step.expect ?? { exit: 0 };
    if (expect.exit !== undefined && r.code !== expect.exit) {
      return { status: "fail", message: `Exited with ${r.code}, expected ${expect.exit}`, expected: `exit ${expect.exit}`, actual: cap(`exit ${r.code}\n${stdout}${stderr}`), location };
    }
    if (expect.stdout !== undefined && stdout !== expect.stdout) {
      return { status: "fail", message: "The output differs", expected: cap(expect.stdout), actual: cap(stdout), location };
    }
    if (expect.stdoutIncludes !== undefined && !stdout.includes(expect.stdoutIncludes)) {
      return { status: "fail", message: "The output is missing what it should print", expected: cap(expect.stdoutIncludes), actual: cap(stdout), location };
    }
    if (expect.stdoutRegex !== undefined && !new RegExp(expect.stdoutRegex).test(stdout)) {
      return { status: "fail", message: "The output doesn't match", expected: cap(expect.stdoutRegex), actual: cap(stdout), location };
    }
    if (expect.stderrIncludes !== undefined && !stderr.includes(expect.stderrIncludes)) {
      return { status: "fail", message: "The error output is missing what it should print", expected: cap(expect.stderrIncludes), actual: cap(stderr), location };
    }
    return { status: "pass" };
  }

  /** One HTTP request through the sandbox's tunnel, with its expectations. */
  private async call(raw: HttpCall, saved: Record<string, unknown>): Promise<Partial<TestResult> & { status: TestStatus }> {
    const call = fill(raw, saved);
    const headers: Record<string, string> = { ...(call.headers ?? {}) };
    let body = call.body ?? "";
    if (call.json !== undefined) {
      body = JSON.stringify(call.json);
      if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["content-type"] = "application/json";
    }
    const request = { method: call.method, path: call.path, headers, body: cap(body) };
    let res;
    try {
      res = await requestThrough(this.container, this.port, { method: call.method, path: call.path, headers, body: body ? Buffer.from(body) : undefined, timeoutMs: 15_000 });
    } catch (err) {
      const message = err instanceof HttpThroughError ? err.message : (err as Error).message;
      return { status: "fail", message: `No answer: ${message}`, request };
    }
    const text = res.body.toString("utf8");
    const response = { status: res.status, headers: res.headers, body: cap(text) };
    const fail = (message: string, expected?: string, actual?: string) => ({ status: "fail" as const, message, expected, actual, request, response });
    const expect = call.expect ?? {};
    if (expect.status !== undefined && res.status !== expect.status) return fail(`Expected status ${expect.status}, got ${res.status}`, String(expect.status), String(res.status));
    for (const [name, want] of Object.entries(expect.headers ?? {})) {
      const got = res.headers[name.toLowerCase()];
      const value = Array.isArray(got) ? got.join(", ") : got;
      if (value === undefined || !value.includes(want)) return fail(`Expected header ${name} to include ${want}`, want, value ?? "(none)");
    }
    let json: unknown;
    const needsJson = expect.json !== undefined || expect.jsonExact !== undefined || Object.keys(call.save ?? {}).length > 0;
    if (needsJson) {
      try {
        json = JSON.parse(text);
      } catch {
        return fail("The answer isn't JSON", "JSON", cap(text, 512));
      }
    }
    if (expect.json !== undefined) {
      const why = matchJson(expect.json, json);
      if (why) return fail(why, cap(JSON.stringify(expect.json)), cap(text));
    }
    if (expect.jsonExact !== undefined) {
      const why = matchJson(expect.jsonExact, json, true);
      if (why) return fail(why, cap(JSON.stringify(expect.jsonExact)), cap(text));
    }
    if (expect.bodyIncludes !== undefined && !text.includes(expect.bodyIncludes)) return fail("The answer is missing what it should hold", expect.bodyIncludes, cap(text));
    for (const [name, expr] of Object.entries(call.save ?? {})) saved[name] = jsonPath(json, expr);
    return { status: "pass", request, response };
  }

  async http(calls: HttpCall[], saved: Record<string, unknown>): Promise<Partial<TestResult> & { status: TestStatus }> {
    let last: Partial<TestResult> & { status: TestStatus } = { status: "pass" };
    for (const call of calls) {
      last = await this.call(call, saved);
      if (last.status !== "pass") return last;
    }
    // A pass keeps only the last exchange, to stay small.
    return { status: "pass", request: last.request, response: last.response };
  }

  /** A script against a fresh server: requests, signals, waits, the exit, and the log. */
  async process(step: ProcessStep): Promise<Partial<TestResult> & { status: TestStatus }> {
    const cmd = this.serverCmd(step.server);
    if (!cmd) return { status: "error", message: "The step needs a server, and the template has no start task." };
    // The suite's own server would hold the port: stop it first.
    if (this.serverStarted) await signalTask(this.container, "server", "KILL").catch(() => {});
    this.serverReady = null;
    const name = `proc${this.launches}`;
    const why = await this.launch(name, cmd);
    if (why) return { status: "error", message: why };
    const pending = new Map<string, Promise<Partial<TestResult> & { status: TestStatus }>>();
    const saved: Record<string, unknown> = {};
    let n = 0;
    try {
      for (const raw of step.script) {
        const s = raw as ScriptStep;
        if (s.request) {
          const run = this.call(s.request, saved);
          if (s.async) pending.set(String(s.name ?? `request-${++n}`), run);
          else {
            const r = await run;
            if (r.status !== "pass") return r;
          }
        } else if (s.sleep !== undefined) {
          await new Promise((r) => setTimeout(r, s.sleep));
        } else if (s.signal) {
          await signalTask(this.container, name, s.signal);
        } else if (s.await !== undefined) {
          const names = typeof s.await === "string" ? [s.await] : [...pending.keys()];
          for (const key of names) {
            const r = await pending.get(key);
            pending.delete(key);
            if (r && r.status !== "pass") return r;
          }
        } else if (s.exit) {
          const within = s.exit.within ?? 5_000;
          const until = Date.now() + within;
          let state = await this.procState(name);
          while (state?.alive && Date.now() < until) {
            await new Promise((r) => setTimeout(r, 100));
            state = await this.procState(name);
          }
          if (state?.alive) return { status: "fail", message: `The server was still running ${within} ms later.` };
          if (s.exit.code !== undefined) {
            const raw = state?.exit ?? null;
            if (raw !== s.exit.code) return { status: "fail", message: `The server exited with ${raw ?? "a signal"}, expected ${s.exit.code}`, expected: String(s.exit.code), actual: String(raw) };
          }
        } else if (s.log) {
          const log = await this.tail(name);
          if (s.log.contains !== undefined && !log.includes(s.log.contains)) return { status: "fail", message: "The server's log is missing a line", expected: s.log.contains, actual: log };
          if (s.log.notContains !== undefined && log.includes(s.log.notContains)) return { status: "fail", message: "The server's log has a line it shouldn't", expected: `no ${s.log.notContains}`, actual: log };
        }
      }
      for (const [, run] of pending) {
        const r = await run;
        if (r.status !== "pass") return r;
      }
      return { status: "pass" };
    } finally {
      await signalTask(this.container, name, "KILL").catch(() => {});
    }
  }
}

/** One step of a process script, as suite.ts accepts it. */
interface ScriptStep {
  request?: HttpCall;
  async?: boolean;
  name?: string;
  sleep?: number;
  signal?: string;
  await?: string | boolean;
  exit?: { code?: number; within?: number };
  log?: { contains?: string; notContains?: string };
}

/** The first tsc diagnostic's file and line: "src/a.ts(12,7): error TS2322: …". */
export function tscLocation(output: string): { file: string; line: number; col: number } | undefined {
  const m = /^([^\s(][^(]*)\((\d+),(\d+)\): error TS\d+/m.exec(output);
  return m ? { file: m[1], line: Number(m[2]), col: Number(m[3]) } : undefined;
}
