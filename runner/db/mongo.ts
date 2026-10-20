import type Docker from "dockerode";
import { execCollect, openExec, Session } from "./exec.ts";
import { checkIdent, checkPassword } from "./names.ts";

/**
 * The runner's side of hu-mongo (architecture §3.4, §4.5, PLAN.md B.1): a one-
 * node replica set rs0 with --auth and --noscripting, run through one long-
 * lived mongosh inside the container as root. Every command is a call to one
 * of the fixed helpers below: names are checked by names.ts, and documents (a
 * lesson's setup, a test's seed, a panel filter) arrive as JSON text that
 * EJSON.parse reads as data, never as code. Server-side JavaScript is off, so
 * no filter can run any either, and the panel's queries run on a connection
 * logged in as the workspace's own user.
 */

/** The helpers, defined once per session. Joined into one line: mongosh reads a statement per line. */
const HELPERS = `
globalThis.__hu = function (fn) {
  let r;
  try { r = { ok: true, value: fn() }; }
  catch (e) { r = { ok: false, error: String((e && e.message) || e), code: (e && e.codeName) || null }; }
  print("\\u0002" + EJSON.stringify(r, { relaxed: true }));
};
globalThis.__huInit = function () {
  let initiated = true;
  try { rs.status(); } catch (e) { if (e.codeName !== "NotYetInitialized") throw e; initiated = false; }
  if (!initiated) rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "mongo:27017" }] });
  const until = Date.now() + 30000;
  while (!db.hello().isWritablePrimary) { if (Date.now() > until) throw new Error("The replica set has no primary."); sleep(100); }
  const admin = db.getSiblingDB("admin");
  if (!admin.getRole("hu_rs_status")) admin.createRole({ role: "hu_rs_status", privileges: [{ resource: { cluster: true }, actions: ["replSetGetStatus", "replSetGetConfig"] }], roles: [] });
  return { initiated: !initiated, version: db.version() };
};
globalThis.__huUser = function (user, pwd, dbs) {
  const admin = db.getSiblingDB("admin");
  const roles = dbs.flatMap((d) => [{ role: "readWrite", db: d }, { role: "dbAdmin", db: d }]).concat([{ role: "hu_rs_status", db: "admin" }]);
  if (admin.getUser(user)) admin.updateUser(user, { pwd, roles });
  else admin.createUser({ user, pwd, roles });
  return true;
};
globalThis.__huDropUser = function (user) {
  const admin = db.getSiblingDB("admin");
  if (admin.getUser(user)) admin.dropUser(user);
  return true;
};
globalThis.__huDrop = function (name) { db.getSiblingDB(name).dropDatabase(); return true; };
globalThis.__huLoad = function (name, docs) {
  const d = db.getSiblingDB(name);
  let n = 0;
  for (const [c, list] of Object.entries(docs)) {
    if (c === "$indexes") continue;
    if (!d.getCollectionNames().includes(c)) d.createCollection(c);
    if (list.length) { d.getCollection(c).insertMany(list, { ordered: true }); n += list.length; }
  }
  for (const [c, specs] of Object.entries(docs.$indexes || {})) {
    d.runCommand({ createIndexes: c, indexes: specs.map((s, i) => Object.assign({ name: "hu_" + c + "_" + i }, s)) });
  }
  return n;
};
globalThis.__huClone = function (from, to) {
  const src = db.getSiblingDB(from);
  const dst = db.getSiblingDB(to);
  dst.dropDatabase();
  const infos = src.getCollectionInfos();
  for (const info of infos.filter((i) => i.type === "collection" && !i.name.startsWith("system."))) {
    const options = Object.assign({}, info.options || {});
    delete options.uuid;
    dst.createCollection(info.name, options);
    const cursor = src.getCollection(info.name).find().batchSize(1000);
    let batch = [];
    while (cursor.hasNext()) { batch.push(cursor.next()); if (batch.length === 1000) { dst.getCollection(info.name).insertMany(batch); batch = []; } }
    if (batch.length) dst.getCollection(info.name).insertMany(batch);
    const indexes = src.getCollection(info.name).getIndexes().filter((i) => i.name !== "_id_").map((i) => { const x = Object.assign({}, i); delete x.v; delete x.ns; return x; });
    if (indexes.length) dst.runCommand({ createIndexes: info.name, indexes });
  }
  for (const info of infos.filter((i) => i.type === "view")) dst.createView(info.name, info.options.viewOn, info.options.pipeline, info.options.collation ? { collation: info.options.collation } : {});
  return true;
};
globalThis.__huList = function () {
  const names = db.adminCommand({ listDatabases: 1, nameOnly: true }).databases.map((d) => d.name);
  const users = db.getSiblingDB("admin").getUsers().users.map((u) => u.user);
  return { databases: names, users };
};
globalThis.__huSizes = function (names) {
  const out = {};
  for (const n of names) { const s = db.getSiblingDB(n).stats(); out[n] = (s.storageSize || 0) + (s.indexSize || 0); }
  return out;
};
globalThis.__huSchema = function (name) {
  const d = db.getSiblingDB(name);
  return d.getCollectionInfos().filter((i) => !i.name.startsWith("system.")).sort((a, b) => (a.name < b.name ? -1 : 1)).map((i) => ({
    name: i.name,
    type: i.type === "view" ? "view" : "collection",
    count: i.type === "view" ? null : d.getCollection(i.name).estimatedDocumentCount(),
    indexes: i.type === "view" ? [] : d.getCollection(i.name).getIndexes().map((x) => ({ name: x.name, key: x.key, unique: !!x.unique })),
  }));
};
globalThis.__huQuery = function (user, pwd, name, coll, filter, limit) {
  const conn = new Mongo("mongodb://" + user + ":" + pwd + "@127.0.0.1:27017/" + name + "?authSource=admin&directConnection=true");
  try {
    const docs = conn.getDB(name).getCollection(coll).find(filter).limit(limit + 1).maxTimeMS(10000).toArray();
    return { truncated: docs.length > limit, docs: docs.slice(0, limit).map((x) => EJSON.stringify(x, { relaxed: false })) };
  } finally { conn.close(); }
};
`
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .join(" ");

