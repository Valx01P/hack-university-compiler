import type Docker from "dockerode";

/**
 * Container profiles and limits, exactly as architecture §11.2 and §11.3 set
 * them. Every learner container runs with no added privileges, a read-only
 * root, no network (or the internal hu-db network), and hard limits:
 * memory with no swap, CPUs, processes, open files, and file size.
 *
 * P0 runs only jobs. The standard and sysadmin workspace profiles are built
 * here too, so verify-security can hold them to S1 and S2 before P1 uses them.
 */

/** Docker's HostConfig, plus the cgroup namespace mode @types/dockerode doesn't list yet. */
type HostConfig = Docker.HostConfig & { CgroupnsMode?: "private" | "host" };

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

export interface JobLimits {
  memoryBytes: number;
  cpus: number;
  pids: number;
  /** Size of /work (and /tmp): writable space is tmpfs, counted as memory. */
  workBytes: number;
  /** The largest file a process may write (RLIMIT_FSIZE). */
  fsizeBytes: number;
  /** A compile step's deadline, when the recipe has one. */
  compileMs: number;
  /** Each run step's deadline. */
  runMs: number;
  /** The cap on each of stdout and stderr, per step. */
  outputBytes: number;
}

/** §11.3, "Job: TypeScript, Bash, Express and Next.js scripts". */
export const SCRIPT_JOB: JobLimits = {
  memoryBytes: 512 * MiB,
  cpus: 1,
  pids: 128,
  workBytes: 64 * MiB,
  fsizeBytes: 64 * MiB,
  compileMs: 30_000,
  runMs: 10_000,
  outputBytes: 1 * MiB,
};

/** The workspace limits of §11.3 that P0's profiles use. */
export const WORKSPACE_LIMITS = {
  typescript: { memoryBytes: 1 * GiB, cpus: 2, pids: 512, fsizeBytes: 512 * MiB, tmpBytes: 256 * MiB },
  bash: { memoryBytes: 512 * MiB, cpus: 1, pids: 256, fsizeBytes: 256 * MiB, tmpBytes: 256 * MiB },
} as const;

/** The reserved check slot for the course open in a visible tab (§4.7). */
export const CHECK_SLOT_BYTES = { bash: 512 * MiB, typescript: 1 * GiB } as const;

/** Docker's memory floor, the one threshold shared with up.mjs and the IDE. */
export { MEMORY_FLOOR_BYTES, belowFloor } from "../lib/docker-memory.mjs";

/** Memory a running hu-piston can take (its mem_limit in docker-compose.yml). */
export const PISTON_BYTES = 2 * GiB;
/** Headroom the memory budget keeps free for the VM itself. */
export const HEADROOM_BYTES = 512 * MiB;

export interface JobContainer {
  name: string;
  image: string;
  labels: Record<string, string>;
  /** Where the job's files live: a tmpfs that allows exec. */
  workDir: string;
  hostname: string;
  env: string[];
  limits: JobLimits;
  /** The internal database network (hu-db) for a run with a database. Network none otherwise. */
  network?: string;
}

/**
 * The `job` profile (§11.2): `standard` without the bind mount, a tmpfs work
 * folder with exec, network none, and a deadline kill. The main process is
 * hu-exec --idle under tini. Steps run as execs.
 */
export function jobProfile(job: JobContainer): Docker.ContainerCreateOptions {
  const { limits } = job;
  const host: HostConfig = {
    Init: true,
    ReadonlyRootfs: true,
    Privileged: false,
    CapDrop: ["ALL"],
    SecurityOpt: ["no-new-privileges"],
    NetworkMode: job.network ?? "none",
    IpcMode: "private",
    CgroupnsMode: "private",
    Memory: limits.memoryBytes,
    MemorySwap: limits.memoryBytes,
    // The same CPU limit as NanoCpus, counted over 1 s instead of Docker's
    // 100 ms. A job is a burst: tsc checks on several threads for about 50 ms,
    // which a 100 ms window throttles into 90 to 170 ms. A busy loop still
    // gets `cpus` CPUs on average, never more.
    CpuPeriod: 1_000_000,
    CpuQuota: limits.cpus * 1_000_000,
    PidsLimit: limits.pids,
    OomScoreAdj: 500,
    ShmSize: 64 * MiB,
    Ulimits: [
      { Name: "nofile", Soft: 4096, Hard: 8192 },
      { Name: "fsize", Soft: limits.fsizeBytes, Hard: limits.fsizeBytes },
    ],
    Tmpfs: {
      [job.workDir]: `rw,exec,nosuid,nodev,size=${limits.workBytes},mode=0755,uid=1000,gid=1000`,
      "/tmp": `rw,noexec,nosuid,nodev,size=${limits.workBytes},mode=1777`,
    },
    LogConfig: { Type: "none", Config: {} },
  };
  return {
    name: job.name,
    Image: job.image,
    Cmd: ["/opt/hu/bin/hu-exec", "--idle"],
    User: "1000:1000",
    WorkingDir: job.workDir,
    Hostname: job.hostname,
    Env: job.env,
    Labels: job.labels,
    HostConfig: host,
  };
}

