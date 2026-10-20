import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type Docker from "dockerode";
import { LABEL, labelsFor, type Owner } from "../docker.ts";
import type { Log } from "../log.ts";
import { MongoAdmin } from "./mongo.ts";
import { dockerNames, newPassword } from "./names.ts";
import { PgAdmin } from "./postgres.ts";

/**
 * hu-postgres and hu-mongo (architecture §2.4, §2.5, §4.5, §11.2, PLAN.md
 * B.1): started on demand, on the internal network hu-db (aliases db and
 * mongo) with no published port, their data in named volumes, hardened, and
 * stopped 30 minutes after their last use.
 *
 * A verify runner gets a server, network, and volumes of its own per port
 * (hv-postgres-<port>), removed when it stops, so tests never touch another
 * runner's databases.
 */

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

export type DbKind = "postgres" | "mongo";
export type ServiceState = "running" | "stopped" | "absent";

/** postgres:18.6-alpine, pinned by its index digest. */
export const POSTGRES_IMAGE = { ref: "postgres@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873", tag: "postgres:18.6-alpine", version: "18.6" };

/**
 * mongo:8.0.34 (Mongoose 9's table stops at 8.x), or 7.0.45 where 8.x can't
 * start. MongoDB 8 refuses Linux 6.19 to 7.0.13 (SERVER-121912: its TCMalloc
 * and the kernel's rseq change), and Docker Desktop ships 7.0.12 until 4.93.
 * MongoDB 7 has the older allocator and runs there, and Mongoose 9 supports it.
 */
export const MONGO_IMAGES = {
  "8.0": { ref: "mongo@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907", tag: "mongo:8.0.34", version: "8.0.34" },
  "7.0": { ref: "mongo@sha256:c53852c00c23ca9f23fc39690350ffa9a80e3642fe8f96879726d8da0abe80a7", tag: "mongo:7.0.45", version: "7.0.45" },
} as const;

/** Whether MongoDB 8.0.30 and later start on this kernel (they allow up to 6.18, and 7.0.14 on). */
export function mongo8Runs(kernel: string): boolean {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(kernel);
  if (!m) return true;
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (major < 6 || (major === 6 && minor < 19)) return true;
  if (major === 6) return false;
  if (major === 7 && minor === 0) return patch >= 14;
  return true;
}

export const POSTGRES_BYTES = 768 * MiB;
export const MONGO_BYTES = 1 * GiB;

/** The superuser passwords and the replica set key, 0600 in HU_DATA_DIR/secrets.json. */
export interface Secrets {
  /** Labels this data folder's volumes and containers: a server from another data folder is replaced. */
  instance: string;
  postgres: { password: string };
  mongo: { password: string; keyFile: string };
}

export function loadSecrets(dataDir: string): Secrets {
  const file = path.join(dataDir, "secrets.json");
  if (existsSync(file)) {
    try {
      const s = JSON.parse(readFileSync(file, "utf8")) as Secrets;
      if (s.instance && s.postgres?.password && s.mongo?.password && s.mongo?.keyFile) return s;
    } catch {
      /* unreadable: make new ones, and the servers that used the old ones are replaced */
    }
  }
  const secrets: Secrets = {
    instance: randomBytes(8).toString("hex"),
    postgres: { password: newPassword() },
    mongo: { password: newPassword(), keyFile: randomBytes(48).toString("hex") },
  };
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
  return secrets;
}

/** What the entrypoint needs to write before mongod starts: the key file, from the environment, owned by mongodb. */
const MONGO_START = [
  'umask 077 && printf "%s" "$HU_MONGO_KEY" > /tmp/keyfile && chown mongodb:mongodb /tmp/keyfile && unset HU_MONGO_KEY',
  "exec docker-entrypoint.sh mongod --replSet rs0 --keyFile /tmp/keyfile --auth --noscripting --wiredTigerCacheSizeGB 0.25 --bind_ip_all",
].join(" && ");

/** The capabilities the official entrypoints need to chown their data folder and drop to their own user. */
const DB_CAPS = ["CHOWN", "SETUID", "SETGID", "FOWNER", "DAC_OVERRIDE"];

type HostConfig = Docker.HostConfig & { CgroupnsMode?: "private" | "host" };