export class MongoError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null) {
    super(message);
    this.code = code;
  }
}

/** A JSON value as a JavaScript literal on one line of mongosh. */
const lit = (value: unknown) => JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
/** JSON text read as Extended JSON ({"$oid": …}, {"$date": …}) inside mongosh: data, not code. */
const ejson = (text: string) => `EJSON.parse(${lit(text)})`;

export interface MongoCollectionInfo {
  name: string;
  type: "collection" | "view";
  count: number | null;
  indexes: { name: string; key: Record<string, unknown>; unique: boolean }[];
}

export class MongoAdmin {
  private readonly container: Docker.Container;
  private readonly session: Session;
  private defined = false;

  constructor(docker: Docker, containerName: string, rootPassword: () => string) {
    this.container = docker.getContainer(containerName);
    this.session = new Session(
      async () => {
        this.defined = false;
        const uri = `mongodb://root:${checkPassword(rootPassword())}@127.0.0.1:27017/admin?authSource=admin&directConnection=true`;
        return openExec(this.container, ["mongosh", "--quiet", "--norc", uri], { env: ["HOME=/tmp"] });
      },
      (command, mark) => `${command}\nprint(${JSON.stringify(mark)})\n`,
      false
    );
  }

  /** Calls one helper with arguments already written as JavaScript, and answers its value. */
  private async call<T>(helper: string, args: string[], timeoutMs = 30_000): Promise<T> {
    if (!this.defined) {
      await this.session.run(HELPERS, timeoutMs);
      this.defined = true;
    }
    const { out } = await this.session.run(`__hu(() => ${helper}(${args.join(", ")}))`, timeoutMs);
    const at = out.lastIndexOf("\u0002");
    if (at < 0) {
      // The shell may have restarted since the helpers were defined.
      this.defined = false;
      throw new MongoError(`mongosh didn't answer: ${out.trim().slice(-300) || "no output"}`, null);
    }
    const result = JSON.parse(out.slice(at + 1).split("\n")[0]) as { ok: boolean; value?: T; error?: string; code?: string | null };
    if (!result.ok) throw new MongoError(result.error ?? "mongosh failed", result.code ?? null);
    return result.value as T;
  }

  close() {
    this.session.close();
    this.defined = false;
  }

  /** Whether mongod answers a ping. Needs no login. */
  async ping(): Promise<boolean> {
    try {
      const r = await execCollect(this.container, ["mongosh", "--quiet", "--norc", "--host", "127.0.0.1", "--eval", "db.runCommand({ping:1}).ok"], {
        env: ["HOME=/tmp"],
        timeoutMs: 15_000,
      });
      return r.code === 0 && r.stdout.toString().trim() === "1";
    } catch {
      return false;
    }
  }

  /** Whether the server running is the real one, a replica set member, and not the entrypoint's first run without --replSet. */
  async serving(): Promise<boolean> {
    try {
      const r = await execCollect(
        this.container,
        ["mongosh", "--quiet", "--norc", "--host", "127.0.0.1", "--eval", "const h = db.hello(); print(h.setName || h.isreplicaset ? 'rs' : 'init')"],
        { env: ["HOME=/tmp"], timeoutMs: 15_000 }
      );
      return r.code === 0 && r.stdout.toString().trim() === "rs";
    } catch {
      return false;
    }
  }

