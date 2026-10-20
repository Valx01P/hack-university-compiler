import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DbQuery, DB_ROUTE } from "./routes.ts";
import { checkIdent, checkName, dockerNames, lessonTemplateName, oldName, runName, templateName, workspaceNames, LEFTOVER } from "./names.ts";
import { ejsonCell, parseCsv, queryScript, readQueryOutput, relaxed, typeId } from "./panel.ts";
import { fill, statements } from "./postgres.ts";
import { mongo8Runs } from "./services.ts";
import { serviceSpec, upOnly, type TemplateFiles } from "./spec.ts";
import { RunRequest } from "../schemas.ts";

/**
 * The database layer without Docker: names, the fixed SQL, the panel's
 * psql script and how its output is read, and the run schema's setup.
 * db.integration.test.ts runs the real servers.
 */

describe("database names", () => {
  it("are the architecture's names, checked before any SQL sees them", () => {
    assert.deepEqual(workspaceNames("wk3j6q2m7xa"), { role: "ws_wk3j6q2m7xa", dev: "ws_wk3j6q2m7xa", test: "ws_wk3j6q2m7xa_test" });
    assert.match(checkName("wk3j6q2m7xa"), /^ck_wk3j6q2m7xa_[0-9a-f]{6}$/);
    assert.match(runName(), /^run_[0-9a-f]{12}$/);
    assert.match(oldName("ws_wk3j6q2m7xa_test"), /^ws_wk3j6q2m7xa_test_old[0-9a-f]{6}$/);
    assert.equal(templateName({ course: "express", template: "taskboard-api", checkpoint: "cp-06" }, "9c1e4a2b77d0aa"), "tpl_express_taskboard_api_cp_06_9c1e4a2b");
    assert.equal(lessonTemplateName("0123456789abcdef"), "tpl_lesson_0123456789ab");
    const long = templateName({ course: "spring", template: "a-very-long-template-name-that-goes-on", checkpoint: "and-on-and-on" }, "ffffffffffff");
    assert.ok(long.length <= 52 && long.endsWith("_ffffffff"), long);
  });

  it("refuse anything that isn't one", () => {
    for (const bad of ["ws_X", "postgres", "ws_a; DROP ROLE x", "ws_", "tpl_a-b", "ws_a'b", `ws_${"a".repeat(49)}`]) {
      assert.throws(() => checkIdent(bad), /unsafe database name/, bad);
    }
    assert.throws(() => workspaceNames("w1234567890"), /Not a workspace id/);
    assert.throws(() => fill("role", { role: "ws_a", password: "not-hex" }), /32 hex/);
    assert.throws(() => fill("clone", { db: "ws_a", tpl: "template0; --", role: "ws_a" }), /unsafe/);
  });

  it("give a verify runner its own servers, network, and volumes", () => {
    assert.deepEqual(dockerNames("live", 3100), {
      network: "hu-db", postgres: "hu-postgres", mongo: "hu-mongo", pgVolume: "hu-pgdata", mongoVolume: "hu-mongodata", tool: "hu-dbtool",
    });
    assert.equal(dockerNames("verify", 3423).postgres, "hv-postgres-3423");
    assert.equal(dockerNames("verify", 3423).network, "hv-db-3423");
  });

  it("know what a crash leaves behind", () => {
    for (const name of ["ck_wk3j6q2m7xa_0a1b2c", "run_0123456789ab", "ws_wk3j6q2m7xa_old0a1b2c"]) assert.ok(LEFTOVER.test(name), name);
    for (const name of ["ws_wk3j6q2m7xa", "ws_wk3j6q2m7xa_test", "tpl_lesson_0123456789ab"]) assert.ok(!LEFTOVER.test(name), name);
  });
});

