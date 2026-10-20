import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import type Docker from "dockerode";
import { ROOT } from "./config.ts";
import { Deps, type DepsPlan } from "./deps.ts";
import { LABEL, connect, resolveEndpoint, type Owner } from "./docker.ts";
import { Images } from "./images.ts";
import { quietLog, type Log } from "./log.ts";
import { HostFs, buildManifest } from "./storage/host.ts";
import { expand } from "./workspaces.ts";

/**
 * Dependency volumes (deps.ts, architecture §4.4): their names, mounts, and
 * plans without Docker, then real fills in the verify namespace, on the
 * TypeScript playground fixture's lockfile, from hu/web's cache. The Docker
 * part is skipped when Docker is off or hu/web isn't built.
 */

const HOME = "abcd1234";
const LOCK = `e53825f19fa4${"0".repeat(52)}`;
const MANIFEST = { "package-lock.json": { type: "file", mode: 0o644, size: 10, sha256: LOCK } } as never;
const OWN = { volume: "hv-ws-abcd1234-wxxxxxxxxxx-deps", labels: { [LABEL.workspace]: "wxxxxxxxxxx" } };

/** A Docker that only answers volume inspections, for mounts(). */
const fakeDocker = { getVolume: () => ({ inspect: async () => ({ CreatedAt: "2026-10-19T00:00:00Z" }) }) } as unknown as Docker;

function deps(ns: "live" | "verify", dataDir = fs.mkdtempSync(path.join(tmpdir(), "hv-deps-unit-")), docker: Docker = fakeDocker, log: Log = quietLog) {
  const owner: Owner = { ns, boot: "b", port: 3460 };
  return new Deps({ docker: () => docker, owner, images: {} as Images, log, dataDir, home: HOME });
}

describe("dependency volumes", () => {
  it("name a shared volume by its lockfile's hash, and an own one by its workspace", () => {
    const shared = deps("live").plan("express", { kind: "npm", lock: "package-lock.json", mode: "shared" }, MANIFEST, OWN)!;
    assert.equal(shared.volume, "hu-deps-npm-e53825f19fa4");
    assert.equal(shared.target, "/workspace/node_modules");
    assert.equal(shared.install, "npm ci --offline --ignore-scripts");
    assert.equal(shared.image, "web");
    assert.equal(shared.own, false);
    assert.equal(shared.labels[LABEL.hash], "e53825f19fa4");
    const own = deps("live").plan("express", { kind: "npm", lock: "package-lock.json", mode: "own" }, MANIFEST, OWN)!;
    assert.equal(own.volume, OWN.volume);
    assert.equal(own.own, true);
    assert.equal(deps("verify").plan("express", { kind: "npm", lock: "package-lock.json" }, MANIFEST, OWN)!.volume, "hv-deps-abcd1234-npm-e53825f19fa4");
  });

  it("fill TypeScript's from hu/web's cache, FastAPI's into /deps/venv, and nothing for Maven, Go, or a template without deps", () => {
    const d = deps("live");
    assert.equal(d.plan("typescript", { kind: "npm", lock: "package-lock.json" }, MANIFEST, OWN)!.image, "web");
    const uv = d.plan("fastapi", { kind: "uv", lock: "uv.lock" }, { "uv.lock": { type: "file", mode: 0o644, size: 1, sha256: LOCK } } as never, OWN)!;
    assert.equal(uv.volume, "hu-deps-uv-e53825f19fa4");
    assert.equal(uv.target, "/deps/venv");
    assert.equal(uv.install, "uv sync --frozen --offline");
    assert.equal(d.plan("spring", { kind: "maven", lock: "pom.xml" }, { "pom.xml": { type: "file", mode: 0o644, size: 1, sha256: LOCK } } as never, OWN), null);
    assert.equal(d.plan("go-api", { kind: "go", lock: "go.sum" }, { "go.sum": { type: "file", mode: 0o644, size: 1, sha256: LOCK } } as never, OWN), null);
    assert.equal(d.plan("bash", { kind: "none" }, MANIFEST, OWN), null);
    assert.equal(d.plan("express", null, MANIFEST, OWN), null);
    assert.equal(d.plan("express", { kind: "npm", lock: "package-lock.json" }, {} as never, OWN), null, "no lockfile, no volume");
  });

  it("mount a shared volume read-only, an own one read-write, at a check's work folder, and Go's shared cache", async () => {
    const d = deps("verify");
    const shared = d.plan("express", { kind: "npm", lock: "package-lock.json" }, MANIFEST, OWN);
    assert.deepEqual(await d.mounts("express", shared), [{ source: "hv-deps-abcd1234-npm-e53825f19fa4", target: "/workspace/node_modules", readOnly: true }]);
    assert.deepEqual(await d.mounts("express", shared, "/work"), [{ source: "hv-deps-abcd1234-npm-e53825f19fa4", target: "/work/node_modules", readOnly: true }]);
    const own = d.plan("react", { kind: "npm", lock: "package-lock.json", mode: "own" }, MANIFEST, OWN);
    assert.deepEqual(await d.mounts("react", own), [{ source: OWN.volume, target: "/workspace/node_modules", readOnly: false }]);
    assert.deepEqual(await d.mounts("go-api", null), [{ source: "hv-go-build-abcd1234", target: "/opt/hu/go-build" }]);
    assert.deepEqual(await deps("live").mounts("go-api", null), [{ source: "hu-go-build", target: "/opt/hu/go-build" }]);
  });

  it("fill a template's ${NAME} with the workspace's own value, and leave what it doesn't set", () => {
    const vars = { DATABASE_URL: "postgres://ws_w:pw@db:5432/ws_w", PORT: "23017" };
    assert.equal(expand("${DATABASE_URL}", vars), vars.DATABASE_URL);
    assert.equal(expand("http://localhost:${PORT}/v1", vars), "http://localhost:23017/v1");
    assert.equal(expand("${NOPE} and $PORT", vars), "${NOPE} and $PORT");
  });
});