export class DbError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface ServicesOptions {
  docker: Docker;
  owner: Owner;
  dataDir: string;
  log: Log;
  /** How long a server stays up after its last use (HU_DB_IDLE_MS). */
  idleMs: number;
}

export class DbServices {
  readonly docker: Docker;
  readonly owner: Owner;
  readonly names: ReturnType<typeof dockerNames>;
  readonly secrets: Secrets;
  readonly pg: PgAdmin;
  readonly mongo: MongoAdmin;
  private readonly log: Log;
  private readonly idleMs: number;
  private readonly starting = new Map<DbKind, Promise<void>>();
  private readonly up = new Set<DbKind>();
  private readonly lastUsed = new Map<DbKind, number>();
  private readonly busy = new Map<DbKind, number>();
  private readonly states = new Map<DbKind, ServiceState>([
    ["postgres", "absent"],
    ["mongo", "absent"],
  ]);
  private mongoImage: { ref: string; tag: string; version: string } | null = null;
  /** Called once a server is up and set up, every time it comes up (leftover cleanup). */
  onUp: (kind: DbKind) => Promise<void> = async () => {};

  constructor(options: ServicesOptions) {
    this.docker = options.docker;
    this.owner = options.owner;
    this.log = options.log;
    this.idleMs = options.idleMs;
    this.names = dockerNames(options.owner.ns, options.owner.port);
    this.secrets = loadSecrets(options.dataDir);
    this.pg = new PgAdmin(this.docker, this.names.postgres);
    this.mongo = new MongoAdmin(this.docker, this.names.mongo, () => this.secrets.mongo.password);
  }

  /** For /v1/health: running, stopped, or absent. */
  state(kind: DbKind): ServiceState {
    return this.states.get(kind) ?? "absent";
  }

  /** The image a server runs (or would run), with its version. */
  image(kind: DbKind) {
    return kind === "postgres" ? POSTGRES_IMAGE : (this.mongoImage ?? MONGO_IMAGES["8.0"]);
  }

  /** The network name every database user joins: hu-db (or this verify runner's own). */
  get network(): string {
    return this.names.network;
  }

  containerName(kind: DbKind): string {
    return kind === "postgres" ? this.names.postgres : this.names.mongo;
  }

  /** Marks a server used now, so the idle stop waits. */
  touch(kind: DbKind) {
    this.lastUsed.set(kind, Date.now());
  }

  /** Runs `fn` with the server up, and keeps the idle stop away until it ends. */
  async use<T>(kind: DbKind, fn: () => Promise<T>): Promise<T> {
    await this.ensure(kind);
    this.busy.set(kind, (this.busy.get(kind) ?? 0) + 1);
    try {
      return await fn();
    } finally {
      this.busy.set(kind, (this.busy.get(kind) ?? 1) - 1);
      this.touch(kind);
    }
  }

  /** Starts a server if it isn't up: pulls its image the first time, then the network, volume, and container. */
  ensure(kind: DbKind): Promise<void> {
    if (this.up.has(kind)) {
      this.touch(kind);
      return Promise.resolve();
    }
    let starting = this.starting.get(kind);
    if (!starting) {
      starting = this.start(kind).finally(() => this.starting.delete(kind));
      this.starting.set(kind, starting);
    }
    return starting;
  }

  /** Starts a server only when its image is already here (hover: never a pull). */
  async prewarm(kind: DbKind): Promise<void> {
    if (this.up.has(kind) || this.starting.has(kind)) return;
    const image = kind === "postgres" ? POSTGRES_IMAGE : await this.pickMongo();
    if (!(await this.hasImage(image.ref))) return;
    void this.ensure(kind).catch((err: Error) => this.log.warn("db.prewarm_failed", { kind, error: err.message }));
  }

