import type { Duplex } from "node:stream";
import type Docker from "dockerode";
import { Demux, STDIN_BY_COUNT, countedStdin } from "./jobs.ts";

/**
 * docker exec, three ways: collect a command's output (with a cap and a
 * deadline), stream it (terminals, the port bridge), or start it detached
 * (tasks). Every command is an argv array, never a shell string built from a
 * path or a name: the fixed scripts below take their values as arguments.
 */

export interface ExecOptions {
  /** "learner" (uid 1000, with its groups) unless said otherwise. */
  user?: string;
  env?: string[];
  workDir?: string;
}

export interface Collected {
  stdout: Buffer;
  stderr: Buffer;
  /** The exit code, or null when it didn't finish in time (or Docker couldn't say). */
  code: number | null;
  timedOut: boolean;
  /** stdout or stderr went past `maxBytes`, and the rest was dropped. */
  truncated: boolean;
}

/** Runs a command to the end and collects stdout and stderr, each up to `maxBytes`. */
export async function execCollect(
  container: Docker.Container,
  cmd: string[],
  { stdin, timeoutMs = 30_000, maxBytes = 4 * 1024 * 1024, ...options }: ExecOptions & { stdin?: Buffer | string; timeoutMs?: number; maxBytes?: number } = {}
): Promise<Collected> {
  // Stdin goes by count on Windows (STDIN_BY_COUNT in jobs.ts).
  const input = stdin === undefined ? undefined : Buffer.from(stdin);
  const attach = input !== undefined && (!STDIN_BY_COUNT || input.length > 0);
  const exec = await container.exec({
    Cmd: STDIN_BY_COUNT && input?.length ? countedStdin(cmd, input.length) : cmd,
    User: options.user ?? "learner",
    Env: options.env,
    WorkingDir: options.workDir,
    AttachStdin: attach,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });
  const stream = (await exec.start({ hijack: true, stdin: attach })) as Duplex;
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  let outBytes = 0;
  let errBytes = 0;
  let truncated = false;
  const demux = new Demux((type, data) => {
    if (type === 1) {
      if (outBytes < maxBytes) out.push(data.subarray(0, maxBytes - outBytes));
      outBytes += data.length;
    } else {
      if (errBytes < maxBytes) err.push(data.subarray(0, maxBytes - errBytes));
      errBytes += data.length;
    }
    if (outBytes > maxBytes || errBytes > maxBytes) truncated = true;
  });
  let timedOut = false;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      stream.destroy();
      resolve();
    }, timeoutMs);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    stream.on("data", (chunk: Buffer) => demux.push(chunk));
    stream.on("end", done);
    stream.on("close", done);
    stream.on("error", done);
    if (attach && !STDIN_BY_COUNT) stream.end(input);
    else if (attach) stream.write(input);
  });
  const info = timedOut ? null : await exec.inspect().catch(() => null);
  return { stdout: Buffer.concat(out), stderr: Buffer.concat(err), code: info?.ExitCode ?? null, timedOut, truncated };
}

/** Starts a command with stdin attached and returns the raw hijacked stream (multiplexed unless `tty`). */
export async function execStream(
  container: Docker.Container,
  cmd: string[],
  options: ExecOptions & { tty?: boolean } = {}
): Promise<{ exec: Docker.Exec; stream: Duplex }> {
  const exec = await container.exec({
    Cmd: cmd,
    User: options.user ?? "learner",
    Env: options.env,
    WorkingDir: options.workDir,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: options.tty ?? false,
  });
  const stream = (await exec.start({ hijack: true, stdin: true, Tty: options.tty ?? false })) as Duplex;
  return { exec, stream };
}

/** Starts a command and returns without waiting for it. */
export async function execDetached(container: Docker.Container, cmd: string[], options: ExecOptions = {}): Promise<Docker.Exec> {
  const exec = await container.exec({
    Cmd: cmd,
    User: options.user ?? "learner",
    Env: options.env,
    WorkingDir: options.workDir,
    AttachStdin: false,
    AttachStdout: false,
    AttachStderr: false,
    Tty: false,
  });
  await exec.start({ Detach: true });
  return exec;
}

/** Runs a fixed script that must succeed, and returns its stdout as text. */
export async function execScript(
  container: Docker.Container,
  script: string,
  args: string[],
  options: ExecOptions & { stdin?: Buffer | string; timeoutMs?: number; maxBytes?: number } = {}
): Promise<string> {
  const result = await execCollect(container, ["sh", "-c", script, "sh", ...args], options);
  if (result.timedOut) throw new ExecFailed("The workspace didn't answer in time.", result);
  if (result.code !== 0) throw new ExecFailed(result.stderr.toString("utf8").trim() || `Exited with ${result.code}`, result);
  return result.stdout.toString("utf8");
}

export class ExecFailed extends Error {
  readonly result: Collected;
  constructor(message: string, result: Collected) {
    super(message);
    this.result = result;
  }
}
