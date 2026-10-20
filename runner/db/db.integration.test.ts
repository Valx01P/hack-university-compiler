import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { after, before, describe, it } from "node:test";
import type Docker from "dockerode";
import { Tickets } from "../auth.ts";
import { ROOT, type Config } from "../config.ts";
import { connect, resolveEndpoint, type DockerWatch, type Owner } from "../docker.ts";
import { createApiServer } from "../http.ts";
import { Images } from "../images.ts";
import { JobPool } from "../jobs.ts";
import { quietLog } from "../log.ts";
import { runRecipe } from "../recipes/index.ts";
import { RunRequest } from "../schemas.ts";
import { execText, startRunner } from "../verify.ts";
import { pgEnv } from "./clients.ts";
import { Databases, type ServiceSpec } from "./index.ts";
import { MONGO_IMAGES, POSTGRES_BYTES, MONGO_BYTES } from "./services.ts";

/**
 * The databases on real servers, in the verify namespace with servers of
 * their own (hv-postgres-<port>, hv-mongo-<port>, hv-db-<port>), removed at
 * the end. Skipped when Docker is off. HU_DB_TEST_PORT picks the port in the
 * names (3423 by default).
 */

const PORT = Number(process.env.HU_DB_TEST_PORT ?? 3423);
const endpoint = resolveEndpoint();
const docker = connect(endpoint);
let skip: string | false = false;
try {
  await docker.ping();
} catch {
  skip = "Docker isn't running";
}
const images = new Images(ROOT, docker, endpoint.dockerHost);
if (!skip) await images.refresh();

const owner: Owner = { ns: "verify", boot: randomBytes(6).toString("hex"), port: PORT };
const dataDir = mkdtempSync(path.join(tmpdir(), "hv-db-"));
let db: Databases;

const PG_SPEC: ServiceSpec = {
  postgres: {
    databases: ["dev", "test"],
    sql: [
      {
        name: "db/schema.sql",
        text: "CREATE TABLE tasks (id serial PRIMARY KEY, title text NOT NULL, done boolean NOT NULL DEFAULT false);\nCREATE EXTENSION IF NOT EXISTS pgcrypto;\nCREATE VIEW open_tasks AS SELECT * FROM tasks WHERE NOT done;",
      },
      { name: "db/seed.sql", text: "INSERT INTO tasks (title, done) VALUES ('write', false), ('test', false), ('ship', true);" },
    ],
    testSql: [{ name: "db/schema.sql", text: "CREATE TABLE tasks (id serial PRIMARY KEY, title text NOT NULL, done boolean NOT NULL DEFAULT false);" }],
  },
};
const MONGO_DOCS = {
  recipes: [
    { _id: { $oid: "6650c1f0a1b2c3d4e5f60718" }, title: "Pancakes", servings: 4 },
    { _id: { $oid: "6650c1f0a1b2c3d4e5f60719" }, title: "Soup", servings: 2 },
  ],
  $indexes: { recipes: [{ key: { title: 1 }, unique: true }] },
};
const MONGO_SPEC: ServiceSpec = { mongo: { databases: ["dev", "test"], documents: JSON.stringify(MONGO_DOCS) } };
const REF = { course: "express", template: "taskboard-api", checkpoint: "cp-06" };
const MREF = { course: "express", template: "cookbook-api", checkpoint: "golden" };