  private async start(kind: DbKind): Promise<void> {
    const started = Date.now();
    const image = kind === "postgres" ? POSTGRES_IMAGE : await this.pickMongo();
    await this.pull(image);
    await this.ensureNetwork();
    const volume = kind === "postgres" ? this.names.pgVolume : this.names.mongoVolume;
    const name = this.containerName(kind);
    let container = await this.inspect(name);
    const fresh = container ? false : true;
    // A server from another data folder (its secrets are gone) or another image is replaced.
    if (container && (container.Config.Labels?.["hu.instance"] !== this.secrets.instance || container.Config.Labels?.[LABEL.image] !== image.tag)) {
      this.log.info("db.replace", { name, why: "instance or image changed" });
      await this.docker.getContainer(name).remove({ force: true, v: false });
      container = null;
    }
    // A replaced volume takes the containers that used it along.
    if (await this.ensureVolume(volume)) container = await this.inspect(name);
    if (!container) await this.docker.createContainer(kind === "postgres" ? this.postgresSpec(volume) : this.mongoSpec(volume, image));
    const c = this.docker.getContainer(name);
    if (!container?.State.Running) await c.start().catch((err: { statusCode?: number }) => {
      if (err.statusCode !== 304) throw err;
    });
    this.states.set(kind, "running");
    await this.waitReady(kind);
    if (kind === "postgres") {
      await this.pg.init();
    } else {
      const { initiated, version } = await this.mongo.init();
      this.log.info("db.mongo_ready", { version, initiated });
    }
    this.up.add(kind);
    this.touch(kind);
    await this.onUp(kind);
    this.log.info("db.up", { kind, name, ms: Date.now() - started, fresh });
  }