export interface WorkspaceContainer {
  name: string;
  image: string;
  labels: Record<string, string>;
  env: string[];
  /** The workspace's files on the Mac, bind-mounted at /workspace. */
  filesDir: string;
  /** The volume for /home/learner. */
  homeVolume: string;
  limits: (typeof WORKSPACE_LIMITS)["typescript"];
  /** none, or the database network (hu-db, or a verify runner's own). */
  network?: string;
}

/** The `standard` profile (§11.2), for every code-course workspace. */
export function standardProfile(ws: WorkspaceContainer): Docker.ContainerCreateOptions {
  const { limits } = ws;
  const host: HostConfig = {
    Init: true,
    ReadonlyRootfs: true,
    Privileged: false,
    CapDrop: ["ALL"],
    SecurityOpt: ["no-new-privileges"],
    NetworkMode: ws.network ?? "none",
    IpcMode: "private",
    CgroupnsMode: "private",
    Memory: limits.memoryBytes,
    MemorySwap: limits.memoryBytes,
    NanoCpus: limits.cpus * 1e9,
    PidsLimit: limits.pids,
    OomScoreAdj: 500,
    ShmSize: 64 * MiB,
    Ulimits: [
      { Name: "nofile", Soft: 4096, Hard: 8192 },
      { Name: "fsize", Soft: limits.fsizeBytes, Hard: limits.fsizeBytes },
    ],
    Tmpfs: { "/tmp": `rw,nosuid,nodev,size=${limits.tmpBytes},mode=1777` },
    Mounts: [
      { Type: "bind", Source: ws.filesDir, Target: "/workspace" },
      { Type: "volume", Source: ws.homeVolume, Target: "/home/learner" },
    ],
    LogConfig: { Type: "none", Config: {} },
  };
  return {
    name: ws.name,
    Image: ws.image,
    User: "1000:1000",
    WorkingDir: "/workspace",
    Hostname: "workspace",
    Cmd: ["/opt/hu/bin/hu-init"],
    Env: ws.env,
    Labels: ws.labels,
    HostConfig: host,
    StopTimeout: 5,
  };
}

export interface SysadminContainer {
  name: string;
  image: string;
  labels: Record<string, string>;
  env: string[];
  /** Volumes for /home/learner, /srv, and the cron spool. No host mounts at all. */
  volumes: { files: string; srv: string; cron: string };
}

/** Root inside, with Docker's default capabilities minus NET_RAW, MKNOD,
    SYS_CHROOT, and SETFCAP, for the Bash course's workspaces only. sudo is
    setuid, so no-new-privileges stays off here and nowhere else. */
export const SYSADMIN_CAPS = ["CHOWN", "DAC_OVERRIDE", "FOWNER", "FSETID", "KILL", "SETUID", "SETGID", "AUDIT_WRITE"];

/** The `sysadmin` profile (§11.2), for Bash workspaces. */
export function sysadminProfile(ws: SysadminContainer): Docker.ContainerCreateOptions {
  const limits = WORKSPACE_LIMITS.bash;
  const host: HostConfig = {
    Init: true,
    ReadonlyRootfs: true,
    Privileged: false,
    CapDrop: ["ALL"],
    CapAdd: SYSADMIN_CAPS,
    NetworkMode: "none",
    IpcMode: "private",
    CgroupnsMode: "private",
    Memory: limits.memoryBytes,
    MemorySwap: limits.memoryBytes,
    NanoCpus: limits.cpus * 1e9,
    PidsLimit: limits.pids,
    OomScoreAdj: 500,
    Ulimits: [{ Name: "fsize", Soft: limits.fsizeBytes, Hard: limits.fsizeBytes }],
    Tmpfs: { "/tmp": `rw,nosuid,nodev,size=${limits.tmpBytes},mode=1777`, "/run": "rw,nosuid,nodev,size=16m" },
    Mounts: [
      { Type: "volume", Source: ws.volumes.files, Target: "/home/learner" },
      { Type: "volume", Source: ws.volumes.srv, Target: "/srv" },
      { Type: "volume", Source: ws.volumes.cron, Target: "/var/spool/cron/crontabs" },
    ],
    LogConfig: { Type: "none", Config: {} },
  };
  return {
    name: ws.name,
    Image: ws.image,
    User: "0:0",
    Hostname: "devbox",
    WorkingDir: "/home/learner",
    Cmd: ["/opt/hu/bin/hu-init"],
    Env: ws.env,
    Labels: ws.labels,
    HostConfig: host,
    StopTimeout: 5,
  };
}

/** The Linux capability bits a profile's processes end up with (CapEff). */
export function capabilityMask(caps: string[]): bigint {
  const bits: Record<string, number> = {
    CHOWN: 0,
    DAC_OVERRIDE: 1,
    DAC_READ_SEARCH: 2,
    FOWNER: 3,
    FSETID: 4,
    KILL: 5,
    SETGID: 6,
    SETUID: 7,
    SETPCAP: 8,
    NET_BIND_SERVICE: 10,
    NET_RAW: 13,
    SYS_CHROOT: 18,
    MKNOD: 27,
    AUDIT_WRITE: 29,
    SETFCAP: 31,
  };
  let mask = 0n;
  for (const cap of caps) mask |= 1n << BigInt(bits[cap]);
  return mask;
}
