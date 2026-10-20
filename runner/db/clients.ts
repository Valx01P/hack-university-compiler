import { randomBytes } from "node:crypto";
import type Docker from "dockerode";
import { LABEL, labelsFor, type Owner } from "../docker.ts";
import type { Log } from "../log.ts";
import { execCollect, type ExecOptions, type ExecResult } from "./exec.ts";
import { POSTGRES_IMAGE } from "./services.ts";

/**
 * Client containers: psql and pg_dump from the PostgreSQL image, run as a
 * learner's own role over the database network, never inside the shared
 * server (invariant I3). Anything a learner or a template wrote runs here: the
 * Database panel's SQL, a template's schema and seed, a test's extra SQL, and
 * the dumps that park a workspace's database. A psql meta-command such as \!
 * can only reach this throwaway container, which holds one role's password
 * and nothing else.
 *
 * Each role gets its own container, kept warm for a minute so a panel's next
 * query skips the start (about 150 ms), and removed after.
 */

const MiB = 1024 * 1024;
/** How long an idle client container is kept. */
const WARM_MS = 60_000;
/** At most this many warm at once. */
const MAX_WARM = 4;
/** No client container lives longer than this (its hu.expires label, for the reaper). */
const LIFETIME_MS = 15 * 60_000;

type HostConfig = Docker.HostConfig & { CgroupnsMode?: "private" | "host" };

interface Warm {
  container: Docker.Container;
  name: string;
  lastUsed: number;
  users: number;
  createdAt: number;
}

export class Clients {
  private readonly docker: Docker;
  private readonly owner: Owner;
  private readonly log: Log;
  private readonly network: () => string;
  private readonly prefix: string;
  private readonly warm = new Map<string, Promise<Warm>>();
  private readonly timer: NodeJS.Timeout;

  constructor(docker: Docker, owner: Owner, log: Log, network: () => string, prefix: string) {
    this.docker = docker;
    this.owner = owner;
    this.log = log;
    this.network = network;
    this.prefix = prefix;
    this.timer = setInterval(() => void this.sweep(), 15_000);
    this.timer.unref();
  }

  /**
   * Runs a command in the client container for `key` (one per role), with
   * the PostgreSQL client tools. The command is an argv array, and `timeout`
   * kills it at its deadline inside the container.
   */
  async run(key: string, cmd: string[], options: ExecOptions & { timeoutMs: number }): Promise<ExecResult> {
    const warm = await this.get(key);
    warm.users++;
    try {
      const seconds = Math.max(1, Math.ceil(options.timeoutMs / 1000));
      return await execCollect(warm.container, ["timeout", "-s", "KILL", String(seconds), ...cmd], {
        ...options,
        user: "70:70",
        timeoutMs: options.timeoutMs + 5_000,
      });
    } finally {
      warm.users--;
      warm.lastUsed = Date.now();
    }
  }

  private get(key: string): Promise<Warm> {
    let warm = this.warm.get(key);
    if (!warm) {
      warm = this.create(key);
      this.warm.set(key, warm);
      warm.catch(() => this.warm.delete(key));
    }
    return warm;
  }

  private async create(key: string): Promise<Warm> {
    await this.evict();
    const name = `${this.prefix}-${randomBytes(6).toString("hex")}`;
    const host: HostConfig = {
      Init: true,
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges"],
      NetworkMode: this.network(),
      IpcMode: "private",
      CgroupnsMode: "private",
      Memory: 256 * MiB,
      MemorySwap: 256 * MiB,
      NanoCpus: 1e9,
      PidsLimit: 64,
      OomScoreAdj: 500,
      Ulimits: [
        { Name: "nofile", Soft: 1024, Hard: 1024 },
        { Name: "fsize", Soft: 64 * MiB, Hard: 64 * MiB },
      ],
      Tmpfs: { "/tmp": "rw,noexec,nosuid,nodev,size=32m,mode=1777" },
      LogConfig: { Type: "none", Config: {} },
    };
    const container = await this.docker.createContainer({
      name,
      Image: POSTGRES_IMAGE.ref,
      // postgres (uid 70) in the Alpine image: a user psql knows, with no rights here.
      User: "70:70",
      Hostname: "client",
      WorkingDir: "/tmp",
      Entrypoint: ["sleep"],
      Cmd: [String(LIFETIME_MS / 1000)],
      Env: ["HOME=/tmp", "PGCONNECT_TIMEOUT=10"],
      Labels: labelsFor(this.owner, "job", { [LABEL.recipe]: "db-client", [LABEL.expires]: String(Date.now() + LIFETIME_MS) }),
      HostConfig: host,
    });
    try {
      await container.start();
    } catch (err) {
      await container.remove({ force: true }).catch(() => {});
      throw err;
    }
    this.log.info("db.client", { name, key });
    return { container, name, lastUsed: Date.now(), users: 0, createdAt: Date.now() };
  }

  /** Makes room before a new container: the least recently used idle one goes. */
  private async evict(): Promise<void> {
    if (this.warm.size < MAX_WARM) return;
    const entries = await Promise.all([...this.warm.entries()].map(async ([key, p]) => [key, await p.catch(() => null)] as const));
    const idle = entries.filter(([, w]) => w && w.users === 0).sort((a, b) => a[1]!.lastUsed - b[1]!.lastUsed);
    for (const [key, w] of idle.slice(0, this.warm.size - MAX_WARM + 1)) {
      this.warm.delete(key);
      await w!.container.remove({ force: true }).catch(() => {});
    }
  }

  /** Removes containers idle past WARM_MS, or near the end of their lifetime. */
  async sweep(now = Date.now()): Promise<void> {
    for (const [key, p] of [...this.warm.entries()]) {
      const w = await p.catch(() => null);
      if (!w) continue;
      const old = now - w.createdAt > LIFETIME_MS - 2 * 60_000;
      if (w.users === 0 && (now - w.lastUsed > WARM_MS || old)) {
        this.warm.delete(key);
        await w.container.remove({ force: true }).catch(() => {});
      }
    }
  }

  /** Drops the warm container for a role, when the role itself goes. */
  async forget(key: string): Promise<void> {
    const p = this.warm.get(key);
    if (!p) return;
    this.warm.delete(key);
    const w = await p.catch(() => null);
    await w?.container.remove({ force: true }).catch(() => {});
  }

  async shutdown(): Promise<void> {
    clearInterval(this.timer);
    await Promise.all([...this.warm.keys()].map((key) => this.forget(key)));
  }
}

/** libpq's environment for one role on one database: nothing goes on the command line. */
export function pgEnv(conn: { role: string; password: string; database: string }, extra: string[] = []): string[] {
  return [`PGHOST=db`, "PGPORT=5432", `PGUSER=${conn.role}`, `PGPASSWORD=${conn.password}`, `PGDATABASE=${conn.database}`, "PGAPPNAME=hack-university", ...extra];
}
