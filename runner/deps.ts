import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type Docker from "dockerode";
import type { Capacity } from "./capacity.ts";
import { LABEL, type Owner } from "./docker.ts";
import { HttpError } from "./http-util.ts";
import type { ImageName, Images } from "./images.ts";
import { Job, type JobPool } from "./jobs.ts";
import type { Log } from "./log.ts";
import type { JobLimits, VolumeMount } from "./profiles.ts";
import { isStack, stack } from "./stacks.ts";
import type { HostFs, Manifest } from "./storage/host.ts";
import type { TarEntry } from "./tar.ts";

/**
 * Dependencies and caches (architecture §4.4): a workspace's packages live in
 * Docker volumes, never in its files on the Mac.
 *
 * - npm and uv: one shared volume per lockfile, hu-deps-<kind>-<lockhash>
 *   (the first 12 hex characters of the template lockfile's SHA-256), filled
 *   once by a job that runs the stack's install command offline from the
 *   image's cache, then mounted read-only at the stack's target
 *   (/workspace/node_modules, /deps/venv) by every workspace, check, and
 *   template build with that lockfile. A template whose deps.mode is "own" (a
 *   playground, an npm install lesson) gets a volume of its own,
 *   hu-ws-<id>-deps, filled the same way from its own files and mounted
 *   read-write.
 * - Maven and Go fill nothing: the image's read-only repository (Maven's
 *   tail, so ./mvnw -o works) and its file module proxy (GOPROXY) are the
 *   cache. Go containers share hu-go-build for GOCACHE and GOMODCACHE, which
 *   Docker seeds from the image the first time it is mounted.
 *
 * A fill holds the volume's lock, so two starts never fill it twice, and its
 * last step writes .hu-deps into the volume: a fill a crash cut short is
 * wiped and run again. HU_DATA_DIR/deps.json remembers the volumes this
 * runner filled (by the random hu.made label each gets when it is made, so a
 * volume removed and made again is filled again) and when each was last
 * used. Shared volumes unused for 30 days go, and fill again when a
 * workspace needs them. A verify runner's volumes are
 * hv-deps-<home>-<kind>-<lockhash>, removed when it stops.
 */

const MiB = 1024 * 1024;
const DAY = 24 * 3_600_000;
const PRUNE_AFTER_MS = 30 * DAY;
const MARKER = ".hu-deps";
/** The label with a random id a volume gets when it is made (Docker's CreatedAt has whole seconds). */
const MADE = "hu.made";

/** The fill job's limits: 1.5 GiB and 2 CPUs, like a template build's, and five minutes. */
const FILL_LIMITS: JobLimits = {
  memoryBytes: 1536 * MiB,
  cpus: 2,
  pids: 512,
  workBytes: 512 * MiB,
  fsizeBytes: 512 * MiB,
  compileMs: 0,
  runMs: 5 * 60_000,
  outputBytes: 256 * 1024,
};

/**
 * Empties the volume unless an earlier fill finished ($MARKER), runs the
 * install command, and marks the volume filled. The target is a mount
 * point, so its contents go, never the folder itself.
 */
const FILL = [
  't=$1; shift',
  `[ -f "$t/${MARKER}" ] && exit 0`,
  'find "$t" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +',
  '"$@" || exit',
  `echo "$HU_DEPS" > "$t/${MARKER}"`,
].join("\n");

/** The files an install reads, beside the lockfile, by kind. */
const INPUTS: Record<"npm" | "uv", string[]> = {
  npm: ["package.json", ".npmrc"],
  uv: ["pyproject.toml", ".python-version"],
};

/** What template.json says under `deps` (§6.7). */
export interface DepsConfig {
  kind?: string;
  lock?: string;
  mode?: "shared" | "own";
}

