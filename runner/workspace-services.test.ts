import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { workspaceId } from "../lib/workspace-id.mjs";
import { ROOT } from "./config.ts";
import { LABEL, connect, resolveEndpoint } from "./docker.ts";
import { Images } from "./images.ts";
import { WebSocket, execText, freePort, startRunner, type RunnerProcess } from "./verify.ts";

/**
 * What a workspace gets when it starts (README "Dependencies" and "What a
 * workspace gets"), through a real runner in the verify namespace, on the
 * express fixtures in runner/test-fixtures: its shared dependency volume,
 * read-only; .env made from .env.example; its own PostgreSQL databases on
 * the database network, with DATABASE_URL and a template variable that names
 * it; db and everything resets with their db event and task restarts; a
 * PostgreSQL and a MongoDB template built by the template's own commands in a
 * job; and every database dropped with its workspace. Skipped when Docker is
 * off or hu/web isn't built (the databases' images download once).
 *
 *   HU_TEST_SERVICES_PORTS  the workspace port range (24200-24249)
 */

const FIXTURES = path.join(ROOT, "runner", "test-fixtures", "content");
const endpoint = resolveEndpoint();
const docker = connect(endpoint);
let skip: string | false = false;
try {
  await docker.ping();
  const images = new Images(ROOT, docker, endpoint.dockerHost);
  await images.refresh();
  if (images.state("web") !== "ready") skip = "hu/web isn't built (npm run images -- --stacks=express)";
} catch {
  skip = "Docker isn't running";
}

const APP = "http://localhost:3000";
const template = (id: string) => JSON.parse(fs.readFileSync(path.join(FIXTURES, "workspaces", "express", id, "template.json"), "utf8"));

/** The body Next sends for a fixture template's sandbox (lib/workspaces.ts). */
function openBody(id: string) {
  const t = template(id);
  return {
    scope: `sandbox/express/${id}`,
    template: `express/${id}`,
    layers: ["base"],
    image: t.image,
    services: t.services,
    ports: t.ports,
    tasks: t.tasks,
    env: t.env ?? {},
    ...(t.deps ? { deps: t.deps } : {}),
    restartOnReset: t.restartOnReset ?? false,
  };
}

async function until<T>(fn: () => T | Promise<T>, ms: number, step = 100): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`Timed out after ${ms} ms`);
    await new Promise((r) => setTimeout(r, step));
  }
}

