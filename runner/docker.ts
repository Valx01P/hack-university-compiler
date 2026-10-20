import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import Docker from "dockerode";
import type { Namespace } from "./config.ts";

/**
 * The runner's one Docker connection (invariant I2: only the runner talks to
 * Docker, and only to objects it labeled). The socket comes from DOCKER_HOST,
 * or the active Docker context the way the docker CLI picks it, so Docker
 * Desktop, Colima, and OrbStack all work.
 */

export interface Endpoint {
  socketPath?: string;
  host?: string;
  port?: number;
  protocol?: "http" | "https";
  ca?: Buffer;
  cert?: Buffer;
  key?: Buffer;
  /** Where the endpoint came from, for the log. */
  source: string;
  /** The value to hand the docker CLI as DOCKER_HOST, so it reaches the same daemon. */
  dockerHost: string;
}

export function resolveEndpoint(env: NodeJS.ProcessEnv = process.env, home = homedir()): Endpoint {
  if (env.DOCKER_HOST) return parseHost(env.DOCKER_HOST, "DOCKER_HOST", env);
  const dockerDir = env.DOCKER_CONFIG || path.join(home, ".docker");
  let context = env.DOCKER_CONTEXT;
  if (!context) {
    try {
      context = JSON.parse(readFileSync(path.join(dockerDir, "config.json"), "utf8")).currentContext;
    } catch {
      /* no config: the default context */
    }
  }
  if (context && context !== "default") {
    // The CLI keeps each context's endpoint in contexts/meta/<sha256 of its name>/meta.json.
    const id = createHash("sha256").update(context).digest("hex");
    try {
      const meta = JSON.parse(readFileSync(path.join(dockerDir, "contexts", "meta", id, "meta.json"), "utf8"));
      const host = meta?.Endpoints?.docker?.Host;
      if (typeof host === "string" && host) return parseHost(host, `context ${context}`, env);
    } catch {
      /* fall through to the default socket */
    }
  }
  return { socketPath: "/var/run/docker.sock", source: "default socket", dockerHost: "unix:///var/run/docker.sock" };
}

function parseHost(value: string, source: string, env: NodeJS.ProcessEnv): Endpoint {
  if (value.startsWith("unix://")) return { socketPath: value.slice("unix://".length), source, dockerHost: value };
  const url = new URL(value.replace(/^tcp:\/\//, "http://"));
  const tls = env.DOCKER_TLS_VERIFY === "1";
  const certs = env.DOCKER_CERT_PATH;
  const read = (name: string) => (certs && existsSync(path.join(certs, name)) ? readFileSync(path.join(certs, name)) : undefined);
  return {
    host: url.hostname,
    port: Number(url.port) || (tls ? 2376 : 2375),
    protocol: tls ? "https" : "http",
    ca: tls ? read("ca.pem") : undefined,
    cert: tls ? read("cert.pem") : undefined,
    key: tls ? read("key.pem") : undefined,
    source,
    dockerHost: value,
  };
}

export function connect(endpoint: Endpoint, timeoutMs?: number): Docker {
  const { source: _source, dockerHost: _host, ...options } = endpoint;
  return new Docker({ ...options, timeout: timeoutMs });
}

// Labels (architecture §5.3). Reconcile and the reaper act only on objects
// that carry hu.managed=1 and their own namespace.
export const LABEL = {
  managed: "hu.managed",
  kind: "hu.kind",
  ns: "hu.ns",
  runner: "hu.runner",
  port: "hu.port",
  recipe: "hu.recipe",
  expires: "hu.expires",
  workspace: "hu.workspace",
  image: "hu.image",
  hash: "hu.hash",
  /** The data folder a workspace belongs to (8 hex characters of its hash). */
  home: "hu.home",
} as const;

export type Kind = "workspace" | "job" | "checker" | "db";

/** Container names: hu-job-<uuid> for learners, hv-job-<uuid> for the verifiers. */
export function namePrefix(ns: Namespace): string {
  return ns === "verify" ? "hv" : "hu";
}

export interface Owner {
  ns: Namespace;
  /** This runner's boot id, so reconcile can tell leftovers from live objects. */
  boot: string;
  /** The port this runner listens on: a restarted runner on the same port reconciles its predecessor. */
  port: number;
}

export function labelsFor(owner: Owner, kind: Kind, extra: Record<string, string> = {}): Record<string, string> {
  return {
    [LABEL.managed]: "1",
    [LABEL.kind]: kind,
    [LABEL.ns]: owner.ns,
    [LABEL.runner]: owner.boot,
    [LABEL.port]: String(owner.port),
    ...extra,
  };
}

/** Filters for listing this namespace's objects of one kind. */
export function managedFilter(ns: Namespace, kind?: Kind): { label: string[] } {
  const label = [`${LABEL.managed}=1`, `${LABEL.ns}=${ns}`];
  if (kind) label.push(`${LABEL.kind}=${kind}`);
  return { label };
}

export type DockerState = "ready" | "down" | "waking";

export interface DockerFacts {
  serverVersion: string;
  apiVersion: string;
  arch: string;
  memTotal: number;
  ncpu: number;
}

/**
 * Watches Docker: a ping every few seconds, so /v1/health can say whether it
 * is ready, down, or waking up (Docker Desktop's Resource Saver can take 3 to
 * 10 seconds to answer the first call), and so a page recovers by itself when
 * Docker starts.
 */
export class DockerWatch {
  state: DockerState = "down";
  facts: DockerFacts | null = null;
  readonly docker: Docker;
  private readonly fast: Docker;
  private readonly listeners = new Set<(state: DockerState) => void>();
  private timer: NodeJS.Timeout | null = null;
  private checking: Promise<DockerState> | null = null;

  constructor(endpoint: Endpoint) {
    this.docker = connect(endpoint);
    // Pings give up quickly, so a stopped Docker reads as down at once.
    this.fast = connect(endpoint, 1500);
  }

  start(pollMs: number) {
    void this.check();
    this.timer = setInterval(() => void this.check(), pollMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  onChange(listener: (state: DockerState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Pings Docker now, at most one ping at a time. */
  check(): Promise<DockerState> {
    this.checking ??= this.ping().finally(() => {
      this.checking = null;
    });
    return this.checking;
  }

  /** Waits for Docker to be ready, for up to `ms` while it wakes up. */
  async ready(ms = 30_000): Promise<boolean> {
    if (this.state === "ready") return true;
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if ((await this.check()) === "ready") return true;
      if (this.state === "down") return false;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  private async ping(): Promise<DockerState> {
    let next: DockerState;
    try {
      await this.fast.ping();
      if (!this.facts || this.state !== "ready") {
        const info = await this.docker.info();
        const version = await this.docker.version();
        this.facts = {
          serverVersion: info.ServerVersion,
          apiVersion: version.ApiVersion,
          arch: info.Architecture,
          memTotal: info.MemTotal,
          ncpu: info.NCPU,
        };
      }
      next = "ready";
    } catch (err) {
      // The socket answers but the daemon doesn't, yet: Docker Desktop waking.
      const code = (err as NodeJS.ErrnoException).code;
      next = code === "ENOENT" || code === "ECONNREFUSED" || code === "EACCES" ? "down" : "waking";
      if (next === "down") this.facts = null;
    }
    if (next !== this.state) {
      this.state = next;
      for (const listener of this.listeners) listener(next);
    }
    return next;
  }
}

/** Whether an error from dockerode means Docker itself is unreachable. */
export function isDockerDown(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "ENOENT" || code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EPIPE" || code === "EACCES";
}