/** A workspace's dependency volume: which one, where it mounts, and how it fills. */
export interface DepsPlan {
  kind: "npm" | "uv";
  lockfile: string;
  /** Where the volume mounts. */
  target: string;
  /** The stack's install command. */
  install: string;
  /** The image whose offline cache fills it. */
  image: ImageName;
  volume: string;
  /** The workspace's own (deps.mode "own"): mounted read-write, filled from its own files. */
  own: boolean;
  /** The lockfile's hash: the shared volume's name ends with it. */
  hash: string;
  labels: Record<string, string>;
}

interface Filled {
  /** The hu.made label of the volume this record is about. */
  made: string;
  filledAt: number;
  usedAt: number;
  /** A workspace's own volume: it goes with its workspace, never by age. */
  own?: true;
}

interface State {
  version: 1;
  volumes: Record<string, Filled>;
}

export class DepsError extends HttpError {}

export interface DepsDeps {
  docker: () => Docker;
  owner: Owner;
  images: Images;
  log: Log;
  dataDir: string;
  /** 8 hex characters of the data folder, for a verify runner's names and labels. */
  home: string;
  pool?: JobPool;
  capacity?: Capacity;
}

export class Deps {
  private readonly d: DepsDeps;
  private readonly file: string;
  private state: State;
  private readonly locks = new Map<string, Promise<void>>();
  private lastPrune = 0;

  constructor(deps: DepsDeps) {
    this.d = deps;
    this.file = path.join(deps.dataDir, "deps.json");
    this.state = this.load();
  }

  private load(): State {
    try {
      const s = JSON.parse(fs.readFileSync(this.file, "utf8")) as State;
      if (s.version === 1 && s.volumes) return s;
    } catch {
      /* none yet */
    }
    return { version: 1, volumes: {} };
  }

