import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Duplex } from "node:stream";
import type Docker from "dockerode";
import { createToken } from "./auth.ts";
import { ROOT } from "./config.ts";
import { LABEL, connect, labelsFor, resolveEndpoint, type Endpoint, type Kind, type Owner } from "./docker.ts";
import { Images } from "./images.ts";
import { Demux, JobPool } from "./jobs.ts";
import { quietLog } from "./log.ts";
import { runRecipe, type RecipeDeps } from "./recipes/index.ts";
import type { RunResponse } from "./recipes/types.ts";
import { RunRequest } from "./schemas.ts";

export { WebSocket } from "ws";

/**
 * The library the verifiers import (architecture §7.4). They run content the
 * way Check does, through the same recipes and jobs (invariant I12), in their
 * own namespace: hv- container names and hu.ns=verify labels, so they never
 * touch a learner's live jobs and clean up everything they made.
 */

export interface VerifyKit {
  docker: Docker;
  endpoint: Endpoint;
  images: Images;
  owner: Owner;
  /** Runs a /v1/run request as a job, exactly as the runner would. */
  run(body: unknown): Promise<RunResponse>;
  /** Labels for something this kit creates, so cleanup() finds it. */
  labels(kind: Kind): Record<string, string>;
  /** A name no one else uses, in the verify namespace. */
  name(what: string): string;
  /** Creates and starts a container, runs fn, and removes the container. */
  withContainer<T>(options: Docker.ContainerCreateOptions, fn: (c: Docker.Container) => Promise<T>): Promise<T>;
  /** Removes every container, volume, and network this kit made. */
  cleanup(): Promise<void>;
}

export async function verifyKit(): Promise<VerifyKit> {
  const endpoint = resolveEndpoint();
  const docker = connect(endpoint);
  await docker.ping();
  const images = new Images(ROOT, docker, endpoint.dockerHost);
  await images.refresh();
  const owner: Owner = { ns: "verify", boot: randomBytes(6).toString("hex"), port: 0 };
  const deps: RecipeDeps = { docker, owner, images, pool: new JobPool(4), log: quietLog };
  const kit: VerifyKit = {
    docker,
    endpoint,
    images,
    owner,
    run: (body) => runRecipe(deps, RunRequest.parse(body)),
    labels: (kind) => labelsFor(owner, kind),
    name: (what) => `hv-${what}-${randomBytes(4).toString("hex")}`,
    async withContainer(options, fn) {
      const container = await docker.createContainer(options);
      try {
        await container.start();
        return await fn(container);
      } finally {
        await container.remove({ force: true, v: true }).catch(() => {});
      }
    },
    async cleanup() {
      const label = [`${LABEL.runner}=${owner.boot}`];
      for (let i = 0; i < 50 && deps.pool.stats.running; i++) await new Promise((r) => setTimeout(r, 100));
      for (const c of await docker.listContainers({ all: true, filters: { label } })) {
        await docker.getContainer(c.Id).remove({ force: true, v: true }).catch(() => {});
      }
      for (const v of (await docker.listVolumes({ filters: { label } })).Volumes ?? []) {
        await docker.getVolume(v.Name).remove().catch(() => {});
      }
      for (const n of await docker.listNetworks({ filters: { label } })) {
        await docker.getNetwork(n.Id).remove().catch(() => {});
      }
    },
  };
  return kit;
}

/** Runs a command in a container (no hu-exec) and returns its output and exit code. */
export async function execText(
  container: Docker.Container,
  cmd: string[],
  { user = "1000:1000", stdin = "", timeoutMs = 30_000 }: { user?: string; stdin?: string; timeoutMs?: number } = {}
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const exec = await container.exec({ Cmd: cmd, User: user, AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: false });
  const stream = (await exec.start({ hijack: true, stdin: true })) as Duplex;
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  const demux = new Demux((type, data) => (type === 1 ? out : err).push(data));
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      stream.destroy();
      resolve();
    }, timeoutMs);
    stream.on("data", (chunk: Buffer) => demux.push(chunk));
    stream.on("end", () => {
      clearTimeout(timer);
      resolve();
    });
    stream.on("error", () => resolve());
    stream.end(stdin);
  });
  const info = await exec.inspect().catch(() => null);
  return { stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString(), code: info?.ExitCode ?? null };
}

/** `preferred` when it's free on 127.0.0.1, else any free port. */
export async function freePort(preferred: number): Promise<number> {
  const listen = (port: number) =>
    new Promise<number | null>((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(null));
      server.listen(port, "127.0.0.1", () => {
        const { port: got } = server.address() as net.AddressInfo;
        server.close(() => resolve(got));
      });
    });
  return (await listen(preferred)) ?? (await listen(0)) ?? preferred;
}

export interface RunnerProcess {
  port: number;
  token: string;
  dataDir: string;
  child: ChildProcess;
  /** Waits until /v1/health answers. */
  ready(timeoutMs?: number): Promise<void>;
  request(
    method: string,
    path: string,
    options?: { headers?: Record<string, string>; body?: unknown; token?: string | null }
  ): Promise<{ status: number; headers: http.IncomingHttpHeaders; json: any }>;
  /** Sends a signal and waits for the process to exit. */
  stop(signal?: NodeJS.Signals): Promise<void>;
}

/**
 * Starts a runner of its own, in the verify namespace, on `port`, with a fresh
 * token and data folder. `env` adds or overrides variables (shorter ticket
 * lifetimes for the tests, say).
 */
export function startRunner(port: number, env: Record<string, string> = {}, dataDir?: string): RunnerProcess {
  const token = createToken();
  const dir = dataDir ?? mkdtempSync(path.join(tmpdir(), "hv-runner-"));
  const child = spawn(process.execPath, [path.join(ROOT, "runner", "main.ts")], {
    env: { ...process.env, HU_NS: "verify", HU_RUNNER_PORT: String(port), HU_RUNNER_TOKEN: token, HU_DATA_DIR: dir, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout?.on("data", (c) => (log += c));
  child.stderr?.on("data", (c) => (log += c));
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));

  const request: RunnerProcess["request"] = (method, urlPath, options = {}) =>
    new Promise((resolve, reject) => {
      const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
      const headers: Record<string, string> = { host: `127.0.0.1:${port}`, ...(options.headers ?? {}) };
      if (options.token !== null) headers.authorization = `Bearer ${options.token ?? token}`;
      if (payload) headers["content-type"] ??= "application/json";
      const req = http.request({ host: "127.0.0.1", port, method, path: urlPath, headers }, (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = raw;
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, json });
        });
      });
      req.on("error", reject);
      req.end(payload);
    });

  return {
    port,
    token,
    dataDir: dir,
    child,
    async ready(timeoutMs = 15_000) {
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        if (child.exitCode !== null) throw new Error(`The runner exited: ${log.trim()}`);
        try {
          if ((await request("GET", "/v1/health")).status === 200) return;
        } catch {
          /* not listening yet */
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`The runner didn't answer within ${timeoutMs} ms: ${log.trim()}`);
    },
    request,
    async stop(signal = "SIGTERM") {
      if (child.exitCode === null) child.kill(signal);
      await exited;
    },
  };
}