  /** Waits for the real server: PostgreSQL on TCP (the entrypoint's first run listens on its socket only), MongoDB as a replica set member. */
  private async waitReady(kind: DbKind): Promise<void> {
    const until = Date.now() + (kind === "postgres" ? 60_000 : 120_000);
    while (Date.now() < until) {
      const info = await this.inspect(this.containerName(kind));
      if (!info?.State.Running && info?.State.Status !== "restarting" && info?.State.Status !== "created") {
        const logs = await this.logs(this.containerName(kind));
        throw new DbError(503, "db_failed", `${kind === "postgres" ? "PostgreSQL" : "MongoDB"} stopped while starting: ${logs}`);
      }
      if (kind === "postgres" ? await this.pg.ready() : await this.mongo.serving()) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new DbError(503, "db_failed", `${kind === "postgres" ? "PostgreSQL" : "MongoDB"} didn't start in time.`);
  }

  private async logs(name: string): Promise<string> {
    try {
      const buf = (await this.docker.getContainer(name).logs({ stdout: true, stderr: true, tail: 20 })) as unknown as Buffer;
      return buf.toString("utf8").replace(/[\x00-\x08]/g, "").trim().slice(-800);
    } catch {
      return "no logs";
    }
  }

  private postgresSpec(volume: string): Docker.ContainerCreateOptions {
    const host: HostConfig = {
      Init: true,
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ["ALL"],
      CapAdd: DB_CAPS,
      SecurityOpt: ["no-new-privileges"],
      NetworkMode: this.network,
      IpcMode: "private",
      CgroupnsMode: "private",
      Memory: POSTGRES_BYTES,
      MemorySwap: POSTGRES_BYTES,
      NanoCpus: 1e9,
      // The kernel kills learner processes first when memory runs out.
      OomScoreAdj: -500,
      Tmpfs: { "/var/run/postgresql": "rw,nosuid,nodev,size=16m", "/tmp": "rw,nosuid,nodev,size=64m" },
      Mounts: [{ Type: "volume", Source: volume, Target: "/var/lib/postgresql" }],
      RestartPolicy: { Name: "unless-stopped" },
      LogConfig: { Type: "json-file", Config: { "max-size": "1m", "max-file": "2" } },
    };
    return {
      name: this.names.postgres,
      Image: POSTGRES_IMAGE.ref,
      Hostname: "db",
      Cmd: [
        "postgres",
        "-c", "shared_buffers=128MB",
        "-c", "max_connections=200",
        "-c", "work_mem=4MB",
        // A crash can lose the last few transactions but never corrupts the cluster.
        "-c", "synchronous_commit=off",
        "-c", "fsync=on",
        "-c", "shared_preload_libraries=pg_stat_statements",
      ],
      Env: [
        `POSTGRES_PASSWORD=${this.secrets.postgres.password}`,
        // Byte-order text sorting, the order the SQL course shows.
        "POSTGRES_INITDB_ARGS=--locale-provider=builtin --locale=C.UTF-8 --encoding=UTF8",
      ],
      Labels: labelsFor(this.owner, "db", { "hu.db": "postgres", "hu.instance": this.secrets.instance, [LABEL.image]: POSTGRES_IMAGE.tag }),
      HostConfig: host,
      NetworkingConfig: { EndpointsConfig: { [this.network]: { Aliases: ["db"] } } },
      StopTimeout: 10,
    };
  }

  private mongoSpec(volume: string, image: { ref: string; tag: string }): Docker.ContainerCreateOptions {
    const host: HostConfig = {
      Init: true,
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ["ALL"],
      CapAdd: DB_CAPS,
      SecurityOpt: ["no-new-privileges"],
      NetworkMode: this.network,
      IpcMode: "private",
      CgroupnsMode: "private",
      Memory: MONGO_BYTES,
      MemorySwap: MONGO_BYTES,
      NanoCpus: 1e9,
      OomScoreAdj: -500,
      // /data/configdb is declared a volume by the image and unused here.
      Tmpfs: { "/tmp": "rw,nosuid,nodev,size=64m", "/data/configdb": "rw,nosuid,nodev,size=16m" },
      Mounts: [{ Type: "volume", Source: volume, Target: "/data/db" }],
      RestartPolicy: { Name: "unless-stopped" },
      LogConfig: { Type: "json-file", Config: { "max-size": "1m", "max-file": "2" } },
    };
    return {
      name: this.names.mongo,
      Image: image.ref,
      Hostname: "mongo",
      Entrypoint: ["bash", "-c", MONGO_START],
      Cmd: [],
      Env: [
        "MONGO_INITDB_ROOT_USERNAME=root",
        `MONGO_INITDB_ROOT_PASSWORD=${this.secrets.mongo.password}`,
        `HU_MONGO_KEY=${this.secrets.mongo.keyFile}`,
      ],
      Labels: labelsFor(this.owner, "db", { "hu.db": "mongo", "hu.instance": this.secrets.instance, [LABEL.image]: image.tag }),
      HostConfig: host,
      NetworkingConfig: { EndpointsConfig: { [this.network]: { Aliases: ["mongo"] } } },
      StopTimeout: 10,
    };
  }

  /** MongoDB 8 unless this Docker's kernel is one it refuses. */
  private async pickMongo() {
    if (this.mongoImage) return this.mongoImage;
    const info = await this.docker.info();
    const kernel = String(info.KernelVersion ?? "");
    this.mongoImage = mongo8Runs(kernel) ? MONGO_IMAGES["8.0"] : MONGO_IMAGES["7.0"];
    if (this.mongoImage !== MONGO_IMAGES["8.0"]) {
      this.log.warn("db.mongo_fallback", {
        kernel,
        image: this.mongoImage.tag,
        why: "MongoDB 8 can't start on this Linux kernel (SERVER-121912). Docker Desktop 4.93 or newer ships 7.0.14, which it accepts.",
      });
    }
    return this.mongoImage;
  }

  private async hasImage(ref: string): Promise<boolean> {
    try {
      await this.docker.getImage(ref).inspect();
      return true;
    } catch {
      return false;
    }
  }

  /** Pulls an image by digest the first time it's needed. Running never needs the internet. */
  private async pull(image: { ref: string; tag: string }): Promise<void> {
    if (await this.hasImage(image.ref)) return;
    this.log.info("db.pull", { image: image.tag });
    try {
      const stream = await this.docker.pull(image.ref);
      await new Promise<void>((resolve, reject) => this.docker.modem.followProgress(stream, (err: Error | null) => (err ? reject(err) : resolve())));
    } catch (err) {
      throw new DbError(503, "image_missing", `Couldn't download ${image.tag} (${(err as Error).message}). Connect to the internet once, then try again.`);
    }
  }

  private async ensureNetwork(): Promise<void> {
    const found = await this.docker.listNetworks({ filters: { name: [this.network] } });
    if (found.some((n) => n.Name === this.network)) return;
    try {
      // Internal: no gateway, so no internet, no host.docker.internal, and no route to the app or the runner.
      await this.docker.createNetwork({ Name: this.network, Driver: "bridge", Internal: true, CheckDuplicate: true, Labels: labelsFor(this.owner, "db") });
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 409) throw err;
    }
  }

