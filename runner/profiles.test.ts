import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LABEL, labelsFor, managedFilter, namePrefix } from "./docker.ts";
import {
  MEMORY_FLOOR_BYTES,
  SCRIPT_JOB,
  SYSADMIN_CAPS,
  belowFloor,
  capabilityMask,
  jobProfile,
  standardProfile,
  sysadminProfile,
  WORKSPACE_LIMITS,
} from "./profiles.ts";

const MiB = 1024 * 1024;
const owner = { ns: "live" as const, boot: "b00t", port: 3100 };

describe("script job limits (architecture §11.3)", () => {
  it("are 512 MB, 1 CPU, 128 processes, 64 MB of space, 30 s to compile, 10 s to run, 1 MB per stream", () => {
    assert.deepEqual(SCRIPT_JOB, {
      memoryBytes: 512 * MiB,
      cpus: 1,
      pids: 128,
      workBytes: 64 * MiB,
      fsizeBytes: 64 * MiB,
      compileMs: 30_000,
      runMs: 10_000,
      outputBytes: 1 * MiB,
    });
  });
});

describe("the job profile (architecture §11.2)", () => {
  const options = jobProfile({
    name: "hu-job-1",
    image: "hu/node:abc",
    labels: labelsFor(owner, "job"),
    workDir: "/work",
    hostname: "workspace",
    env: ["HOME=/home/learner"],
    limits: SCRIPT_JOB,
  });
  const host = options.HostConfig as Record<string, unknown>;

  it("runs as learner, with no privileges and a read-only root", () => {
    assert.equal(options.User, "1000:1000");
    assert.deepEqual(options.Cmd, ["/opt/hu/bin/hu-exec", "--idle"]);
    assert.equal(host.Init, true);
    assert.equal(host.Privileged, false);
    assert.equal(host.ReadonlyRootfs, true);
    assert.deepEqual(host.CapDrop, ["ALL"]);
    assert.equal(host.CapAdd, undefined);
    assert.deepEqual(host.SecurityOpt, ["no-new-privileges"]);
    assert.equal(host.IpcMode, "private");
    assert.equal(host.CgroupnsMode, "private");
  });

  it("has no network, no published ports, no mounts, and no extra hosts", () => {
    assert.equal(host.NetworkMode, "none");
    for (const key of ["PortBindings", "Mounts", "Binds", "Devices", "ExtraHosts", "Sysctls", "PublishAllPorts"]) assert.equal(host[key], undefined, key);
    assert.equal(options.ExposedPorts, undefined);
  });

  it("has hard limits: memory without swap, CPU, processes, file size, and tmpfs space", () => {
    assert.equal(host.Memory, 512 * MiB);
    assert.equal(host.MemorySwap, 512 * MiB);
    assert.equal((host.CpuQuota as number) / (host.CpuPeriod as number), 1);
    assert.equal(host.PidsLimit, 128);
    assert.equal(host.OomScoreAdj, 500);
    assert.deepEqual(host.Ulimits, [
      { Name: "nofile", Soft: 4096, Hard: 8192 },
      { Name: "fsize", Soft: 64 * MiB, Hard: 64 * MiB },
    ]);
    const tmpfs = host.Tmpfs as Record<string, string>;
    assert.match(tmpfs["/work"], /^rw,exec,nosuid,nodev,size=67108864,/);
    assert.match(tmpfs["/tmp"], /noexec,nosuid,nodev,size=67108864/);
  });
});

describe("workspace profiles (architecture §11.2)", () => {
  it("standard: learner, every capability dropped, a bind mount and a home volume", () => {
    const o = standardProfile({
      name: "hv-ws-1",
      image: "hu/node:abc",
      labels: {},
      env: [],
      filesDir: "/Users/me/.hack-university/workspaces/w/files",
      homeVolume: "hv-ws-1-home",
      limits: WORKSPACE_LIMITS.typescript,
    });
    const host = o.HostConfig as Record<string, unknown>;
    assert.equal(o.User, "1000:1000");
    assert.deepEqual(o.Cmd, ["/opt/hu/bin/hu-init"]);
    assert.deepEqual(host.CapDrop, ["ALL"]);
    assert.deepEqual(host.SecurityOpt, ["no-new-privileges"]);
    assert.equal(host.NetworkMode, "none");
    assert.equal(host.Memory, 1024 * MiB);
    assert.equal(host.NanoCpus, 2e9);
    assert.equal(host.PidsLimit, 512);
    assert.deepEqual((host.Mounts as { Target: string }[]).map((m) => m.Target), ["/workspace", "/home/learner"]);
  });

  it("sysadmin: root with Docker's defaults minus NET_RAW, MKNOD, SYS_CHROOT, and SETFCAP, and no host mounts", () => {
    const o = sysadminProfile({ name: "hv-ws-2", image: "hu/bash:abc", labels: {}, env: [], volumes: { files: "f", srv: "s", cron: "c" } });
    const host = o.HostConfig as Record<string, unknown>;
    assert.equal(o.User, "0:0");
    assert.equal(o.Hostname, "devbox");
    assert.deepEqual(host.CapDrop, ["ALL"]);
    assert.deepEqual(host.CapAdd, SYSADMIN_CAPS);
    for (const cap of ["NET_RAW", "MKNOD", "SYS_CHROOT", "SETFCAP"]) assert.equal(SYSADMIN_CAPS.includes(cap), false, cap);
    assert.equal(host.SecurityOpt, undefined);
    assert.equal(host.Memory, 512 * MiB);
    assert.deepEqual((host.Mounts as { Type: string }[]).map((m) => m.Type), ["volume", "volume", "volume"]);
  });

  it("knows the capability bits each profile ends up with", () => {
    assert.equal(capabilityMask([]), 0n);
    assert.equal(capabilityMask(SYSADMIN_CAPS).toString(16), "200000fb");
  });
});

describe("labels (architecture §5.3)", () => {
  it("mark every object as managed, with its kind, namespace, boot, and port", () => {
    assert.deepEqual(labelsFor(owner, "job", { [LABEL.recipe]: "bash" }), {
      "hu.managed": "1",
      "hu.kind": "job",
      "hu.ns": "live",
      "hu.runner": "b00t",
      "hu.port": "3100",
      "hu.recipe": "bash",
    });
  });

  it("keep the verifiers in their own namespace and names", () => {
    assert.equal(namePrefix("live"), "hu");
    assert.equal(namePrefix("verify"), "hv");
    assert.deepEqual(managedFilter("verify", "job"), { label: ["hu.managed=1", "hu.ns=verify", "hu.kind=job"] });
    assert.deepEqual(managedFilter("live"), { label: ["hu.managed=1", "hu.ns=live"] });
  });
});

describe("the memory floor", () => {
  it("is 7.75 GiB, and the VM's reported MemTotal at that setting meets it", () => {
    assert.equal(MEMORY_FLOOR_BYTES, 7.75 * 1024 ** 3);
    assert.equal(belowFloor(8_318_976_000), false);
    assert.equal(belowFloor(6 * 1024 ** 3), true);
  });
});