/** psql as a role, in that role's client container. */
async function psql(key: string, conn: { role: string; password: string; database: string }, sql: string) {
  const r = await db.clients.run(key, ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", "-"], { env: pgEnv(conn), stdin: sql, timeoutMs: 20_000 });
  return { out: r.stdout.toString().trim(), err: r.stderr.toString().trim(), code: r.code };
}

function connOf(env: string[], name = "DATABASE_URL") {
  const url = new URL(env.find((e) => e.startsWith(`${name}=`))!.slice(name.length + 1));
  return { role: url.username, password: url.password, database: url.pathname.slice(1) };
}

let mongoClient: Docker.Container | null = null;
/** mongosh on the database network, the way a workspace's terminal runs it. */
async function mongosh(uri: string, script: string) {
  if (!mongoClient) {
    const image = db.services.image("mongo");
    mongoClient = await docker.createContainer({
      name: `hv-dbtest-mongosh-${owner.boot}`,
      Image: image.ref,
      User: "999:999",
      Entrypoint: ["sleep"],
      Cmd: ["900"],
      Env: ["HOME=/tmp"],
      Labels: { "hu.managed": "1", "hu.ns": "verify", "hu.kind": "job", "hu.runner": owner.boot, "hu.port": String(PORT) },
      HostConfig: {
        NetworkMode: db.services.network,
        Memory: 512 * 1024 * 1024,
        MemorySwap: 512 * 1024 * 1024,
        ReadonlyRootfs: true,
        Tmpfs: { "/tmp": "rw,size=64m" },
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges"],
      },
    });
    await mongoClient.start();
  }
  return execText(mongoClient, ["mongosh", "--quiet", "--norc", uri, "--eval", script], { user: "999:999", timeoutMs: 60_000 });
}

before(async () => {
  if (skip) return;
  db = new Databases({ docker, owner, dataDir, log: quietLog, env: { HU_DB_SIZE_WARN_MB: "9", HU_DB_SIZE_LIMIT_MB: "10" } });
  await db.attach("wpostgresaa", REF, PG_SPEC);
  await db.attach("wpostgresbb", REF, PG_SPEC);
  await db.attach("wmongoaaaaa", MREF, MONGO_SPEC);
  await db.attach("wmongobbbbb", MREF, MONGO_SPEC);
});

after(async () => {
  if (skip) return;
  await mongoClient?.remove({ force: true }).catch(() => {});
  await db.shutdown();
  const label = [`hu.port=${PORT}`, "hu.ns=verify"];
  const left = await docker.listContainers({ all: true, filters: { label } });
  assert.deepEqual(left.map((c) => c.Names[0]), [], "every database and client container is removed");
  const volumes = (await docker.listVolumes({ filters: { name: [`hv-pgdata-${PORT}`, `hv-mongodata-${PORT}`] } })).Volumes ?? [];
  assert.deepEqual(volumes.map((v) => v.Name), [], "the verify volumes are removed");
  assert.deepEqual((await docker.listNetworks({ filters: { name: [`hv-db-${PORT}`] } })).map((n) => n.Name), [], "the verify network is removed");
});

describe("the database servers", { skip }, () => {
  it("run hardened, on an internal network with the db and mongo aliases, with no published port", async () => {
    const net = await docker.getNetwork(db.services.network).inspect();
    assert.equal(net.Internal, true);
    for (const [kind, alias, memory] of [["postgres", "db", POSTGRES_BYTES], ["mongo", "mongo", MONGO_BYTES]] as const) {
      const c = await docker.getContainer(db.services.containerName(kind)).inspect();
      const h = c.HostConfig;
      assert.equal(h.ReadonlyRootfs, true);
      assert.equal(h.Privileged, false);
      assert.deepEqual(h.CapDrop, ["ALL"]);
      assert.deepEqual([...(h.CapAdd ?? [])].sort(), ["CHOWN", "DAC_OVERRIDE", "FOWNER", "SETGID", "SETUID"]);
      assert.deepEqual(h.SecurityOpt, ["no-new-privileges"]);
      assert.equal(h.Memory, memory);
      assert.equal(h.MemorySwap, memory);
      assert.equal(h.OomScoreAdj, -500);
      assert.equal(h.RestartPolicy?.Name, "unless-stopped");
      assert.deepEqual(h.PortBindings ?? {}, {});
      assert.deepEqual(Object.keys(c.NetworkSettings.Networks), [db.services.network]);
      assert.ok(c.NetworkSettings.Networks[db.services.network].Aliases?.includes(alias));
      assert.equal(c.Mounts.find((m) => m.Type === "volume")?.Name, kind === "postgres" ? `hv-pgdata-${PORT}` : `hv-mongodata-${PORT}`);
    }
  });

  it("sort text by bytes, as the SQL course shows, with pg_stat_statements loaded", async () => {
    const conn = connOf(db.workspaceEnv("wpostgresaa")!.env);
    const r = await psql("ws:wpostgresaa", conn, "SELECT string_agg(x, '' ORDER BY x) FROM (VALUES ('b'), ('B'), ('a'), ('_')) v(x);\nSELECT count(*) >= 0 FROM hu_stats.pg_stat_statements;");
    assert.equal(r.err, "");
    assert.equal(r.out, "B_ab\nt");
  });

  it("run MongoDB as the one-node replica set rs0, where a workspace's transaction commits", async () => {
    const uri = db.workspaceEnv("wmongoaaaaa")!.env.find((e) => e.startsWith("MONGODB_URI="))!.slice("MONGODB_URI=".length);
    assert.match(uri, /^mongodb:\/\/ws_wmongoaaaaa:[0-9a-f]{32}@mongo:27017\/ws_wmongoaaaaa\?replicaSet=rs0&authSource=admin$/);
    const r = await mongosh(
      uri,
      `print(rs.status().members.length);
const s = db.getMongo().startSession(); s.startTransaction();
const recipes = s.getDatabase(db.getName()).recipes;
recipes.updateOne({ title: "Pancakes" }, { $inc: { servings: -1 } });
recipes.insertOne({ title: "Toast", servings: 1 });
s.commitTransaction();
const a = s.getDatabase(db.getName()).recipes;
s.startTransaction(); a.insertOne({ title: "Never" }); s.abortTransaction();
print(db.recipes.countDocuments(), db.recipes.findOne({ title: "Pancakes" }).servings, db.recipes.countDocuments({ title: "Never" }));`
    );
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout.trim(), "1\n3 3 0");
    const image = db.services.image("mongo");
    assert.ok(image.tag === MONGO_IMAGES["8.0"].tag || image.tag === MONGO_IMAGES["7.0"].tag);
  });
});