describe("the fixed SQL", () => {
  it("fills names and splits into statements, comments dropped", () => {
    const sql = fill("reset", { db: "ws_wk3j6q2m7xa", tpl: "tpl_x_00000000", role: "ws_wk3j6q2m7xa", old: "ws_wk3j6q2m7xa_old000000" });
    assert.deepEqual(statements(sql), [
      "ALTER DATABASE ws_wk3j6q2m7xa ALLOW_CONNECTIONS false;",
      "SELECT count(pg_terminate_backend(pid, 1000)) FROM pg_stat_activity WHERE datname = 'ws_wk3j6q2m7xa';",
      "ALTER DATABASE ws_wk3j6q2m7xa RENAME TO ws_wk3j6q2m7xa_old000000;",
      "CREATE DATABASE ws_wk3j6q2m7xa TEMPLATE tpl_x_00000000 OWNER ws_wk3j6q2m7xa;",
      "REVOKE ALL ON DATABASE ws_wk3j6q2m7xa FROM PUBLIC;",
    ]);
  });

  it("gives learner roles limits a learner can't raise", () => {
    const role = fill("role", { role: "ws_wk3j6q2m7xa", password: "0123456789abcdef0123456789abcdef" });
    assert.match(role, /NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 20/);
    assert.match(role, /statement_timeout = '30s'/);
    assert.match(role, /temp_file_limit = '256MB'/);
  });

  it("hands a finished template to pg_database_owner, not to whichever clone comes first", () => {
    const finish = fill("template-finish", { tpl: "tpl_x_00000000" });
    assert.match(finish, /ALTER DATABASE tpl_x_00000000 OWNER TO postgres;[\s\S]*REASSIGN OWNED BY tpl_x_00000000 TO pg_database_owner;/);
    assert.match(finish, /IS_TEMPLATE true ALLOW_CONNECTIONS false/);
  });
});

describe("the panel's SQL", () => {
  it("describes and runs each statement between markers, meta-commands as written", () => {
    const { script, statements: list } = queryScript("\\dt\nSELECT 1 AS one; -- a note\nINSERT INTO t VALUES (1);\n-- only a comment\n", "huNONCE");
    assert.deepEqual(list, ["\\dt", "SELECT 1 AS one", "-- a note\nINSERT INTO t VALUES (1)"]);
    assert.match(script, /^\\set ON_ERROR_STOP 1\n/);
    assert.match(script, /\\echo huNONCE 0 run\n\\dt\n\\echo huNONCE 0 end/);
    assert.match(script, /\\echo huNONCE 1 describe\nSELECT 1 AS one\n\\gdesc\n\\echo huNONCE 1 run\n\\g\n\\echo huNONCE 1 end/);
  });

  it("reads rows, tags, NULLs apart from empty text, and the statement that failed", () => {
    const n = "huNONCE";
    const out = [
      `${n} 0 describe`, "The command has no result, or the result has no columns.", `${n} 0 run`, "INSERT 0 3", `${n} 0 end`,
      `${n} 1 describe`, "Column,Type", "a,integer", "b,text", 'c,"numeric(10,2)"', `${n} 1 run`, "a,b,c", '1,"x,""y""",1.50', `2,${n}N,${n}N`, "3,,0.00", `${n} 1 end`,
      `${n} 2 describe`, "",
    ].join("\n");
    const err = 'psql:<stdin>:20: ERROR:  column "nope" does not exist\nLINE 1: SELECT nope FROM t\n               ^\n';
    const r = readQueryOutput(out, err, ["INSERT INTO t VALUES (1), (2), (3)", "SELECT * FROM t", "SELECT nope FROM t"], n, false);
    assert.deepEqual(r.results[0], { kind: "command", statement: "INSERT INTO t VALUES (1), (2), (3)", tag: "INSERT 0 3" });
    const rows = r.results[1];
    assert.equal(rows.kind, "rows");
    if (rows.kind !== "rows") return;
    assert.deepEqual(rows.columns.map((c) => [c.name, c.type, c.typeName]), [["a", 23, "integer"], ["b", 25, "text"], ["c", 1700, "numeric(10,2)"]]);
    assert.deepEqual(rows.rows, [["1", 'x,"y"', "1.50"], ["2", null, null], ["3", "", "0.00"]]);
    assert.equal(rows.tag, "SELECT 3");
    assert.equal(r.results.length, 2);
    assert.deepEqual(r.error, { message: 'column "nope" does not exist\nLINE 1: SELECT nope FROM t\n               ^', statement: "SELECT nope FROM t" });
  });

  it("keeps at most 500 rows of a result and says so", () => {
    const n = "huN";
    const body = Array.from({ length: 501 }, (_, i) => String(i)).join("\n");
    const out = `${n} 0 describe\nColumn,Type\ng,integer\n${n} 0 run\ng\n${body}\n${n} 0 end\n`;
    const r = readQueryOutput(out, "", ["SELECT generate_series(0, 500) AS g"], n, false);
    assert.equal(r.truncated, true);
    assert.equal(r.results[0].kind === "rows" && r.results[0].rows.length, 500);
  });

  it("parses CSV quoting the way psql writes it", () => {
    assert.deepEqual(parseCsv('a,"b ""q""",\n"x\ny",z\n'), [["a", 'b "q"', ""], ["x\ny", "z"]]);
    assert.equal(typeId("numeric(10,2)"), 1700);
    assert.equal(typeId("character varying(20)"), 1043);
    assert.equal(typeId("my_enum"), 25);
  });
});