// Real fills, against Docker.
const endpoint = resolveEndpoint();
const docker = connect(endpoint);
let skip: string | false = false;
const images = new Images(ROOT, docker, endpoint.dockerHost);
try {
  await docker.ping();
  await images.refresh();
  if (images.state("web") !== "ready") skip = "hu/web isn't built (npm run images -- --stacks=express)";
} catch {
  skip = "Docker isn't running";
}

describe("dependency fills", { skip }, () => {
  const dataDir = fs.mkdtempSync(path.join(tmpdir(), "hv-deps-"));
  const home = `t${Date.now().toString(16).slice(-7)}`;
  const fixture = path.join(ROOT, "runner", "test-fixtures", "content", "workspaces", "typescript", "playground", "base");
  const files = new HostFs(fixture);
  const manifest = buildManifest(fixture);
  const fills: string[] = [];
  const log = { ...quietLog, info: (event: string, fields: Record<string, unknown> = {}) => event === "deps.filled" && fills.push(String(fields.volume)) } as unknown as Log;
  const make = () => new Deps({ docker: () => docker, owner: { ns: "verify", boot: "t", port: 3461 }, images, log, dataDir, home });
  let plan: DepsPlan;

  /** What a container from hu/web finds with the volume mounted read-only: zod's version, and whether it may write. */
  async function look(volume: string, script: string): Promise<string> {
    const container = await docker.createContainer({
      name: `hv-deps-look-${home}-${Math.random().toString(16).slice(2, 8)}`,
      Image: images.tag("web"),
      User: "1000:1000",
      Cmd: ["sh", "-c", script],
      Tty: true,
      Labels: { [LABEL.managed]: "1", [LABEL.ns]: "verify", [LABEL.kind]: "job", [LABEL.expires]: String(Date.now() + 60_000) },
      HostConfig: { NetworkMode: "none", ReadonlyRootfs: true, Mounts: [{ Type: "volume", Source: volume, Target: "/workspace/node_modules", ReadOnly: true }] },
    });
    try {
      await container.start();
      await container.wait();
      // With a TTY the log is the bytes the script printed, no frame headers.
      const out = (await container.logs({ stdout: true, stderr: true })) as unknown as Buffer;
      return out.toString("utf8").replace(/\r/g, "").trim();
    } finally {
      await container.remove({ force: true }).catch(() => {});
    }
  }

  after(async () => {
    await make().shutdown();
    const left = (await docker.listVolumes({ filters: { label: [`${LABEL.home}=${home}`] } })).Volumes ?? [];
    assert.deepEqual(left.map((v) => v.Name), [], "a verify runner's dependency volumes go when it stops");
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("fills a shared volume once, however many starts ask at once, and mounts it read-only", async () => {
    const d = make();
    plan = d.plan("typescript", { kind: "npm", lock: "package-lock.json" }, manifest, OWN)!;
    assert.equal(plan.volume, `hv-deps-${home}-npm-${manifest["package-lock.json"].sha256!.slice(0, 12)}`);
    await Promise.all([d.ensure(plan, files), d.ensure(plan, files), d.ensure(plan, files)]);
    assert.deepEqual(fills, [plan.volume], "one fill for three starts");
    const out = await look(plan.volume, "node -p \"require('/workspace/node_modules/zod/package.json').version\"; cat /workspace/node_modules/.hu-deps; touch /workspace/node_modules/x 2>/dev/null && echo wrote || echo read-only");
    assert.deepEqual(out.split(/\s+/), ["4.6.7", plan.hash, "read-only"]);
    // A runner that comes back trusts its record: no second fill.
    await make().ensure(plan, files);
    assert.equal(fills.length, 1);
  });

  it("fills again a volume made again, and wipes a fill a crash cut short", async () => {
    await docker.getVolume(plan.volume).remove();
    await make().ensure(plan, files);
    assert.equal(fills.length, 2, "a volume made again is filled again");
    // A crash mid-fill: no marker, a stray file, and no record of it.
    const breaker = await docker.createContainer({
      name: `hv-deps-break-${home}`,
      Image: images.tag("web"),
      User: "1000:1000",
      Cmd: ["sh", "-c", "rm -f /workspace/node_modules/.hu-deps && touch /workspace/node_modules/half-done"],
      Labels: { [LABEL.managed]: "1", [LABEL.ns]: "verify", [LABEL.kind]: "job", [LABEL.expires]: String(Date.now() + 60_000) },
      HostConfig: { NetworkMode: "none", Mounts: [{ Type: "volume", Source: plan.volume, Target: "/workspace/node_modules" }] },
    });
    await breaker.start();
    await breaker.wait();
    await breaker.remove({ force: true });
    fs.rmSync(path.join(dataDir, "deps.json"));
    await make().ensure(plan, files);
    assert.equal(fills.length, 3);
    const out = await look(plan.volume, "ls -A /workspace/node_modules | grep -c half-done; cat /workspace/node_modules/.hu-deps");
    assert.deepEqual(out.split(/\s+/), ["0", plan.hash]);
  });
});