function get(port: number, urlPath: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, headers: { host: `127.0.0.1:${port}` }, agent: false }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("what a workspace gets", { skip }, () => {
  let runner: RunnerProcess;
  let home: string;
  const db = workspaceId("sandbox/express/runner-db");
  const built = workspaceId("sandbox/express/runner-built");
  const container = (id: string) => docker.getContainer(`hv-ws-${home}-${id}`);
  const sh = async (id: string, script: string) => {
    const r = await execText(container(id), ["sh", "-c", script]);
    return `${r.stdout}${r.stderr}`.trim();
  };

  before(async () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), "hv-services-"));
    const port = await freePort(3471);
    runner = startRunner(port, { HU_CONTENT_DIR: FIXTURES, HU_WS_PORTS: process.env.HU_TEST_SERVICES_PORTS ?? "24200-24249", HU_WS_POLL_MS: "500", HU_MEM_BUDGET_MB: "4096" }, dir);
    await runner.ready();
    home = createHash("sha256").update(fs.realpathSync(runner.dataDir)).digest("hex").slice(0, 8);
  });

  after(async () => {
    if (!runner) return;
    for (const id of [db, built]) await runner.request("DELETE", `/v1/workspaces/${id}`).catch(() => {});
    await runner.stop();
    const left = await docker.listContainers({ all: true, filters: { label: [`${LABEL.ns}=verify`, `${LABEL.port}=${runner.port}`] } });
    assert.deepEqual(left.map((c) => c.Names[0]), [], "every container of this runner is removed, its database servers too");
    const volumes = (await docker.listVolumes({ filters: { label: [`${LABEL.home}=${home}`] } })).Volumes ?? [];
    assert.deepEqual(volumes.map((v) => v.Name), [], "every workspace and dependency volume is removed");
    assert.equal((await docker.listNetworks({ filters: { name: [`hv-db-${runner.port}`] } })).length, 0, "the database network is removed");
    fs.rmSync(runner.dataDir, { recursive: true, force: true });
  });

  it("opens with .env made from .env.example, and starts with its dependencies, its databases, and their variables", async () => {
    const opened = await runner.request("PUT", `/v1/workspaces/${db}`, { body: openBody("runner-db") });
    assert.equal(opened.status, 200, JSON.stringify(opened.json));
    const env = opened.json.tree.find((e: { path: string }) => e.path === ".env");
    assert.equal(env?.state, "same", ".env is part of the original");
    assert.equal((await runner.request("GET", `/v1/workspaces/${db}/file?path=.env`)).json, "GREETING=hello from .env.example\n");

    const started = await runner.request("POST", `/v1/workspaces/${db}/start`);
    assert.equal(started.status, 200, JSON.stringify(started.json));
    const info = await container(db).inspect();
    assert.equal(info.HostConfig.NetworkMode, `hv-db-${runner.port}`);
    const vars = Object.fromEntries(info.Config.Env.map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
    assert.match(vars.DATABASE_URL, new RegExp(`^postgres://ws_${db}:[0-9a-f]{32}@db:5432/ws_${db}$`));
    assert.match(vars.TEST_DATABASE_URL, new RegExp(`@db:5432/ws_${db}_test$`));
    assert.equal(vars.PGDATABASE, `ws_${db}`);
    assert.equal(vars.LINK, vars.DATABASE_URL, "a template variable names the workspace's own");
    const deps = info.Mounts.find((m) => m.Destination === "/workspace/node_modules");
    assert.match(String(deps?.Name), new RegExp(`^hv-deps-${home}-npm-[0-9a-f]{12}$`));
    assert.equal(deps?.RW, false, "a shared dependency volume is read-only");

    assert.equal(await sh(db, "psql -tAc \"SELECT string_agg(title, ',' ORDER BY id) FROM items\""), "one,two");
    assert.equal(await sh(db, "cd /workspace && node -p \"require('zod/package.json').version\""), "4.6.7");
    assert.match(await sh(db, "touch /workspace/node_modules/x"), /Read-only file system/);

    // The task reads .env (node --env-file=.env), and answers on its leased port.
    assert.equal((await runner.request("POST", `/v1/workspaces/${db}/tasks/serve/start`)).status, 200);
    const lease = (await runner.request("GET", `/v1/workspaces/${db}`)).json.leases.PORT;
    // The bridge answers 503 until the server listens.
    const res = await until(async () => {
      const r = await get(lease, "/").catch(() => null);
      return r?.status === 200 ? r : null;
    }, 15_000);
    assert.deepEqual(res, { status: 200, body: "hello from .env.example" });
  });

  it("gives a check the dependencies and a fresh clone of the template's database, never the learner's rows", async () => {
    await sh(db, "psql -qc \"INSERT INTO items (title) VALUES ('three')\"");
    assert.equal(await sh(db, "psql -tAc 'SELECT count(*) FROM items'"), "3");
    const { checkId } = (await runner.request("POST", `/v1/workspaces/${db}/check`, { body: { suite: "workspaces/express/runner-db/checks/template", target: { course: "express" } } })).json;
    const result = await until(async () => {
      const r = (await runner.request("GET", `/v1/checks/${checkId}`)).json;
      return r.status === "running" ? null : r;
    }, 60_000);
    assert.equal(result.status, "passed", JSON.stringify(result.tests ?? result.infra));
    assert.equal(await sh(db, "psql -tAc 'SELECT count(*) FROM items'"), "3", "the learner's rows are as they were");
  });

  it("puts the databases back with a db reset, says so on the events socket, and restarts the running tasks", async () => {
    assert.equal(await sh(db, "psql -tAc 'SELECT count(*) FROM items'"), "3");
    const { ticket } = (await runner.request("POST", "/v1/tickets", { body: { workspace: db, kind: "events" } })).json;
    const socket = new WebSocket(`ws://127.0.0.1:${runner.port}/v1/ws/events`, { headers: { origin: APP } });
    const got: any[] = [];
    socket.on("message", (d) => got.push(JSON.parse(String(d))));
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    socket.send(JSON.stringify({ t: "hello", ticket }));
    await until(() => got.some((m) => m.t === "ready"), 5_000);

    const dry = await runner.request("POST", `/v1/workspaces/${db}/reset`, { body: { scope: "db", dryRun: true } });
    assert.deepEqual(dry.json, { restored: [], removed: [], databases: [`ws_${db}`, `ws_${db}_test`] });
    const reset = await runner.request("POST", `/v1/workspaces/${db}/reset`, { body: { scope: "db" } });
    assert.equal(reset.status, 200, JSON.stringify(reset.json));
    assert.deepEqual(reset.json.databases, [`ws_${db}`, `ws_${db}_test`]);
    assert.equal(typeof reset.json.ms, "number");
    await until(() => got.some((m) => m.t === "db" && m.state === "reset"), 5_000);
    assert.equal(await sh(db, "psql -tAc 'SELECT count(*) FROM items'"), "2");
    await until(() => got.some((m) => m.t === "task" && m.name === "serve" && m.state === "starting"), 10_000);

    const everything = await runner.request("POST", `/v1/workspaces/${db}/reset`, { body: { scope: "everything", dryRun: true } });
    assert.deepEqual(everything.json.databases, [`ws_${db}`, `ws_${db}_test`]);
    const schema = await runner.request("GET", `/v1/workspaces/${db}/db/schema`);
    assert.deepEqual(schema.json.tables.map((t: { name: string; rows: number }) => [t.name, t.rows]), [["items", 2]]);
    socket.close();
  });

  it("builds PostgreSQL and MongoDB templates with the template's own commands, in a job on the database network", async () => {
    assert.equal((await runner.request("PUT", `/v1/workspaces/${built}`, { body: openBody("runner-built") })).status, 200);
    const started = await runner.request("POST", `/v1/workspaces/${built}/start`);
    assert.equal(started.status, 200, JSON.stringify(started.json));
    assert.equal(await sh(built, "psql -tAc 'SELECT n FROM built'"), "42");
    // The seed script drops its database first, which the workspace's user may do to its own.
    assert.equal(await sh(built, "mongosh \"$MONGODB_URI\" --quiet --eval 'db.items.countDocuments({ title: \"seeded\" })'"), "1");
    const jobs = await docker.listContainers({ all: true, filters: { label: [`${LABEL.ns}=verify`, `${LABEL.port}=${runner.port}`, `${LABEL.recipe}=db-build`] } });
    assert.deepEqual(jobs, [], "the build jobs are gone");
  });

  it("drops a workspace's databases with it", async () => {
    assert.equal((await runner.request("GET", `/v1/workspaces/${db}/db`)).status, 200);
    assert.equal((await runner.request("DELETE", `/v1/workspaces/${db}`)).status, 204);
    assert.equal((await runner.request("GET", `/v1/workspaces/${db}/db`)).status, 404);
  });
});