describe("Mongo documents in the panel", () => {
  it("show ids, dates, and numbers as text, and stay readable", () => {
    assert.equal(ejsonCell({ $oid: "6650c1f0a1b2c3d4e5f60718" }), 'ObjectId("6650c1f0a1b2c3d4e5f60718")');
    assert.equal(ejsonCell({ $date: { $numberLong: "1790845200000" } }), "2026-10-01T09:00:00.000Z");
    assert.equal(ejsonCell({ $numberInt: "4" }), "4");
    assert.equal(ejsonCell(["a", { $numberDouble: "1.5" }]), '["a",1.5]');
    assert.deepEqual(relaxed({ n: { $numberLong: "9007199254740993" }, a: [{ $numberInt: "1" }] }), { n: "9007199254740993", a: [1] });
  });
});

describe("which MongoDB runs", () => {
  it("is 8.0 except on the kernels MongoDB 8 refuses (6.19 to 7.0.13)", () => {
    for (const k of ["6.10.14-linuxkit", "6.18.3", "7.0.14-linuxkit", "7.1.0", "8.2.1"]) assert.equal(mongo8Runs(k), true, k);
    for (const k of ["6.19.0", "6.19.7-generic", "7.0.0", "7.0.12-linuxkit", "7.0.13"]) assert.equal(mongo8Runs(k), false, k);
  });
});

describe("database routes and bodies", () => {
  it("match only a workspace's db routes", () => {
    assert.deepEqual(DB_ROUTE.exec("/v1/workspaces/wk3j6q2m7xa/db/query")?.slice(1), ["wk3j6q2m7xa", "query"]);
    assert.deepEqual(DB_ROUTE.exec("/v1/workspaces/wk3j6q2m7xa/db")?.slice(1), ["wk3j6q2m7xa", undefined]);
    for (const p of ["/v1/workspaces/wk3j6q2m7xa/dbx", "/v1/workspaces/wK3j6q2m7xa/db/query", "/v1/workspaces/wk3j6q2m7xa/db/drop"]) assert.equal(DB_ROUTE.test(p), false, p);
  });

  it("take SQL, or a collection with a filter and a limit of at most 500", () => {
    assert.ok(DbQuery.safeParse({ sql: "SELECT 1" }).success);
    assert.ok(DbQuery.safeParse({ collection: "recipes", filter: { title: "x" }, limit: 500, database: "test" }).success);
    assert.ok(!DbQuery.safeParse({ collection: "recipes", limit: 501 }).success);
    assert.ok(!DbQuery.safeParse({ collection: "$cmd" }).success);
    assert.ok(!DbQuery.safeParse({ sql: "" }).success);
    assert.ok(!DbQuery.safeParse({ sql: "SELECT 1", command: "rm" }).success);
  });

  it("accept a lesson's setup on runs, and a test's sql and seed only with one", () => {
    const base = { recipe: "typescript", files: [{ name: "main.ts", content: "" }] };
    assert.ok(RunRequest.safeParse({ ...base, setup: "CREATE TABLE t (a int);", tests: [{ sql: "INSERT INTO t VALUES (1);" }] }).success);
    assert.ok(RunRequest.safeParse({ ...base, setup: { postgres: "CREATE TABLE t (a int);" } }).success);
    assert.ok(RunRequest.safeParse({ ...base, setup: { mongo: { recipes: [{ title: "x" }] } }, tests: [{ seed: { recipes: [] } }] }).success);
    assert.ok(!RunRequest.safeParse({ ...base, tests: [{ sql: "SELECT 1" }] }).success);
    assert.ok(!RunRequest.safeParse({ recipe: "bash", files: [{ name: "main.sh", content: "" }], setup: "SELECT 1" }).success);
  });
});