describe("workspace databases", { skip }, () => {
  it("reset in under 50 ms, back to the template", async () => {
    const conn = connOf(db.workspaceEnv("wpostgresaa")!.env);
    await psql("ws:wpostgresaa", conn, "DELETE FROM tasks; INSERT INTO tasks (title) VALUES ('mine'); DROP VIEW open_tasks; CREATE TABLE notes (id int);");
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await db.resetWorkspace("wpostgresaa", "dev");
      assert.deepEqual(r.databases, ["ws_wpostgresaa"]);
      times.push(r.ms);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const median = [...times].sort((a, b) => a - b)[2];
    console.log(`  resets: ${times.join(", ")} ms, median ${median} ms`);
    assert.ok(median < 50, `the median reset took ${median} ms (${times.join(", ")})`);
    const after = await psql("ws:wpostgresaa", conn, "SELECT string_agg(title, ',' ORDER BY id) FROM tasks; SELECT count(*) FROM open_tasks; SELECT to_regclass('notes') IS NULL;");
    assert.equal(after.out, "write,test,ship\n2\nt");
  });

  it("give a check its own clone of the template, never the learner's rows", async () => {
    const conn = connOf(db.workspaceEnv("wpostgresaa")!.env);
    await psql("ws:wpostgresaa", conn, "UPDATE tasks SET title = 'learner edit'; INSERT INTO tasks (title) VALUES ('hand-made');");
    const muri = db.workspaceEnv("wmongoaaaaa")!.env.find((e) => e.startsWith("MONGODB_URI="))!.slice(12);
    await mongosh(muri, 'db.recipes.deleteMany({}); db.recipes.insertOne({ title: "hand-made" });');
    const pgCheck = await db.checkDatabase("wpostgresaa");
    const mongoCheck = await db.checkDatabase("wmongoaaaaa");
    try {
      assert.match(pgCheck.databases.postgres!, /^ck_wpostgresaa_[0-9a-f]{6}$/);
      const ck = connOf(pgCheck.env);
      assert.equal(ck.role, pgCheck.databases.postgres);
      const rows = await psql(`ck:${ck.role}`, ck, "SELECT string_agg(title, ',' ORDER BY id) FROM tasks;");
      assert.equal(rows.out, "write,test,ship");
      // The check's role reaches only its own database.
      const own = await psql(`ck:${ck.role}`, { ...ck, database: "ws_wpostgresaa" }, "SELECT 1;");
      assert.match(own.err, /permission denied for database "ws_wpostgresaa"/);
      const learner = await psql("ws:wpostgresaa", conn, "SELECT count(*) FROM tasks WHERE title IN ('learner edit', 'hand-made');");
      assert.equal(learner.out, "4", "the learner's own database keeps their rows");
      const m = await mongosh(mongoCheck.env[0].slice("MONGODB_URI=".length), "print(db.recipes.find().sort({ title: 1 }).toArray().map((d) => d.title).join(','))");
      assert.equal(m.stdout.trim(), "Pancakes,Soup");
    } finally {
      await pgCheck.drop();
      await mongoCheck.drop();
    }
    assert.ok(!(await db.services.pg.databases()).has(pgCheck.databases.postgres!), "the check's database is dropped");
    assert.ok(!(await db.services.pg.roles()).has(pgCheck.databases.postgres!), "the check's role is dropped");
  });

  it("keep two workspaces from reading each other's data", async () => {
    const a = connOf(db.workspaceEnv("wpostgresaa")!.env);
    const b = connOf(db.workspaceEnv("wpostgresbb")!.env);
    for (const database of [b.database, `${b.database}_test`, "postgres", "template1", db.info("wpostgresaa")!.postgres!.template]) {
      const r = await psql("ws:wpostgresaa", { ...a, database }, "SELECT 1;");
      assert.notEqual(r.code, 0, database);
      assert.match(r.err, /permission denied for database|does not exist|not currently accepting connections/, database);
    }
    // Not even with the other workspace's role name and its own password.
    const r = await psql("ws:wpostgresaa", { ...b, password: a.password }, "SELECT 1;");
    assert.match(r.err, /password authentication failed/);
    const ma = db.workspaceEnv("wmongoaaaaa")!.env.find((e) => e.startsWith("MONGODB_URI="))!.slice(12);
    const m = await mongosh(
      ma,
      `for (const n of ["ws_wmongobbbbb", "ws_wmongobbbbb_test", "admin", "local"]) {
  try { db.getSiblingDB(n).getCollectionNames(); db.getSiblingDB(n).x.findOne(); print(n, "READABLE") } catch (e) { print(n, e.codeName) }
}
print(JSON.stringify(db.adminCommand({ listDatabases: 1, nameOnly: true }).databases.map((d) => d.name)))`
    );
    assert.equal(m.stdout.trim(), 'ws_wmongobbbbb Unauthorized\nws_wmongobbbbb_test Unauthorized\nadmin Unauthorized\nlocal Unauthorized\n["ws_wmongoaaaaa"]');
  });

  it("refuse a learner role every way out (S8)", async () => {
    const a = connOf(db.workspaceEnv("wpostgresaa")!.env);
    const tries: [string, RegExp][] = [
      ["COPY (SELECT 1) TO PROGRAM 'id';", /permission denied to COPY to or from an external program/],
      ["SELECT pg_read_file('/etc/passwd');", /permission denied for function pg_read_file/],
      ["ALTER SYSTEM SET work_mem = '1GB';", /permission denied to set parameter/],
      ["SET temp_file_limit = '10GB';", /permission denied to set parameter "temp_file_limit"/],
      ["CREATE EXTENSION dblink;", /permission denied to create extension "dblink"/],
      ["CREATE FUNCTION f() RETURNS int LANGUAGE c AS '/lib/x', 'f';", /permission denied for language c/],
      ["ALTER ROLE ws_wpostgresaa SUPERUSER;", /permission denied to alter role/],
      ["CREATE DATABASE other;", /permission denied to create database/],
    ];
    for (const [sql, error] of tries) {
      const r = await psql("ws:wpostgresaa", a, sql);
      assert.match(r.err, error, sql);
    }
    const m = await mongosh(db.workspaceEnv("wmongoaaaaa")!.env.find((e) => e.startsWith("MONGODB_URI="))!.slice(12), 'try { db.recipes.find({ $where: "true" }).toArray(); print("ran") } catch (e) { print("refused") }');
    assert.equal(m.stdout.trim(), "refused");
  });

  it("let the learner own and change everything the template made", async () => {
    const a = connOf(db.workspaceEnv("wpostgresaa")!.env);
    const r = await psql("ws:wpostgresaa", a, "ALTER TABLE tasks ADD COLUMN note text; DROP VIEW open_tasks; SELECT gen_random_uuid() IS NOT NULL; DROP EXTENSION pgcrypto; SELECT 'ok';");
    assert.equal(r.err, "");
    assert.equal(r.out, "t\nok");
    await db.resetWorkspace("wpostgresaa");
  });

  it("park unused databases as dumps and bring them back", async () => {
    const a = connOf(db.workspaceEnv("wpostgresbb")!.env);
    await psql("ws:wpostgresbb", a, "INSERT INTO tasks (title) VALUES ('kept through parking');");
    await db.park("wpostgresbb");
    assert.ok(!(await db.services.pg.databases()).has("ws_wpostgresbb"), "the database is dropped while parked");
    const files = readdirSync(path.join(dataDir, "db", "parked", "wpostgresbb")).sort();
    assert.deepEqual(files, ["ws_wpostgresbb.dump", "ws_wpostgresbb_test.dump"]);
    assert.equal(readFileSync(path.join(dataDir, "db", "parked", "wpostgresbb", "ws_wpostgresbb.dump")).subarray(0, 5).toString(), "PGDMP");
    assert.equal(db.info("wpostgresbb")?.parked, true);
    const q = await db.query("wpostgresbb", { sql: "SELECT title FROM tasks ORDER BY id DESC LIMIT 1" });
    assert.equal(q.engine === "postgres" && q.rows[0][0], "kept through parking");
    assert.equal(db.info("wpostgresbb")?.parked, false);
    assert.ok(!existsSync(path.join(dataDir, "db", "parked", "wpostgresbb")));

    await db.park("wmongobbbbb");
    const m = await db.query("wmongobbbbb", { collection: "recipes", filter: {} });
    assert.equal(m.engine === "mongo" && m.rows.length, 2);
  });

  it("close a database that passes its size limit until a reset", async () => {
    const events: [string, unknown][] = [];
    const off = db.onEvent((id, e) => events.push([id, e]));
    const a = connOf(db.workspaceEnv("wpostgresbb")!.env);
    await psql("ws:wpostgresbb", a, "CREATE TABLE filler AS SELECT repeat('x', 1000) AS pad FROM generate_series(1, 3000);");
    await db.watchSizes(["wpostgresbb"]);
    off();
    assert.ok(events.some(([id, e]) => id === "wpostgresbb" && (e as { kind: string }).kind === "quota"), JSON.stringify(events));
    assert.deepEqual(db.info("wpostgresbb")?.blocked, ["ws_wpostgresbb"]);
    const blocked = await psql("ws:wpostgresbb", a, "SELECT 1;");
    assert.match(blocked.err, /permission denied for database/);
    await assert.rejects(db.query("wpostgresbb", { sql: "SELECT 1" }), /passed its 10 MB limit and was closed/);
    await db.resetWorkspace("wpostgresbb");
    assert.deepEqual(db.info("wpostgresbb")?.blocked, []);
    assert.equal((await psql("ws:wpostgresbb", a, "SELECT count(*) FROM tasks;")).out, "3");
  });

  it("build a Mongo template from a mongodump archive, whatever its database was called", async () => {
    const chunks: Buffer[] = [];
    const sink = new Writable({ write: (chunk, _enc, done) => (chunks.push(chunk), done()) });
    await db.services.mongo.dump("ws_wmongobbbbb", db.services.secrets.mongo.password, sink);
    const archive = Buffer.concat(chunks);
    assert.equal(archive.subarray(0, 2).toString("hex"), "1f8b", "a gzip archive");
    await db.attach("warchiveaaa", { course: "express", template: "cookbook-archive" }, { mongo: { archive } });
    const r = await db.query("warchiveaaa", { collection: "recipes", filter: {} });
    assert.equal(r.engine === "mongo" && r.rows.map((row) => row[1]).join(","), "Pancakes,Soup");
    const schema = await db.schema("warchiveaaa");
    assert.ok(schema.engine === "mongo" && schema.collections[0].indexes.some((i) => i.unique), "indexes come with the archive");
    await db.dropWorkspace("warchiveaaa");
  });

  it("drop what a crash left behind when a server comes up", async () => {
    await db.services.pg.createRole("run_deadbeef0000", "0123456789abcdef0123456789abcdef");
    await db.services.pg.empty("run_deadbeef0000", "run_deadbeef0000");
    await db.services.mongo.user("ck_wdeadbeefaa_000000", "0123456789abcdef0123456789abcdef", ["ck_wdeadbeefaa_000000"]);
    await db.services.mongo.load("ck_wdeadbeefaa_000000", '{"x":[{"a":1}]}');
    await db.services.onUp("postgres");
    await db.services.onUp("mongo");
    assert.ok(!(await db.services.pg.databases()).has("run_deadbeef0000"));
    assert.ok(!(await db.services.pg.roles()).has("run_deadbeef0000"));
    const { databases, users } = await db.services.mongo.list();
    assert.ok(!databases.includes("ck_wdeadbeefaa_000000") && !users.includes("ck_wdeadbeefaa_000000"));
    assert.ok((await db.services.pg.databases()).has("ws_wpostgresaa"), "workspaces' databases stay");
  });

  it("drop a workspace's databases, role, and user on delete, even right after a reset", async () => {
    await db.attach("wdropmeaaaa", REF, { ...PG_SPEC, ...MONGO_SPEC });
    // The reset sets the old databases aside for a moment: they go too.
    await db.resetWorkspace("wdropmeaaaa");
    await db.dropWorkspace("wdropmeaaaa");
    assert.equal(db.info("wdropmeaaaa"), null);
    const dbs = await db.services.pg.databases();
    assert.ok(![...dbs.keys()].some((d) => d.includes("wdropmeaaaa")));
    assert.ok(!(await db.services.pg.roles()).has("ws_wdropmeaaaa"));
    const { databases, users } = await db.services.mongo.list();
    assert.ok(!databases.some((d) => d.includes("wdropmeaaaa")) && !users.includes("ws_wdropmeaaaa"));
  });
});