  /** Makes the volume when it's missing or another data folder's. Answers whether it made one. */
  private async ensureVolume(name: string): Promise<boolean> {
    try {
      const v = await this.docker.getVolume(name).inspect();
      if (v.Labels?.["hu.instance"] === this.secrets.instance) return false;
      // Its data belongs to a data folder that is gone, with every workspace that used it.
      this.log.warn("db.volume_replaced", { name });
      for (const c of await this.docker.listContainers({ all: true, filters: { volume: [name] } })) {
        await this.docker.getContainer(c.Id).remove({ force: true });
      }
      await this.docker.getVolume(name).remove();
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 404) throw err;
    }
    await this.docker.createVolume({ Name: name, Labels: { ...labelsFor(this.owner, "db"), "hu.instance": this.secrets.instance } });
    return true;
  }

  private async inspect(name: string): Promise<Docker.ContainerInspectInfo | null> {
    try {
      return await this.docker.getContainer(name).inspect();
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) return null;
      throw err;
    }
  }

  /** Reads what Docker has, for /v1/health and after Docker comes back. */
  async refresh(): Promise<void> {
    for (const kind of ["postgres", "mongo"] as DbKind[]) {
      const info = await this.inspect(this.containerName(kind)).catch(() => null);
      const state: ServiceState = info ? (info.State.Running ? "running" : "stopped") : "absent";
      this.states.set(kind, state);
      if (state !== "running" && this.up.has(kind)) {
        this.up.delete(kind);
        (kind === "postgres" ? this.pg : this.mongo).close();
      }
    }
  }

  /** Whether anything besides the servers is on the network: a workspace, a check, or a run. */
  private async othersOnNetwork(): Promise<boolean> {
    try {
      const net = await this.docker.getNetwork(this.network).inspect();
      const ours = new Set([this.names.postgres, this.names.mongo]);
      return Object.values((net.Containers ?? {}) as Record<string, { Name: string }>).some((c) => !ours.has(c.Name));
    } catch {
      return false;
    }
  }

  /** Stops a server that nothing has used for HU_DB_IDLE_MS. Its data stays in its volume. */
  async stopIdle(now = Date.now(), inUse: (kind: DbKind) => boolean = () => false): Promise<DbKind[]> {
    const stopped: DbKind[] = [];
    for (const kind of [...this.up]) {
      if ((this.busy.get(kind) ?? 0) > 0 || inUse(kind)) continue;
      if (now - (this.lastUsed.get(kind) ?? now) < this.idleMs) continue;
      if (await this.othersOnNetwork()) {
        this.touch(kind);
        continue;
      }
      await this.stop(kind);
      stopped.push(kind);
      this.log.info("db.idle_stop", { kind });
    }
    return stopped;
  }

  async stop(kind: DbKind): Promise<void> {
    this.up.delete(kind);
    (kind === "postgres" ? this.pg : this.mongo).close();
    await this.docker
      .getContainer(this.containerName(kind))
      .stop({ t: 10 })
      .catch(() => {});
    this.states.set(kind, (await this.inspect(this.containerName(kind)).catch(() => null)) ? "stopped" : "absent");
  }

  /**
   * On Ctrl+C: a learner's servers stop (their data stays), and a verify
   * runner's servers, volumes, and network are removed.
   */
  async shutdown(): Promise<void> {
    this.pg.close();
    this.mongo.close();
    const remove = this.owner.ns === "verify";
    for (const kind of ["postgres", "mongo"] as DbKind[]) {
      this.up.delete(kind);
      const c = this.docker.getContainer(this.containerName(kind));
      if (remove) await c.remove({ force: true, v: true }).catch(() => {});
      else await c.stop({ t: 10 }).catch(() => {});
    }
    if (!remove) return;
    for (const v of [this.names.pgVolume, this.names.mongoVolume]) await this.docker.getVolume(v).remove().catch(() => {});
    await this.docker
      .getNetwork(this.network)
      .remove()
      .catch(() => {});
  }
}