  /** Initiates the replica set once, waits for a primary, and makes the rs.status() role. */
  init(): Promise<{ initiated: boolean; version: string }> {
    return this.call("__huInit", [], 60_000);
  }

  /**
   * A user with readWrite and dbAdmin on exactly `dbs`, plus rs.status().
   * dbAdmin lets a codebase's own seed script drop and rebuild its database
   * (Mongoose's dropDatabase, syncIndexes), and reaches nothing outside it.
   * Users live in admin, so URIs say authSource=admin.
   */
  async user(user: string, password: string, dbs: string[]): Promise<void> {
    await this.call("__huUser", [lit(checkIdent(user)), lit(checkPassword(password)), lit(dbs.map(checkIdent))]);
  }

  async dropUser(user: string): Promise<void> {
    await this.call("__huDropUser", [lit(checkIdent(user))]);
  }

  async dropDatabase(name: string): Promise<void> {
    await this.call("__huDrop", [lit(checkIdent(name))]);
  }

  /** Loads documents, `{ "<collection>": [EJSON documents], "$indexes": { "<collection>": [{ key, unique? }] } }`, as JSON text. */
  async load(name: string, documents: string): Promise<number> {
    return this.call("__huLoad", [lit(checkIdent(name)), ejson(documents)], 120_000);
  }

  /** Replaces `to` with a copy of `from`: collection options, documents, indexes, and views. */
  async clone(from: string, to: string): Promise<void> {
    await this.call("__huClone", [lit(checkIdent(from)), lit(checkIdent(to))], 120_000);
  }

  async list(): Promise<{ databases: string[]; users: string[] }> {
    return this.call("__huList", []);
  }

  async sizes(names: string[]): Promise<Record<string, number>> {
    return this.call("__huSizes", [lit(names.map(checkIdent))]);
  }

  async schema(name: string): Promise<MongoCollectionInfo[]> {
    return this.call("__huSchema", [lit(checkIdent(name))]);
  }

  /**
   * The panel's query, on a connection logged in as the workspace's user, so
   * it reads exactly what the learner's own code could. The filter is JSON
   * text read as Extended JSON.
   */
  async query(user: string, password: string, name: string, collection: string, filter: string, limit: number): Promise<{ truncated: boolean; docs: string[] }> {
    return this.call("__huQuery", [lit(checkIdent(user)), lit(checkPassword(password)), lit(checkIdent(name)), lit(collection), ejson(filter), lit(limit)], 20_000);
  }

  /** Dumps a database as a gzip archive into `sink`: mongodump inside the container, a fixed command on which no learner code runs. */
  async dump(name: string, rootPassword: string, sink: NodeJS.WritableStream): Promise<void> {
    const r = await execCollect(this.container, ["mongodump", "--quiet", `--uri=${rootUri(rootPassword)}`, `--db=${checkIdent(name)}`, "--archive", "--gzip"], {
      env: ["HOME=/tmp"],
      timeoutMs: 600_000,
      sink,
    });
    if (r.code !== 0) throw new MongoError(`mongodump failed: ${r.stderr.toString().trim().slice(-300) || r.code}`, null);
  }

  /**
   * Restores a template's archive (a mongodump --archive --gzip of one
   * database, whatever it was called) into `name`: content, a fixed command.
   */
  async restoreInto(name: string, rootPassword: string, archive: Buffer): Promise<void> {
    const r = await execCollect(
      this.container,
      [
        "mongorestore", "--quiet", `--uri=${rootUri(rootPassword)}`, "--archive", "--gzip", "--drop",
        "--nsExclude=admin.*", "--nsExclude=config.*", "--nsExclude=local.*",
        "--nsFrom=$db$.$coll$", `--nsTo=${checkIdent(name)}.$coll$`,
      ],
      { env: ["HOME=/tmp"], timeoutMs: 600_000, stdin: archive }
    );
    if (r.code !== 0) throw new MongoError(`mongorestore failed: ${r.stderr.toString().trim().slice(-300) || r.code}`, null);
  }

  /** Restores a dump of `name` into `name` (only its own namespace, never users or roles). */
  async restore(name: string, rootPassword: string, archive: NodeJS.ReadableStream): Promise<void> {
    const r = await execCollect(
      this.container,
      ["mongorestore", "--quiet", `--uri=${rootUri(rootPassword)}`, `--nsInclude=${checkIdent(name)}.*`, "--drop", "--archive", "--gzip"],
      { env: ["HOME=/tmp"], timeoutMs: 600_000, stdin: archive }
    );
    if (r.code !== 0) throw new MongoError(`mongorestore failed: ${r.stderr.toString().trim().slice(-300) || r.code}`, null);
  }
}

function rootUri(password: string): string {
  return `mongodb://root:${checkPassword(password)}@127.0.0.1:27017/?authSource=admin&directConnection=true`;
}