describe("single-file runs with a database", { skip: skip || (images.state("node") !== "ready" && "the hu/node image isn't built") }, () => {
  it("give every test a fresh database from the lesson's setup, plus its own sql", async () => {
    const client = readFileSync(path.join(import.meta.dirname, "fixtures", "pg-client.mjs"), "utf8");
    const program = `// @ts-nocheck\n${client}\nconst rows = await pgQuery(process.env.DATABASE_URL, "INSERT INTO recipes (title) VALUES ('mine'); SELECT string_agg(title, ',' ORDER BY id) FROM recipes");\nconsole.log(rows[0][0]);\n`;
    const body = RunRequest.parse({
      recipe: "typescript",
      files: [{ name: "main.ts", content: program }],
      setup: { postgres: "CREATE TABLE recipes (id serial PRIMARY KEY, title text NOT NULL);\nINSERT INTO recipes (title) VALUES ('Pancakes'), ('Soup');" },
      tests: [{}, { sql: "INSERT INTO recipes (title) VALUES ('extra');" }, {}],
    });
    const deps = { docker, owner, images, pool: new JobPool(2), log: quietLog, databases: db };
    const r = await runRecipe(deps, body);
    assert.equal(r.compile?.code, 0, r.compile?.output ?? "");
    assert.deepEqual(
      r.results?.map((t) => [t.stdout, t.stderr, t.code]),
      [
        ["Pancakes,Soup,mine\n", "", 0],
        ["Pancakes,Soup,extra,mine\n", "", 0],
        ["Pancakes,Soup,mine\n", "", 0],
      ]
    );
    const left = [...(await db.services.pg.databases()).keys()].filter((d) => d.startsWith("run_"));
    assert.deepEqual(left, [], "every run database is dropped");
  });

  it("load a Mongo setup's documents and a test's seed into fresh databases", async () => {
    const run = await db.prepareRun({ mongo: { recipes: [{ _id: { $oid: "6650c1f0a1b2c3d4e5f60718" }, title: "Pancakes" }] } }, [{}, { seed: { recipes: [{ title: "Toast" }] } }]);
    try {
      const counts: string[] = [];
      for (const i of [0, 1]) {
        const m = await mongosh(run.env(i).MONGODB_URI, "print(db.recipes.countDocuments(), db.recipes.findOne({ title: 'Pancakes' })._id.toHexString())");
        counts.push(m.stdout.trim());
      }
      assert.deepEqual(counts, ["1 6650c1f0a1b2c3d4e5f60718", "2 6650c1f0a1b2c3d4e5f60718"]);
    } finally {
      await run.release();
    }
    const { databases } = await db.services.mongo.list();
    assert.deepEqual(databases.filter((d) => d.startsWith("run_")), []);
  });
});