describe("template.json services", () => {
  const tree = (entries: Record<string, string>): TemplateFiles => ({
    read: (rel) => (rel in entries ? Buffer.from(entries[rel]) : null),
    list: (dir) => Object.keys(entries).filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes("/")).map((p) => p.slice(dir.length + 1)),
  });

  it("follow the outlines' convention: schema, seed, then migrations in name order, and a test twin without the seed", () => {
    const files = tree({
      "db/schema.sql": "CREATE TABLE t (a int);",
      "db/seed.sql": "INSERT INTO t VALUES (1);",
      "db/migrations/002_b.sql": "ALTER TABLE t ADD c int;",
      "db/migrations/001_a.sql": "-- +goose Up\nALTER TABLE t ADD b int;\n-- +goose Down\nALTER TABLE t DROP b;\n",
    });
    const { spec, build } = serviceSpec({ postgres: { databases: ["dev", "test"] } }, files);
    assert.equal(build, null);
    assert.deepEqual(spec.postgres?.sql?.map((s) => s.name), ["db/schema.sql", "db/seed.sql", "db/migrations/001_a.sql", "db/migrations/002_b.sql"]);
    assert.equal(spec.postgres?.sql?.[2].text.trim(), "ALTER TABLE t ADD b int;", "only the goose Up section runs");
    assert.deepEqual(spec.postgres?.testSql?.map((s) => s.name), ["db/schema.sql", "db/migrations/001_a.sql", "db/migrations/002_b.sql"]);
    assert.deepEqual(spec.postgres?.databases, ["dev", "test"]);
  });

  it("take named files, a build command, an empty start, and top-level schema files", () => {
    const files = tree({ "schema.sql": "CREATE TABLE t (a int);", "seed.sql": "INSERT INTO t VALUES (1);", "sql/one.sql": "SELECT 1;" });
    assert.deepEqual(serviceSpec({ postgres: {} }, files).spec.postgres?.sql?.map((s) => s.name), ["schema.sql", "seed.sql"]);
    assert.deepEqual(serviceSpec({ postgres: { sql: ["sql/one.sql"] } }, files).spec.postgres?.sql?.map((s) => s.name), ["sql/one.sql"]);
    assert.deepEqual(serviceSpec({ postgres: { build: ["npm", "run", "db:build"], databases: ["dev", "test"] } }, files), {
      spec: { postgres: { databases: ["dev", "test"] } },
      build: ["npm", "run", "db:build"],
    });
    assert.deepEqual(serviceSpec({ postgres: { empty: true } }, files).spec, { postgres: { databases: ["dev"], empty: true } });
    assert.throws(() => serviceSpec({ postgres: { sql: ["missing.sql"] } }, files), /names missing.sql/);
    assert.throws(() => serviceSpec({ postgres: {} }, tree({})), /no db\/schema.sql/);
    assert.deepEqual(serviceSpec(null, files), { spec: {}, build: null });
  });

  it("load a Mongo seed as Extended JSON or as an archive", () => {
    const json = serviceSpec({ mongo: { databases: ["dev", "test"] } }, tree({ "db/seed.json": '{"recipes":[]}' })).spec.mongo;
    assert.deepEqual(json, { databases: ["dev", "test"], documents: '{"recipes":[]}' });
    const archive = serviceSpec({ mongo: {} }, tree({ "db/seed.archive.gz": "gz" })).spec.mongo;
    assert.equal(archive?.archive?.toString(), "gz");
    assert.deepEqual(serviceSpec({ mongo: {} }, tree({})).spec.mongo, { databases: ["dev"] });
  });

  it("hand back a Mongo build command when there's no seed file, and start an empty build empty", () => {
    const built = serviceSpec({ mongo: { build: ["npm", "run", "db:reset"], databases: ["dev", "test"] } }, tree({}));
    assert.deepEqual(built, { spec: { mongo: { databases: ["dev", "test"] } }, build: null, mongoBuild: ["npm", "run", "db:reset"] });
    const seeded = serviceSpec({ mongo: { build: ["npm", "run", "db:reset"] } }, tree({ "db/seed.json": "{}" }));
    assert.equal(seeded.mongoBuild, undefined, "a seed file wins over the command");
    assert.deepEqual(serviceSpec({ postgres: { build: [], databases: ["dev"] } }, tree({})), { spec: { postgres: { databases: ["dev"], empty: true } }, build: null });
  });

  it("keep a goose file's Up section only", () => {
    assert.equal(upOnly({ name: "x.sql", text: "SELECT 1;" }).text, "SELECT 1;");
    assert.equal(upOnly({ name: "x.sql", text: "-- +goose Up\n-- +goose StatementBegin\nSELECT 2;\n-- +goose StatementEnd\n" }).text, "\n-- +goose StatementBegin\nSELECT 2;\n-- +goose StatementEnd\n");
  });
});
