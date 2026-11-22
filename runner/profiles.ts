import type Docker from "dockerode";

/**
 * The job profile and its limits, exactly as architecture §11.2 and §11.3 set
 * them. Every TypeScript and Bash run is a job: a container with no added
 * privileges, a read-only root, no network, and hard limits: memory with no
 * swap, CPUs, processes, open files, and file size.
 */

/** Docker's HostConfig, plus the cgroup namespace mode @types/dockerode doesn't list yet. */
type HostConfig = Docker.HostConfig & { CgroupnsMode?: "private" | "host" };

const MiB = 1024 * 1024;

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

/** §11.3, "Job: TypeScript and Bash scripts". */
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

/** Docker's memory floor, the one threshold shared with up.mjs. */
export { MEMORY_FLOOR_BYTES, belowFloor } from "../lib/docker-memory.mjs";

export interface JobContainer {
  name: string;
  image: string;
  labels: Record<string, string>;
  /** Where the job's files live: a tmpfs that allows exec. */
  workDir: string;
  hostname: string;
  env: string[];
  limits: JobLimits;
}

/**
 * The `job` profile (§11.2): a tmpfs work folder with exec, a /tmp without,
 * network none, and a deadline kill. The main process is hu-exec --idle
 * under tini. Steps run as execs.
 */
export function jobProfile(job: JobContainer): Docker.ContainerCreateOptions {
  const { limits } = job;
  const host: HostConfig = {
    Init: true,
    ReadonlyRootfs: true,
    Privileged: false,
    CapDrop: ["ALL"],
    SecurityOpt: ["no-new-privileges"],
    NetworkMode: "none",
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
