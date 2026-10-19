import { randomUUID } from "node:crypto";
import type { Duplex } from "node:stream";
import type Docker from "dockerode";
import { LABEL, labelsFor, namePrefix, type Owner } from "./docker.ts";
import type { Log } from "./log.ts";
import { jobProfile, type JobLimits } from "./profiles.ts";
import { packTar, unpackTar, type TarEntry } from "./tar.ts";

/**
 * The job primitive (architecture §4.1): one fresh container per run, check,
 * or verifier step.
 *
 * 1. Create hu-job-<uuid> from the recipe's image with the job profile.
 * 2. Start it: hu-exec --idle under tini.
 * 3. Load files with an exec of `tar -x`, fed on stdin.
 * 4. Run steps as execs through hu-exec, each with its own deadline. Output is
 *    capped at 1 MB per stream, with Piston's verdicts (TO, OL, EL).
 * 5. Collect files, then kill and remove the container.
 *
 * Jobs share a pool of slots (4 by default) with a FIFO queue.
 */

export class JobPool {
  readonly slots: number;
  private running = 0;
  private readonly queue: { start: () => void; signal?: AbortSignal }[] = [];

  constructor(slots: number) {
    this.slots = slots;
  }

  get stats(): { running: number; queued: number } {
    return { running: this.running, queued: this.queue.length };
  }

  /** Runs `fn` when a slot is free, in arrival order. */
  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.running >= this.slots) {
      await new Promise<void>((resolve, reject) => {
        const entry = { start: resolve, signal };
        this.queue.push(entry);
        signal?.addEventListener(
          "abort",
          () => {
            const at = this.queue.indexOf(entry);
            if (at >= 0) this.queue.splice(at, 1);
            reject(new JobError("cancelled", "The run was cancelled."));
          },
          { once: true }
        );
      });
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      this.queue.shift()?.start();
    }
  }
}

export type JobErrorCode = "docker_unavailable" | "image_missing" | "cancelled" | "job_failed";

