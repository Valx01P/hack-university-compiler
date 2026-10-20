import type { Duplex } from "node:stream";
import type Docker from "dockerode";
import { Demux } from "../jobs.ts";

/**
 * docker exec for the database containers and the client containers: run a
 * fixed command to the end, or keep one admin shell open (psql, mongosh) and
 * talk to it a statement at a time. Commands are argv arrays, never shell
 * strings, and every value in them was checked by names.ts first.
 */

export interface ExecResult {
  stdout: Buffer;
  stderr: Buffer;
  /** The exit code, or null when it ran out of time (or Docker couldn't say). */
  code: number | null;
  timedOut: boolean;
  /** stdout went past `maxBytes`, and the rest was dropped. */
  truncated: boolean;
}

export interface ExecOptions {
  user?: string;
  env?: string[];
  /** Bytes for stdin, or a stream piped in (a dump being restored). */
  stdin?: Buffer | string | NodeJS.ReadableStream;
  timeoutMs?: number;
  maxBytes?: number;
  /** Where stdout goes instead of memory, without a cap (a dump being saved). */
  sink?: NodeJS.WritableStream;
}

/** Runs a command to the end and collects its output, each stream up to `maxBytes`. */
export async function execCollect(container: Docker.Container, cmd: string[], options: ExecOptions = {}): Promise<ExecResult> {
  const { user, env, stdin, timeoutMs = 30_000, maxBytes = 8 * 1024 * 1024, sink } = options;
  const exec = await container.exec({
    Cmd: cmd,
    User: user,
    Env: env,
    AttachStdin: stdin !== undefined,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });
  const stream = (await exec.start({ hijack: true, stdin: stdin !== undefined })) as Duplex;
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  let outBytes = 0;
  let errBytes = 0;
  let truncated = false;
  const demux = new Demux((type, data) => {
    if (type === 1 && sink) {
      sink.write(data);
    } else if (type === 1) {
      if (outBytes < maxBytes) out.push(data.subarray(0, maxBytes - outBytes));
      outBytes += data.length;
      if (outBytes > maxBytes) truncated = true;
    } else {
      if (errBytes < 256 * 1024) err.push(data.subarray(0, 256 * 1024 - errBytes));
      errBytes += data.length;
    }
  });
  let timedOut = false;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      stream.destroy();
      resolve();
    }, timeoutMs);
    stream.on("data", (chunk: Buffer) => {
      demux.push(chunk);
      // Past the cap there is nothing more to keep: stop reading. The
      // command itself ends at its own deadline (the callers wrap it in timeout).
      if (truncated) stream.destroy();
    });
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    stream.on("end", done);
    stream.on("close", done);
    stream.on("error", done);
    if (typeof stdin === "string" || Buffer.isBuffer(stdin)) stream.end(stdin);
    else if (stdin) stdin.pipe(stream);
  });
  if (sink) await new Promise<void>((resolve) => sink.end(resolve));
  const info = timedOut ? null : await exec.inspect().catch(() => null);
  return { stdout: Buffer.concat(out), stderr: Buffer.concat(err), code: info?.ExitCode ?? null, timedOut, truncated };
}

/**
 * One long-lived exec with stdin open: an admin psql or mongosh inside a
 * database container. A command is written, followed by a marker the shell
 * echoes, and its output is everything before the marker. Starting a process
 * per command costs 15 to 20 ms of docker exec (more when the machine is
 * busy), which a session pays once.
 *
 * Commands run one at a time. If the shell dies, or a command runs past its
 * deadline, the session closes and the next command opens a new one.
 */
export class Session {
  private readonly open: () => Promise<Duplex>;
  private readonly frame: (command: string, mark: string) => string;
  /** Whether the shell also prints the marker on stderr (psql's \warn), so errors are read up to it. */
  private readonly errMarker: boolean;
  private stream: Duplex | null = null;
  private opening: Promise<Duplex> | null = null;
  private out = "";
  private err = "";
  private seq = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private wake: (() => void) | null = null;
  private dead = false;

  /**
   * `open` starts the shell. `frame` turns a command and a marker into what
   * is written: the command, then whatever makes the shell print the marker
   * on stdout (and on stderr, where errors go, when `errMarker` is set).
   */
  constructor(open: () => Promise<Duplex>, frame: (command: string, mark: string) => string, errMarker = true) {
    this.open = open;
    this.frame = frame;
    this.errMarker = errMarker;
  }

  /** Runs one command and answers its stdout and stderr. */
  run(command: string, timeoutMs = 30_000): Promise<{ out: string; err: string }> {
    const next = this.queue.then(() => this.send(command, timeoutMs));
    this.queue = next.catch(() => {});
    return next;
  }

  close() {
    this.stream?.end();
    this.stream?.destroy();
    this.reset();
  }

  private reset() {
    this.stream = null;
    this.opening = null;
    this.out = "";
    this.err = "";
    this.dead = true;
    this.wake?.();
  }

  private async connect(): Promise<Duplex> {
    if (this.stream) return this.stream;
    this.opening ??= this.open().then((stream) => {
      this.dead = false;
      const demux = new Demux((type, data) => {
        if (type === 1) this.out += data.toString("utf8");
        else this.err += data.toString("utf8");
        this.wake?.();
      });
      stream.on("data", (chunk: Buffer) => demux.push(chunk));
      const gone = () => {
        if (this.stream === stream) this.reset();
      };
      stream.on("end", gone);
      stream.on("close", gone);
      stream.on("error", gone);
      this.stream = stream;
      return stream;
    });
    try {
      return await this.opening;
    } catch (err) {
      this.opening = null;
      throw err;
    }
  }

  private async send(command: string, timeoutMs: number): Promise<{ out: string; err: string }> {
    const stream = await this.connect();
    const mark = `__hu_${process.pid}_${++this.seq}__`;
    stream.write(this.frame(command, mark));
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const o = this.out.indexOf(mark);
      const e = this.errMarker ? this.err.indexOf(mark) : this.err.length;
      if (o >= 0 && e >= 0) {
        const out = this.out.slice(0, o);
        const err = this.err.slice(0, e);
        this.out = this.out.slice(this.out.indexOf("\n", o) + 1 || this.out.length);
        this.err = this.errMarker ? this.err.slice(this.err.indexOf("\n", e) + 1 || this.err.length) : "";
        return { out, err };
      }
      if (this.dead || this.stream !== stream) throw new Error(`The database shell stopped: ${this.err.trim().slice(-500) || "no message"}`);
      const left = deadline - Date.now();
      if (left <= 0) {
        this.close();
        throw new Error("The database shell didn't answer in time.");
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.min(left, 1000));
        this.wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.wake = null;
    }
  }
}

/** Starts an exec with stdin open and returns its raw stream. */
export async function openExec(container: Docker.Container, cmd: string[], options: { user?: string; env?: string[] } = {}): Promise<Duplex> {
  const exec = await container.exec({
    Cmd: cmd,
    User: options.user,
    Env: options.env,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });
  return (await exec.start({ hijack: true, stdin: true })) as Duplex;
}