describe("the database panel's routes", { skip }, () => {
  const TOKEN = "db-test-token";
  let server: http.Server;
  let port = 0;
  const request = (method: string, url: string, body?: unknown): Promise<{ status: number; json: any }> =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method,
          path: url,
          headers: { host: `127.0.0.1:${port}`, authorization: `Bearer ${TOKEN}`, ...(payload ? { "content-type": "application/json" } : {}) },
        },
        (res) => {
          let raw = "";
          res.on("data", (c) => (raw += c));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, json: raw ? JSON.parse(raw) : null }));
        }
      );
      req.on("error", reject);
      req.end(payload);
    });

  before(async () => {
    const watch = { state: "ready", facts: null, docker, ready: async () => true, check: async () => "ready", onChange: () => () => {} } as unknown as DockerWatch;
    const config = { port: 0, appPort: 3000 } as Config;
    server = createApiServer({
      config,
      token: TOKEN,
      tickets: new Tickets(30_000),
      watch,
      images,
      pool: new JobPool(2),
      owner,
      log: quietLog,
      services: { piston: false, postgres: "running", mongo: "running" },
      databases: db,
      startedAt: Date.now(),
      version: "0.0.0",
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
    config.port = port;
  });

  after(() => {
    server?.closeAllConnections();
    server?.close();
  });

  it("GET …/db/schema lists tables with their columns, keys, and row counts", async () => {
    const r = await request("GET", "/v1/workspaces/wpostgresaa/db/schema");
    assert.equal(r.status, 200);
    assert.equal(r.json.engine, "postgres");
    assert.equal(r.json.database, "ws_wpostgresaa");
    assert.ok(r.json.sizeBytes > 0);
    const tasks = r.json.tables.find((t: { name: string }) => t.name === "tasks");
    assert.deepEqual(tasks, {
      schema: "public",
      name: "tasks",
      kind: "table",
      rows: 3,
      columns: [
        { name: "id", type: "integer", nullable: false, key: true },
        { name: "title", type: "text", nullable: false, key: false },
        { name: "done", type: "boolean", nullable: false, key: false },
      ],
    });
    assert.ok(r.json.tables.some((t: { name: string; kind: string }) => t.name === "open_tasks" && t.kind === "view"));
    assert.ok(!r.json.tables.some((t: { schema: string }) => t.schema === "hu_stats"));
    const test = await request("GET", "/v1/workspaces/wpostgresaa/db/schema?database=test");
    assert.equal(test.json.database, "ws_wpostgresaa_test");
    assert.equal(test.json.tables[0].rows, 0);
    const m = await request("GET", "/v1/workspaces/wmongoaaaaa/db/schema");
    assert.equal(m.json.engine, "mongo");
    assert.deepEqual(m.json.collections[0].indexes.map((i: { name: string; unique: boolean }) => [i.name, i.unique]), [["_id_", false], ["hu_recipes_0", true]]);
  });

  it("POST …/db/query answers {columns, rows, tag, error, truncated} for SQL", async () => {
    const r = await request("POST", "/v1/workspaces/wpostgresaa/db/query", { sql: "UPDATE tasks SET done = true WHERE id = 1;\nSELECT id, title, done, NULL AS nothing, '' AS empty FROM tasks ORDER BY id;" });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json).sort(), ["columns", "database", "engine", "error", "ms", "results", "rows", "tag", "truncated"]);
    assert.deepEqual(r.json.columns.map((c: { name: string; type: number }) => [c.name, c.type]), [["id", 23], ["title", 25], ["done", 16], ["nothing", 25], ["empty", 25]]);
    assert.deepEqual(r.json.rows[0], ["1", "write", "t", null, ""]);
    assert.equal(r.json.tag, "SELECT 3");
    assert.equal(r.json.error, null);
    assert.equal(r.json.truncated, false);
    assert.deepEqual(r.json.results[0], { kind: "command", statement: "UPDATE tasks SET done = true WHERE id = 1", tag: "UPDATE 1" });
    const many = await request("POST", "/v1/workspaces/wpostgresaa/db/query", { sql: "SELECT g FROM generate_series(1, 2000) g" });
    assert.equal(many.json.rows.length, 500);
    assert.equal(many.json.truncated, true);
    const bad = await request("POST", "/v1/workspaces/wpostgresaa/db/query", { sql: "SELECT 1; SELECT nope FROM tasks; SELECT 2;" });
    assert.equal(bad.status, 200);
    assert.equal(bad.json.error.statement, "SELECT nope FROM tasks");
    assert.match(bad.json.error.message, /column "nope" does not exist/);
    assert.equal(bad.json.results.length, 1);
    const slow = await request("POST", "/v1/workspaces/wpostgresaa/db/query", { sql: "SELECT pg_sleep(11)" });
    assert.match(slow.json.error.message, /statement timeout|10 seconds/);
  });

  it("POST …/db/query answers documents for a Mongo filter", async () => {
    const r = await request("POST", "/v1/workspaces/wmongobbbbb/db/query", { collection: "recipes", filter: { servings: { $gt: 2 } }, limit: 5 });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.columns, [{ name: "_id" }, { name: "title" }, { name: "servings" }]);
    assert.deepEqual(r.json.rows, [['ObjectId("6650c1f0a1b2c3d4e5f60718")', "Pancakes", "4"]]);
    assert.deepEqual(r.json.documents[0]._id, { $oid: "6650c1f0a1b2c3d4e5f60718" });
    assert.equal(r.json.tag, "1 document");
    const bad = await request("POST", "/v1/workspaces/wmongobbbbb/db/query", { collection: "recipes", filter: { $where: "true" } });
    assert.equal(bad.status, 200);
    assert.ok(bad.json.error);
  });

  it("POST …/db/reset resets, and the routes refuse bad requests", async () => {
    const r = await request("POST", "/v1/workspaces/wpostgresaa/db/reset", { database: "dev" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.databases, ["ws_wpostgresaa"]);
    assert.equal(typeof r.json.ms, "number");
    const info = await request("GET", "/v1/workspaces/wpostgresaa/db");
    assert.deepEqual(info.json.postgres.databases, ["ws_wpostgresaa", "ws_wpostgresaa_test"]);
    assert.equal(info.json.parked, false);
    assert.equal((await request("POST", "/v1/workspaces/wpostgresaa/db/query", { sql: "SELECT 1", shell: "rm -rf /" })).status, 400);
    assert.equal((await request("POST", "/v1/workspaces/wpostgresaa/db/query", { collection: "x" })).status, 409, "no Mongo database");
    assert.equal((await request("GET", "/v1/workspaces/wnodbaaaaaa/db/schema")).json.error, "no_database");
    assert.equal((await request("GET", "/v1/workspaces/wpostgresaa/db/query")).status, 405);
  });
});