  private save() {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(this.state, null, 1)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  private get verify(): boolean {
    return this.d.owner.ns === "verify";
  }

  /** A shared volume's name: hu-deps-npm-3f2a91c0d4e7, or hv-deps-<home>-npm-3f2a91c0d4e7 for a verify runner. */
  sharedName(kind: string, hash: string): string {
    return this.verify ? `hv-deps-${this.d.home}-${kind}-${hash}` : `hu-deps-${kind}-${hash}`;
  }

  /** A stack's shared cache (hu-go-build), or hv-go-build-<home> for a verify runner. */
  cacheName(name: string): string {
    return this.verify ? `hv-${name.replace(/^hu-/, "")}-${this.d.home}` : name;
  }

  private labels(extra: Record<string, string> = {}): Record<string, string> {
    return { [LABEL.managed]: "1", [LABEL.ns]: this.d.owner.ns, [LABEL.kind]: "deps", [LABEL.home]: this.d.home, ...extra };
  }

  /**
   * The workspace's dependency volume, or null when its stack has none to
   * fill (Maven, Go, Bash), its template declares no `deps`, or the
   * lockfile is missing. A shared volume is named by the template's
   * lockfile (the manifest's hash of it). An own one is the workspace's.
   */
  plan(course: string, config: DepsConfig | null, manifest: Manifest, own: { volume: string; labels: Record<string, string> }): DepsPlan | null {
    if (!config || !isStack(course)) return null;
    const s = stack(course);
    const kind = s.deps.kind;
    if ((kind !== "npm" && kind !== "uv") || !s.deps.target || !s.commands.install) return null;
    const lockfile = config.lock ?? s.deps.lockfile ?? "";
    const entry = manifest[lockfile];
    if (!entry || entry.type !== "file" || !entry.sha256) return null;
    const hash = entry.sha256.slice(0, 12);
    const isOwn = config.mode === "own";
    return {
      kind,
      lockfile,
      target: s.deps.target,
      install: s.commands.install,
      image: s.deps.image ?? s.image,
      volume: isOwn ? own.volume : this.sharedName(kind, hash),
      own: isOwn,
      hash,
      labels: isOwn ? own.labels : this.labels({ [LABEL.hash]: hash }),
    };
  }

  /**
   * The mounts for a container: the dependency volume (read-only when
   * shared) and the stack's shared caches. `workdir` moves a target under
   * /workspace to the container's own folder (a check's /work).
   */
  async mounts(course: string, plan: DepsPlan | null, workdir = "/workspace"): Promise<VolumeMount[]> {
    const out: VolumeMount[] = [];
    if (plan) {
      const target = plan.target.startsWith("/workspace/") ? `${workdir}${plan.target.slice("/workspace".length)}` : plan.target;
      out.push({ source: plan.volume, target, readOnly: !plan.own });
      this.used(plan.volume);
    }
    if (isStack(course)) {
      for (const v of stack(course).volumes ?? []) {
        const source = this.cacheName(v.name);
        await this.create(source, this.labels());
        out.push({ source, target: v.target });
      }
    }
    return out;
  }

  /** Makes a volume with these labels unless it exists. Answers its hu.made label ("" for one made elsewhere). */
  private async create(name: string, labels: Record<string, string>): Promise<string> {
    const docker = this.d.docker();
    const made = (info: unknown) => String((info as { Labels?: Record<string, string> } | null)?.Labels?.[MADE] ?? "");
    const info = await docker
      .getVolume(name)
      .inspect()
      .catch(() => null);
    if (info) return made(info);
    await docker.createVolume({ Name: name, Labels: { ...labels, [MADE]: randomBytes(6).toString("hex") } }).catch((err: { statusCode?: number }) => {
      // Another runner made it meanwhile: it's there either way.
      if (err.statusCode !== 409) throw err;
    });
    return made(await docker.getVolume(name).inspect());
  }

  /**
   * Fills the plan's volume unless this runner already did, one fill per
   * volume at a time. `files` is where the lockfile and what the install
   * reads come from: the template's original for a shared volume, the
   * workspace's own files for its own.
   */
  ensure(plan: DepsPlan, files: HostFs, env: string[] = []): Promise<void> {
    const before = this.locks.get(plan.volume) ?? Promise.resolve();
    const run = before.catch(() => {}).then(() => this.ensureNow(plan, files, env));
    this.locks.set(plan.volume, run);
    void run
      .finally(() => {
        if (this.locks.get(plan.volume) === run) this.locks.delete(plan.volume);
      })
      .catch(() => {});
    return run;
  }

  /** Whether a fill is under way for this volume (the IDE says so while it waits). */
  filling(volume: string): boolean {
    return this.locks.has(volume);
  }

  private async ensureNow(plan: DepsPlan, files: HostFs, env: string[]): Promise<void> {
    const made = await this.create(plan.volume, plan.labels);
    const rec = this.state.volumes[plan.volume];
    if (rec && made && rec.made === made) {
      this.used(plan.volume);
      return;
    }
    const started = Date.now();
    await this.fill(plan, files, env);
    this.state.volumes[plan.volume] = { made, filledAt: Date.now(), usedAt: Date.now(), ...(plan.own ? { own: true as const } : {}) };
    this.save();
    this.d.log.info("deps.filled", { volume: plan.volume, kind: plan.kind, own: plan.own, ms: Date.now() - started });
  }

  /** The files an install reads, read from `files` (links and missing files left out). */
  inputs(plan: DepsPlan, files: HostFs): TarEntry[] {
    const out: TarEntry[] = [];
    for (const rel of [...INPUTS[plan.kind], plan.lockfile]) {
      const st = files.lstat(rel);
      if (!st || !st.isFile()) continue;
      const { data, mode } = files.readFile(rel, 64 * MiB);
      out.push({ path: rel, type: "file", data, mode });
    }
    return out;
  }

  /** One fill: a job from the image with the cache, the volume on the target, the install command offline. */
  private async fill(plan: DepsPlan, files: HostFs, env: string[]): Promise<void> {
    const { images, docker, owner, log } = this.d;
    if (images.state(plan.image) !== "ready") await images.refresh();
    if (images.state(plan.image) !== "ready") {
      throw new DepsError(503, "image_missing", `The dependencies install from hu/${plan.image}, which isn't built yet. Prepare this course first (npm run images -- ${plan.image}).`);
    }
    const entries = this.inputs(plan, files);
    if (!entries.some((e) => e.path === plan.lockfile)) throw new DepsError(500, "deps_failed", `${plan.lockfile} is missing, so the dependencies can't install.`);
    const release = this.d.capacity ? await this.d.capacity.admitCheck(FILL_LIMITS.memoryBytes) : () => {};
    const run = async () => {
      const job = await Job.start(
        docker(),
        owner,
        {
          image: images.tag(plan.image),
          recipe: "deps",
          workDir: "/workspace",
          hostname: "workspace",
          env: ["HOME=/tmp", "TZ=UTC", "LANG=C.UTF-8", `HU_DEPS=${plan.hash}`, ...env],
          limits: FILL_LIMITS,
          deadlineMs: FILL_LIMITS.runMs + 60_000,
          mounts: [{ source: plan.volume, target: plan.target }],
        },
        log
      );
      try {
        await job.load("/workspace", entries);
        const r = await job.step(["sh", "-c", FILL, "sh", plan.target, "sh", "-c", plan.install], {
          workDir: "/workspace",
          env: ["HOME=/tmp", "TZ=UTC", "LANG=C.UTF-8", `HU_DEPS=${plan.hash}`, ...env],
          timeoutMs: FILL_LIMITS.runMs,
          maxBytes: FILL_LIMITS.outputBytes,
        });
        if (r.code !== 0) {
          const tail = r.output.trim().split("\n").slice(-12).join("\n");
          log.warn("deps.fill_failed", { volume: plan.volume, code: r.code, status: r.status, output: tail.slice(-2000) });
          throw new DepsError(500, "deps_failed", `The dependencies didn't install (${plan.install}): ${tail || r.message || "no output"}`);
        }
      } finally {
        await job.dispose();
      }
    };
    try {
      await (this.d.pool ? this.d.pool.run(run) : run());
    } finally {
      release();
    }
  }

  private used(volume: string) {
    const rec = this.state.volumes[volume];
    if (!rec) return;
    const stale = Date.now() - rec.usedAt > 60_000;
    rec.usedAt = Date.now();
    if (stale) this.save();
  }

  /** Forgets a workspace's own volume (it was removed with the workspace). */
  forget(volume: string) {
    if (!this.state.volumes[volume]) return;
    delete this.state.volumes[volume];
    this.save();
  }

  /** Hourly: shared volumes unused for 30 days go (Docker refuses one a container still uses). */
  async prune(now = Date.now()): Promise<string[]> {
    if (now - this.lastPrune < 3_600_000) return [];
    this.lastPrune = now;
    const removed: string[] = [];
    for (const [name, rec] of Object.entries(this.state.volumes)) {
      if (rec.own || now - rec.usedAt < PRUNE_AFTER_MS || this.locks.has(name)) continue;
      const gone = await this.d
        .docker()
        .getVolume(name)
        .remove()
        .then(
          () => true,
          (err: { statusCode?: number }) => err.statusCode === 404
        );
      if (!gone) continue;
      delete this.state.volumes[name];
      removed.push(name);
    }
    if (removed.length) {
      this.save();
      this.d.log.info("deps.pruned", { volumes: removed.join(" ") });
    }
    return removed;
  }

  /** A verify runner removes the shared volumes and caches it made when it stops. */
  async shutdown(): Promise<void> {
    if (!this.verify) return;
    const docker = this.d.docker();
    const list = await docker
      .listVolumes({ filters: { label: [`${LABEL.kind}=deps`, `${LABEL.ns}=verify`, `${LABEL.home}=${this.d.home}`] } })
      .catch(() => null);
    for (const v of list?.Volumes ?? []) {
      await docker
        .getVolume(v.Name)
        .remove()
        .then(() => delete this.state.volumes[v.Name])
        .catch(() => {});
    }
    this.save();
  }
}