export class JobError extends Error {
  readonly code: JobErrorCode;
  constructor(code: JobErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** How one step ended, in Piston's terms plus what hu-exec reported. */
export interface StepResult {
  stdout: string;
  stderr: string;
  /** stdout and stderr interleaved in the order they arrived, like Piston's `output`. */
  output: string;
  /** The exit code, or null when the step died on a signal. */
  code: number | null;
  /** The signal that ended it, as a name ("SIGKILL"), or null. */
  signal: string | null;
  /** Piston's verdict: null on success, "RE" exit code, "SG" signal, "TO" time, "OL"/"EL" output, "XX" internal. */
  status: "RE" | "SG" | "TO" | "OL" | "EL" | "XX" | null;
  /** Piston's message, like "Exited with error status 3". */
  message: string | null;
  /** Which limit stopped it, when one did. */
  limit: "time" | "memory" | "pids" | "fsize" | "output" | null;
  wallMs: number;
}

export interface StepOptions {
  env?: string[];
  workDir?: string;
  stdin?: Buffer | string;
  /** The step's deadline, which hu-exec enforces inside the container. */
  timeoutMs: number;
  /** The cap on each of stdout and stderr. */
  maxBytes: number;
}

const SIGNALS: Record<number, string> = {
  1: "SIGHUP", 2: "SIGINT", 3: "SIGQUIT", 4: "SIGILL", 5: "SIGTRAP", 6: "SIGABRT", 7: "SIGBUS", 8: "SIGFPE",
  9: "SIGKILL", 10: "SIGUSR1", 11: "SIGSEGV", 12: "SIGUSR2", 13: "SIGPIPE", 14: "SIGALRM", 15: "SIGTERM",
  24: "SIGXCPU", 25: "SIGXFSZ", 31: "SIGSYS",
};

export const signalName = (n: number): string => SIGNALS[n] ?? `SIG${n}`;

/** The status line hu-exec appends to stderr (docker/shared/hu-exec.c). */
const TRAILER = /\0hu-exec code=(-?\d+) signal=(\d+) timeout=([01]) oom=(-?\d+) pids=(-?\d+) ms=(\d+)\n?$/;

export interface Trailer {
  code: number;
  signal: number;
  timedOut: boolean;
  oom: boolean;
  pids: boolean;
  ms: number;
}

/** Splits hu-exec's status line off the end of stderr. */
export function splitTrailer(stderr: Buffer): { stderr: Buffer; trailer: Trailer | null } {
  const at = stderr.lastIndexOf("\0hu-exec ");
  if (at < 0) return { stderr, trailer: null };
  const match = TRAILER.exec(stderr.subarray(at).toString("latin1"));
  if (!match) return { stderr, trailer: null };
  return {
    stderr: stderr.subarray(0, at),
    trailer: {
      code: Number(match[1]),
      signal: Number(match[2]),
      timedOut: match[3] === "1",
      oom: Number(match[4]) > 0,
      pids: Number(match[5]) > 0,
      ms: Number(match[6]),
    },
  };
}

/** Docker's multiplexed exec stream: 8-byte headers (stream, 0, 0, 0, size) then the bytes. */
export class Demux {
  private pending: Buffer = Buffer.alloc(0);
  private readonly onFrame: (stream: 1 | 2, data: Buffer) => void;

  constructor(onFrame: (stream: 1 | 2, data: Buffer) => void) {
    this.onFrame = onFrame;
  }

  push(chunk: Buffer) {
    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
    while (this.pending.length >= 8) {
      const size = this.pending.readUInt32BE(4);
      if (this.pending.length < 8 + size) break;
      const type = this.pending[0];
      const data = this.pending.subarray(8, 8 + size);
      this.pending = this.pending.subarray(8 + size);
      if (type === 1 || type === 2) this.onFrame(type, data);
    }
  }
}

export interface JobSpec {
  image: string;
  recipe: string;
  workDir: string;
  hostname: string;
  env: string[];
  limits: JobLimits;
  /** How long the whole job may take before its container is killed. */
  deadlineMs: number;
}

/** One running job container. Make it with Job.start, and always dispose it. */
export class Job {
  readonly id: string;
  readonly name: string;
  readonly spec: JobSpec;
  private readonly container: Docker.Container;
  private readonly log: Log;
  private killed = false;
  private readonly deadline: NodeJS.Timeout;
  /** Milliseconds spent creating and starting the container. */
  startMs = 0;

  private constructor(container: Docker.Container, spec: JobSpec, name: string, log: Log) {
    this.container = container;
    this.spec = spec;
    this.name = name;
    this.id = container.id;
    this.log = log;
    // The last line of defense: past its deadline the container goes,
    // whatever the steps are doing.
    this.deadline = setTimeout(() => void this.kill("deadline"), spec.deadlineMs);
    this.deadline.unref();
  }

  static async start(docker: Docker, owner: Owner, spec: JobSpec, log: Log): Promise<Job> {
    const started = Date.now();
    const name = `${namePrefix(owner.ns)}-job-${randomUUID()}`;
    const labels = labelsFor(owner, "job", {
      [LABEL.recipe]: spec.recipe,
      // The reaper removes any job 10 s past this, even one from another runner.
      [LABEL.expires]: String(Date.now() + spec.deadlineMs),
    });
    let container: Docker.Container;
    try {
      container = await docker.createContainer(
        jobProfile({ name, image: spec.image, labels, workDir: spec.workDir, hostname: spec.hostname, env: spec.env, limits: spec.limits })
      );
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) {
        throw new JobError("image_missing", `The image ${spec.image} isn't built yet.`);
      }
      throw err;
    }
    const job = new Job(container, spec, name, log);
    try {
      await container.start();
    } catch (err) {
      await job.dispose();
      throw err;
    }
    job.startMs = Date.now() - started;
    return job;
  }

  /** Extracts files into a folder with `tar -x`, fed on stdin. */
  async load(dir: string, entries: TarEntry[], reset = false): Promise<void> {
    // A reset first empties the folder (making even unreadable leftovers
    // readable), so each test starts from exactly its fixture set.
    const script = reset
      ? 'cd "$1" || exit 1; chmod -R u+rwX . 2>/dev/null; find . -mindepth 1 -delete; exec tar -xpf -'
      : 'cd "$1" || exit 1; exec tar -xpf -';
    const result = await this.step(["sh", "-c", script, "sh", dir], {
      stdin: packTar(entries),
      timeoutMs: 10_000,
      maxBytes: 64 * 1024,
    });
    if (result.code !== 0) {
      throw new JobError("job_failed", `Couldn't load the files into the sandbox: ${result.stderr.trim() || result.message}`);
    }
  }

  /** Reads entries back out of the container: null for each path where nothing exists. */
  async collect(dir: string, paths: string[], maxBytes = 1024 * 1024): Promise<Map<string, TarEntry | null>> {
    const found = new Map<string, TarEntry | null>(paths.map((p) => [p, null]));
    if (!paths.length) return found;
    const result = await this.step(
      ["tar", "-cf", "-", "--format=pax", "--no-recursion", "--ignore-failed-read", "-C", dir, "--", ...paths],
      { timeoutMs: 10_000, maxBytes, raw: true }
    );
    for (const entry of unpackTar(result.raw ?? Buffer.alloc(0))) if (found.has(entry.path)) found.set(entry.path, entry);
    return found;
  }

  /**
   * Runs one step through hu-exec, which stops it at its deadline and reports
   * exactly how it ended. Should hu-exec itself not answer 3 s after the
   * deadline, the whole container goes. `raw` keeps stdout as bytes.
   */
  async step(cmd: string[], options: StepOptions & { raw?: boolean }): Promise<StepResult & { raw?: Buffer }> {
    const started = Date.now();
    const exec = await this.container.exec({
      Cmd: ["/opt/hu/bin/hu-exec", "-t", String(options.timeoutMs), "--", ...cmd],
      Env: options.env,
      WorkingDir: options.workDir,
      User: "1000:1000",
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });
    const stream = (await exec.start({ hijack: true, stdin: true })) as Duplex;
    const watchdog = setTimeout(() => void this.kill("step deadline"), options.timeoutMs + 3_000);
    const cap = options.maxBytes;
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const both: Buffer[] = [];
    // Past the cap, only the end of stderr is kept, since hu-exec's status
    // line is the last thing on it.
    const errTail: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let over: "OL" | "EL" | null = null;
    let stopping: Promise<void> | null = null;
    const demux = new Demux((type, data) => {
      if (type === 1) {
        if (outBytes < cap) {
          const keep = data.subarray(0, cap - outBytes);
          out.push(keep);
          if (!options.raw) both.push(keep);
        }
        outBytes += data.length;
        if (outBytes > cap) over ??= "OL";
      } else {
        if (errBytes < cap) {
          const keep = data.subarray(0, cap - errBytes);
          err.push(keep);
          both.push(keep);
        } else {
          errTail.push(data);
          if (errTail.length > 4) errTail.shift();
        }
        errBytes += data.length;
        // The status line itself may go a little past the cap.
        if (errBytes > cap + 128) over ??= "EL";
      }
      if (over) stopping ??= this.stopStep();
    });
    await new Promise<void>((resolve) => {
      stream.on("data", (chunk: Buffer) => demux.push(chunk));
      stream.on("end", resolve);
      stream.on("close", resolve);
      stream.on("error", resolve);
      stream.end(options.stdin ?? "");
    });
    clearTimeout(watchdog);
    await stopping;
    const wallMs = Date.now() - started;

    const { stderr, trailer } = splitTrailer(Buffer.concat(errBytes > cap ? [...err, ...errTail] : err));
    let output = Buffer.concat(both).toString("utf8");
    const mark = output.lastIndexOf("\0hu-exec ");
    if (trailer && mark >= 0) output = output.slice(0, mark);
    const result: StepResult & { raw?: Buffer } = {
      stdout: options.raw ? "" : Buffer.concat(out).toString("utf8"),
      stderr: stderr.subarray(0, cap).toString("utf8"),
      output,
      code: null,
      signal: null,
      status: null,
      message: null,
      limit: null,
      wallMs,
    };
    if (options.raw) result.raw = Buffer.concat(out);
    if (trailer) {
      result.code = trailer.code >= 0 ? trailer.code : null;
      result.signal = trailer.signal ? signalName(trailer.signal) : null;
    } else if (!this.killed) {
      // No status line and no kill: ask Docker how the exec ended.
      result.code = (await exec.inspect().catch(() => null))?.ExitCode ?? null;
    }

    if (over) {
      result.status = over;
      result.limit = "output";
      result.message = over === "OL" ? "stdout length exceeded" : "stderr length exceeded";
    } else if (trailer?.timedOut || (!trailer && this.killed)) {
      Object.assign(result, { status: "TO", limit: "time", code: null, signal: "SIGKILL", message: "Time limit exceeded" });
    } else if (result.signal) {
      result.status = "SG";
      result.message = `Killed by ${result.signal}`;
      if (result.signal === "SIGXFSZ") result.limit = "fsize";
    } else if (result.code === null) {
      result.status = "XX";
      result.message = "The step ended without an exit status";
    } else if (result.code !== 0) {
      result.status = "RE";
      result.message = `Exited with error status ${result.code}`;
    }
    // The cause is more use than the symptom: a fork bomb that ran out the
    // clock is a process limit, and a crash from an OOM kill is a memory one.
    if (trailer?.oom) result.limit = "memory";
    else if (trailer?.pids && result.limit !== "output") result.limit = "pids";
    return result;
  }

  /** Stops the running step's processes (hu-exec stays to report), for an output flood. */
  private async stopStep(): Promise<void> {
    try {
      const exec = await this.container.exec({ Cmd: ["/opt/hu/bin/hu-exec", "--kill"], User: "1000:1000", AttachStdout: true, AttachStderr: true });
      const stream = (await exec.start({ hijack: true, stdin: false })) as Duplex;
      await new Promise<void>((resolve) => {
        stream.on("end", resolve);
        stream.on("close", resolve);
        stream.on("error", resolve);
        stream.resume();
      });
    } catch {
      // Not even one more process fits (a fork bomb): stop the job.
      await this.kill("output flood");
    }
  }

  /** Whether the container was killed (its deadline, or the caller gave up). */
  get dead(): boolean {
    return this.killed;
  }

  /** Kills the container now. Steps in flight end, and the job reports a timeout. */
  async kill(reason: string): Promise<void> {
    if (this.killed) return;
    this.killed = true;
    this.log.warn("job.kill", { name: this.name, reason });
    await this.container.kill().catch(() => {});
  }

  /** Removes the container. Safe to call more than once. */
  async dispose(): Promise<void> {
    clearTimeout(this.deadline);
    await this.container.remove({ force: true, v: true }).catch((err: { statusCode?: number }) => {
      if (err.statusCode !== 404) this.log.warn("job.remove_failed", { name: this.name });
    });
  }
}