describe("a runner of its own", { skip: skip || (images.state("node") !== "ready" && "the hu/node image isn't built") }, () => {
  it("runs a lesson with a database through POST /v1/run, reports its servers, and removes them when it stops", async () => {
    const port = PORT + 1;
    const runner = startRunner(port, { HU_POLL_MS: "1000" });
    try {
      await runner.ready(30_000);
      const client = readFileSync(path.join(import.meta.dirname, "fixtures", "pg-client.mjs"), "utf8");
      const r = await runner.request("POST", "/v1/run", {
        body: {
          recipe: "typescript",
          files: [{ name: "main.ts", content: `// @ts-nocheck\n${client}\nconsole.log((await pgQuery(process.env.DATABASE_URL, "SELECT count(*) FROM t"))[0][0]);\n` }],
          setup: "CREATE TABLE t (a int);\nINSERT INTO t VALUES (1), (2);",
        },
      });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal(r.json.run.stdout, "2\n", JSON.stringify(r.json.run));
      let health = await runner.request("GET", "/v1/health");
      for (let i = 0; i < 20 && health.json.services.postgres !== "running"; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        health = await runner.request("GET", "/v1/health");
      }
      assert.equal(health.json.services.postgres, "running");
      assert.equal(health.json.services.mongo, "absent");
      const none = await runner.request("GET", "/v1/workspaces/wk3j6q2m7xa/db/schema");
      assert.equal(none.status, 409);
      assert.equal(none.json.error, "no_database");
    } finally {
      await runner.stop("SIGTERM");
    }
    const left = await docker.listContainers({ all: true, filters: { label: [`hu.port=${port}`, "hu.ns=verify"] } });
    assert.deepEqual(left.map((c) => c.Names[0]), []);
    assert.deepEqual((await docker.listNetworks({ filters: { name: [`hv-db-${port}`] } })).map((n) => n.Name), []);
    assert.deepEqual(((await docker.listVolumes({ filters: { name: [`hv-pgdata-${port}`] } })).Volumes ?? []).map((v) => v.Name), []);
  });
});

describe("idle servers", { skip }, () => {
  it("stop when nothing uses them, and start again on the next use with their data", async () => {
    await mongoClient?.remove({ force: true }).catch(() => {});
    mongoClient = null;
    await db.clients.shutdown();
    const stopped = await db.services.stopIdle(Date.now() + 2 * 3_600_000);
    assert.deepEqual([...stopped].sort(), ["mongo", "postgres"]);
    assert.equal(db.state("postgres"), "stopped");
    assert.equal(db.state("mongo"), "stopped");
    const pg = await db.query("wpostgresaa", { sql: "SELECT count(*) FROM tasks" });
    assert.equal(pg.engine === "postgres" && pg.rows[0][0], "3");
    const m = await db.query("wmongoaaaaa", { collection: "recipes", filter: {} });
    assert.equal(m.engine === "mongo" && m.error, null);
    assert.equal(db.state("postgres"), "running");
    assert.equal(db.state("mongo"), "running");
  });
});

describe("a server another data folder left", { skip }, () => {
  it("is replaced with its volume, rather than left with passwords nobody has", async () => {
    const port = PORT + 3;
    const ownerOf = (boot: string): Owner => ({ ns: "verify", boot, port });
    const first = new Databases({ docker, owner: ownerOf(owner.boot), dataDir: mkdtempSync(path.join(tmpdir(), "hv-db-old-")), log: quietLog, env: {} });
    await first.attach("woldfoldera", REF, PG_SPEC);
    // That data folder is gone, and its runner with it: no shutdown.
    await first.clients.shutdown();
    first.services.pg.close();
    const second = new Databases({ docker, owner: ownerOf(owner.boot), dataDir: mkdtempSync(path.join(tmpdir(), "hv-db-new-")), log: quietLog, env: {} });
    try {
      await second.attach("wnewfoldera", REF, PG_SPEC);
      const q = await second.query("wnewfoldera", { sql: "SELECT count(*) FROM tasks" });
      assert.equal(q.engine === "postgres" && q.rows[0][0], "3");
      assert.ok(!(await second.services.pg.roles()).has("ws_woldfoldera"), "the old server's data went with it");
    } finally {
      await second.shutdown();
    }
    assert.deepEqual((await docker.listContainers({ all: true, filters: { label: [`hu.port=${port}`, "hu.ns=verify"] } })).map((c) => c.Names[0]), []);
  });
});
