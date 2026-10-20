import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type Docker from "dockerode";
import type { Owner } from "../docker.ts";
import type { Log } from "../log.ts";
import { Clients, pgEnv } from "./clients.ts";
import { MongoError, type MongoCollectionInfo } from "./mongo.ts";
import {
  LEFTOVER,
  checkName,
  hashOf,
  lessonTemplateName,
  newPassword,
  oldName,
  runName,
  templateName,
  workspaceNames,
} from "./names.ts";
import { MAX_OUTPUT, MAX_ROWS, SCHEMA_SQL, ejsonCell, newNonce, queryArgs, queryScript, readQueryOutput, relaxed, type SqlAnswer, type TableInfo } from "./panel.ts";
import { PgError } from "./postgres.ts";
import { DbError, DbServices, type DbKind, type ServiceState } from "./services.ts";

export { DbError } from "./services.ts";

/**
 * The databases of workspaces, checks, and single-file runs (architecture
 * §4.5, PLAN.md 7.3 P2 items 1 to 3). One shared PostgreSQL and one MongoDB
 * hold them all: a role (or user) and databases per workspace, cloned from
 * template databases that are built once per template hash, throwaway clones
 * for checks and runs, resets in about 20 ms, a size watch, and databases
 * parked as dumps after 30 days unused.
 *
 * The workspace lane calls attach() when a workspace whose template uses a
 * database starts (its container gets the env vars and joins the network),
 * resetWorkspace() for a reset's db scope, checkDatabase() for a check, and
 * dropWorkspace() on delete. runner/README.md documents each.
 */

const MiB = 1024 * 1024;
const DAY = 24 * 3_600_000;

/** One SQL file of a template: its schema, its seed, or a migration, run in order. */
export interface SqlSource {
  name: string;
  text: string;
}

/** A template.json's `services`, with the content Next resolved from the template's db/ folder. */
export interface ServiceSpec {
  postgres?: {
    /** The databases a workspace gets: dev (DATABASE_URL), and test (TEST_DATABASE_URL). */
    databases?: ("dev" | "test")[];
    /** The template database: these files run in order as its builder role (schema.sql, seed.sql, migrations). */
    sql?: SqlSource[];
    /** The test twin (schema only, no seed). The dev template when left out. */
    testSql?: SqlSource[];
    /** Start from an empty database (startup-migration parts). */
    empty?: boolean;
  };
  mongo?: {
    databases?: ("dev" | "test")[];
    /** JSON text: `{ "<collection>": [EJSON documents], "$indexes": { "<collection>": [{ key, unique? }] } }`. */
    documents?: string;
    /** Or a `mongodump --archive --gzip` of one database (seed.archive.gz): documents, indexes, and options. */
    archive?: Buffer;
    /** For the test database. Empty when left out. */
    testDocuments?: string;
  };
}

/** Which template and checkpoint a workspace starts from, for the template database's name. */
export interface TemplateRef {
  course: string;
  template: string;
  checkpoint?: string;
  /** The template's own hash (meta.json's templateHash), when its build depends on more than the SQL above. */
  hash?: string;
}

/**
 * Builds a template database with a command (template.json `services.postgres.build`,
 * like `npm run db:build`): the caller runs it in a job from the template's image,
 * with these variables, on this network. The SQL files above need no builder.
 */
export type Builder = (target: { env: string[]; network: string; database: string }) => Promise<void>;

interface PgRecord {
  role: string;
  password: string;
  /** The template resets clone from: the newest content's. */
  template: string;
  testTemplate: string | null;
  databases: string[];
}

interface MongoRecord {
  user: string;
  password: string;
  template: string | null;
  testTemplate: string | null;
  databases: string[];
}

interface WorkspaceRecord {
  postgres?: PgRecord;
  mongo?: MongoRecord;
  createdAt: number;
  lastUsedAt: number;
  /** Set while the databases sit in HU_DATA_DIR/db/parked/<id>/ instead of the servers. */
  parkedAt?: number;
  /** Databases the size watch closed. A reset opens them again. */
  blocked?: string[];
  /** Databases the size watch warned about, so it warns once. */
  warned?: string[];
}

interface State {
  version: 1;
  workspaces: Record<string, WorkspaceRecord>;
  /** Mongo templates finished in this data folder (a half-loaded one looks the same as a finished one). */
  mongoTemplates: Record<string, number>;
}

/** What a container needs to reach its databases. */
export interface Attachment {
  env: string[];
  network: string;
}

/** A check's throwaway databases. */
export interface CheckDatabase extends Attachment {
  databases: { postgres?: string; mongo?: string };
  drop(): Promise<void>;
}

/** A single-file run's databases: one fresh clone per test. */
export interface RunDatabases {
  network: string;
  /** The variables for test i (or the Run, i = 0). */
  env(i: number): Record<string, string>;
  release(): Promise<void>;
}

/** What `setup` and a test's `sql` or `seed` hold (architecture §6.3, §6.4). */
export type Setup = string | { postgres: string } | { mongo: Record<string, unknown> };

export type DbEvent = { t: "limit"; kind: "quota"; message: string } | { t: "db"; state: "reset" | "restarting" | "unavailable" };

export interface DatabasesOptions {
  docker: Docker;
  owner: Owner;
  dataDir: string;
  log: Log;
  env?: NodeJS.ProcessEnv;
}

export class Databases {
  readonly services: DbServices;
  readonly clients: Clients;
  private readonly docker: Docker;
  private readonly owner: Owner;
  private readonly log: Log;
  private readonly dir: string;
  private readonly stateFile: string;
  private store: State;
  private readonly building = new Map<string, Promise<void>>();
  private readonly locks = new Map<string, Promise<unknown>>();
  /** ck_ and run_ databases (and old resets) this runner is using, which the leftover sweep spares. */
  private readonly active = new Set<string>();
  private readonly listeners = new Set<(workspace: string, event: DbEvent) => void>();
  private readonly config: { sizeWarnBytes: number; sizeLimitBytes: number; parkMs: number; sizePollMs: number };
  private lastSizeCheck = 0;
  private lastParkCheck = 0;
  private dropping: Promise<void> = Promise.resolve();

  constructor(options: DatabasesOptions) {
    const env = options.env ?? process.env;
    this.docker = options.docker;
    this.owner = options.owner;
    this.log = options.log;
    this.config = {
      sizeWarnBytes: num(env.HU_DB_SIZE_WARN_MB, 512) * MiB,
      sizeLimitBytes: num(env.HU_DB_SIZE_LIMIT_MB, 1024) * MiB,
      parkMs: num(env.HU_DB_PARK_DAYS, 30) * DAY,
      sizePollMs: num(env.HU_DB_SIZE_POLL_MS, 30_000),
    };
    this.services = new DbServices({ docker: options.docker, owner: options.owner, dataDir: options.dataDir, log: options.log, idleMs: num(env.HU_DB_IDLE_MS, 30 * 60_000) });
    this.services.onUp = (kind) => this.sweepLeftovers(kind);
    this.clients = new Clients(options.docker, options.owner, options.log, () => this.services.network, this.services.names.tool);
    this.dir = path.join(options.dataDir, "db");
    mkdirSync(path.join(this.dir, "parked"), { recursive: true, mode: 0o700 });
    this.stateFile = path.join(this.dir, "state.json");
    this.store = this.load();
  }

  // ---------------------------------------------------------------- state

  private load(): State {
    try {
      const s = JSON.parse(readFileSync(this.stateFile, "utf8")) as State;
      if (s.version === 1) return { version: 1, workspaces: s.workspaces ?? {}, mongoTemplates: s.mongoTemplates ?? {} };
    } catch {
      /* none yet */
    }
    return { version: 1, workspaces: {}, mongoTemplates: {} };
  }

  private save() {
    const tmp = `${this.stateFile}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(this.store, null, 1)}\n`, { mode: 0o600 });
    renameSync(tmp, this.stateFile);
  }

  /** One operation per key at a time (a workspace, a template), in arrival order. */
  private async lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const settled = next.catch(() => {});
    this.locks.set(key, settled);
    try {
      return await next;
    } finally {
      if (this.locks.get(key) === settled) this.locks.delete(key);
    }
  }

  /** Workspace events: a size limit, a reset. The workspace lane forwards them on the events socket (§3.3). */
  onEvent(listener: (workspace: string, event: DbEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(workspace: string, event: DbEvent) {
    for (const l of this.listeners) l(workspace, event);
  }

  /** For /v1/health. */
  state(kind: DbKind): ServiceState {
    return this.services.state(kind);
  }

  /** Whether a workspace has databases (and which). */
  info(id: string): { postgres?: { databases: string[]; template: string }; mongo?: { databases: string[]; template: string | null }; parked: boolean; blocked: string[] } | null {
    const rec = this.store.workspaces[id];
    if (!rec) return null;
    return {
      ...(rec.postgres ? { postgres: { databases: rec.postgres.databases, template: rec.postgres.template } } : {}),
      ...(rec.mongo ? { mongo: { databases: rec.mongo.databases, template: rec.mongo.template } } : {}),
      parked: Boolean(rec.parkedAt),
      blocked: rec.blocked ?? [],
    };
  }

  // ---------------------------------------------------------------- templates

  /** The template database for a workspace template's PostgreSQL, built once per hash. */
  async postgresTemplate(ref: TemplateRef, spec: NonNullable<ServiceSpec["postgres"]>, builder?: Builder): Promise<{ template: string; testTemplate: string | null }> {
    if (spec.empty) return { template: "template1", testTemplate: null };
    const sources = spec.sql ?? [];
    if (!sources.length && !builder) throw new DbError(400, "bad_request", "This template's database has no SQL files and no build command.");
    const hash = hashOf(ref.hash ?? "", ...sources.flatMap((s) => [s.name, s.text]));
    const template = templateName(ref, hash);
    await this.buildPostgres(template, sources, builder);
    let testTemplate: string | null = null;
    if (spec.testSql?.length) {
      testTemplate = templateName({ ...ref, checkpoint: `${ref.checkpoint ?? "base"}_test` }, hashOf(hash, ...spec.testSql.flatMap((s) => [s.name, s.text])));
      await this.buildPostgres(testTemplate, spec.testSql);
    }
    return { template, testTemplate };
  }

  /** Builds a PostgreSQL template database unless it exists: one build per name at a time. */
  private buildPostgres(template: string, sources: SqlSource[], builder?: Builder): Promise<void> {
    let build = this.building.get(template);
    if (!build) {
      build = this.services
        .use("postgres", async () => {
          const dbs = await this.services.pg.databases();
          if (dbs.get(template)?.template) return;
          if (dbs.has(template)) await this.services.pg.dropTemplate(template);
          const started = Date.now();
          const password = newPassword();
          await this.services.pg.beginTemplate(template, password);
          try {
            const conn = { role: template, password, database: template };
            for (const source of sources) {
              const r = await this.clients.run(`tpl:${template}`, ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
                env: pgEnv(conn, ["PGOPTIONS=-c client_min_messages=warning"]),
                stdin: source.text,
                timeoutMs: 120_000,
              });
              if (r.code !== 0) {
                const message = r.stderr.toString("utf8").trim().replace(/^psql:<stdin>:/gm, `${source.name}:`);
                throw new DbError(500, "template_failed", `The template database ${template} didn't build: ${message || (r.timedOut ? "it ran out of time" : `psql exited with ${r.code}`)}`);
              }
            }
            if (builder) {
              await builder({ env: Object.entries(urls("postgres", conn)).map(([k, v]) => `${k}=${v}`), network: this.services.network, database: template });
            }
            await this.services.pg.finishTemplate(template);
            this.log.info("db.template_built", { template, ms: Date.now() - started });
          } catch (err) {
            await this.services.pg.dropTemplate(template).catch(() => {});
            throw err;
          } finally {
            await this.clients.forget(`tpl:${template}`);
          }
        })
        .finally(() => this.building.delete(template));
      this.building.set(template, build);
    }
    return build;
  }

  /** The template database for a Mongo template: its documents (or archive) loaded once per hash. */
  async mongoTemplate(ref: TemplateRef, documents: string | Buffer | undefined): Promise<string | null> {
    if (!documents) return null;
    const template = templateName(ref, hashOf(ref.hash ?? "", typeof documents === "string" ? documents : hashOf(documents.toString("base64"))));
    await this.buildMongo(template, documents);
    return template;
  }

  private buildMongo(template: string, documents: string | Buffer): Promise<void> {
    let build = this.building.get(template);
    if (!build) {
      build = this.services
        .use("mongo", async () => {
          const { databases } = await this.services.mongo.list();
          if (this.store.mongoTemplates[template] && databases.includes(template)) return;
          await this.services.mongo.dropDatabase(template);
          try {
            if (typeof documents === "string") await this.services.mongo.load(template, documents);
            else await this.services.mongo.restoreInto(template, this.services.secrets.mongo.password, documents);
          } catch (err) {
            await this.services.mongo.dropDatabase(template).catch(() => {});
            throw new DbError(500, "template_failed", `The template database ${template} didn't load: ${(err as Error).message}`);
          }
          this.store.mongoTemplates[template] = Date.now();
          this.save();
        })
        .finally(() => this.building.delete(template));
      this.building.set(template, build);
    }
    return build;
  }

  // ---------------------------------------------------------------- workspaces

  /**
   * Gives a workspace its databases, making them the first time: a role and
   * its databases cloned from the template (built first, once per hash), or
   * back from a parked dump. Answers the variables its container gets and the
   * network it joins. When content changed the template, the workspace keeps
   * its data and later resets use the new template.
   */
  attach(id: string, ref: TemplateRef, spec: ServiceSpec, builder?: Builder): Promise<Attachment> {
    return this.lock(`ws:${id}`, async () => {
      const names = workspaceNames(id);
      const rec: WorkspaceRecord = this.store.workspaces[id] ?? { createdAt: Date.now(), lastUsedAt: Date.now() };
      if (rec.parkedAt) await this.unpark(id, rec);
      if (spec.postgres) {
        const { template, testTemplate } = await this.postgresTemplate(ref, spec.postgres, builder);
        const want = [names.dev, ...(spec.postgres.databases?.includes("test") ? [names.test] : [])];
        const pg = rec.postgres ?? { role: names.role, password: newPassword(), template, testTemplate, databases: [] };
        pg.template = template;
        pg.testTemplate = testTemplate;
        await this.services.use("postgres", async () => {
          const roles = await this.services.pg.roles();
          if (!roles.has(pg.role)) await this.services.pg.createRole(pg.role, pg.password);
          const dbs = await this.services.pg.databases();
          for (const db of want) {
            if (!dbs.has(db)) await this.cloneFor(db, pg, db === names.test);
          }
        });
        pg.databases = want;
        rec.postgres = pg;
      }
      if (spec.mongo) {
        const template = await this.mongoTemplate(ref, spec.mongo.archive ?? spec.mongo.documents);
        const testTemplate = spec.mongo.testDocuments ? await this.mongoTemplate({ ...ref, checkpoint: `${ref.checkpoint ?? "base"}_test` }, spec.mongo.testDocuments) : null;
        const want = [names.dev, ...(spec.mongo.databases?.includes("test") ? [names.test] : [])];
        const mongo = rec.mongo ?? { user: names.role, password: newPassword(), template, testTemplate, databases: [] };
        const fresh = !rec.mongo;
        mongo.template = template;
        mongo.testTemplate = testTemplate;
        await this.services.use("mongo", async () => {
          await this.services.mongo.user(mongo.user, mongo.password, want);
          const { databases } = await this.services.mongo.list();
          for (const db of want) {
            const from = db === names.test ? mongo.testTemplate : mongo.template;
            if (from && (fresh || !databases.includes(db))) await this.services.mongo.clone(from, db);
          }
        });
        mongo.databases = want;
        rec.mongo = mongo;
      }
      rec.lastUsedAt = Date.now();
      this.store.workspaces[id] = rec;
      this.save();
      return { env: envList(this.envFor(rec)), network: this.services.network };
    });
  }

  /** The variables a workspace's container gets for its databases. */
  private envFor(rec: WorkspaceRecord): Record<string, string> {
    const env: Record<string, string> = {};
    if (rec.postgres) {
      const pg = rec.postgres;
      Object.assign(env, urls("postgres", { role: pg.role, password: pg.password, database: pg.databases[0] }));
      if (pg.databases[1]) env.TEST_DATABASE_URL = pgUrl(pg.role, pg.password, pg.databases[1]);
    }
    if (rec.mongo) {
      const m = rec.mongo;
      env.MONGODB_URI = mongoUrl(m.user, m.password, m.databases[0]);
      if (m.databases[1]) env.TEST_MONGODB_URI = mongoUrl(m.user, m.password, m.databases[1]);
    }
    return env;
  }

  /** The variables of a workspace that has databases, or null. */
  workspaceEnv(id: string): Attachment | null {
    const rec = this.store.workspaces[id];
    if (!rec) return null;
    return { env: envList(this.envFor(rec)), network: this.services.network };
  }

  private async cloneFor(db: string, pg: PgRecord, test: boolean): Promise<void> {
    const template = test && pg.testTemplate ? pg.testTemplate : pg.template;
    if (template === "template1") await this.services.pg.empty(db, pg.role);
    else await this.services.pg.clone(db, template, pg.role);
  }

  /**
   * The db scope of POST …/reset: each database back to its template, in
   * about 20 ms for PostgreSQL. The old database is set aside and dropped
   * after the answer. Answers how long the reset took.
   */
  resetWorkspace(id: string, which: "dev" | "test" | "all" = "all"): Promise<{ databases: string[]; ms: number }> {
    return this.lock(`ws:${id}`, async () => {
      const rec = this.store.workspaces[id];
      if (!rec) throw new DbError(409, "no_database", "This workspace has no database yet. Run it once to create it.");
      if (rec.parkedAt) await this.unpark(id, rec);
      const names = workspaceNames(id);
      const pick = (dbs: string[]) => dbs.filter((d) => which === "all" || (which === "test" ? d === names.test : d === names.dev));
      const started = performance.now();
      const done: string[] = [];
      const later: string[] = [];
      if (rec.postgres) {
        const pg = rec.postgres;
        await this.services.use("postgres", async () => {
          const dbs = await this.services.pg.databases();
          for (const db of pick(pg.databases)) {
            const template = db === names.test && pg.testTemplate ? pg.testTemplate : pg.template;
            if (!dbs.has(db) || template === "template1") {
              await this.services.pg.dropDatabase(db);
              await this.cloneFor(db, pg, db === names.test);
            } else {
              const old = oldName(db);
              this.active.add(old);
              await this.services.pg.reset(db, template, pg.role, old);
              later.push(old);
            }
            done.push(db);
          }
        });
      }
      const pgMs = performance.now() - started;
      if (rec.mongo) {
        const m = rec.mongo;
        await this.services.use("mongo", async () => {
          for (const db of pick(m.databases)) {
            const from = db === names.test ? m.testTemplate : m.template;
            if (from) await this.services.mongo.clone(from, db);
            else await this.services.mongo.dropDatabase(db);
            done.push(`mongo:${db}`);
          }
        });
      }
      const ms = performance.now() - started;
      rec.blocked = (rec.blocked ?? []).filter((d) => !done.includes(d));
      rec.warned = (rec.warned ?? []).filter((d) => !done.includes(d));
      rec.lastUsedAt = Date.now();
      this.save();
      // The set-aside databases go after the answer, off the clock.
      for (const old of later) this.dropAside(old);
      this.emit(id, { t: "db", state: "reset" });
      this.log.info("db.reset", { workspace: id, databases: done.join(" "), ms: Math.round(ms), pgMs: Math.round(pgMs) });
      return { databases: done, ms: Math.round(ms * 10) / 10 };
    });
  }

  /**
   * Drops set-aside databases one at a time, beside the admin session rather
   * than in it, and a moment later, so a burst of resets doesn't share the
   * disk with the drops.
   */
  private dropAside(db: string) {
    this.dropping = this.dropping
      .then(() => new Promise((resolve) => setTimeout(resolve, 2_000).unref()))
      .then(() => this.services.pg.dropDatabaseAside(db))
      .catch((err: Error) => this.log.warn("db.drop_failed", { db, error: err.message }))
      .finally(() => this.active.delete(db));
  }

  /** Removes a workspace's databases, role, user, and parked dumps (DELETE /v1/workspaces/:id). */
  dropWorkspace(id: string): Promise<void> {
    return this.lock(`ws:${id}`, async () => {
      const rec = this.store.workspaces[id];
      if (!rec) return;
      if (rec.postgres) {
        const pg = rec.postgres;
        await this.services.use("postgres", async () => {
          for (const db of pg.databases) await this.services.pg.dropDatabase(db);
          await this.services.pg.dropRole(pg.role);
        });
        await this.clients.forget(`ws:${id}`);
      }
      if (rec.mongo) {
        const m = rec.mongo;
        await this.services.use("mongo", async () => {
          for (const db of m.databases) await this.services.mongo.dropDatabase(db);
          await this.services.mongo.dropUser(m.user);
        });
      }
      rmSync(path.join(this.dir, "parked", id), { recursive: true, force: true });
      delete this.store.workspaces[id];
      this.save();
    });
  }

  /** Marks a workspace's databases used, for the parking clock. */
  touch(id: string) {
    const rec = this.store.workspaces[id];
    if (!rec) return;
    rec.lastUsedAt = Date.now();
    if (rec.postgres) this.services.touch("postgres");
    if (rec.mongo) this.services.touch("mongo");
  }

  // ---------------------------------------------------------------- checks

  /**
   * A check's own databases: a role (and user) and databases cloned from the
   * workspace's template, never from the learner's database, so rows a
   * learner added or changed by hand never decide a verdict. `empty` starts
   * PostgreSQL from nothing (startup-migration parts). Drop them when the
   * check ends.
   */
  async checkDatabase(id: string, mode: "clone" | "empty" = "clone"): Promise<CheckDatabase> {
    const rec = this.store.workspaces[id];
    if (!rec) throw new DbError(409, "no_database", "This workspace has no database yet. Run it once to create it.");
    const name = checkName(id);
    const password = newPassword();
    this.active.add(name);
    const env: Record<string, string> = {};
    const databases: CheckDatabase["databases"] = {};
    const drop = async () => {
      if (databases.postgres) {
        await this.services.pg.dropDatabase(name).catch(() => {});
        await this.services.pg.dropRole(name).catch(() => {});
      }
      if (databases.mongo) {
        await this.services.mongo.dropDatabase(name).catch(() => {});
        await this.services.mongo.dropUser(name).catch(() => {});
      }
      this.active.delete(name);
    };
    try {
      if (rec.postgres) {
        const pg = rec.postgres;
        await this.services.use("postgres", async () => {
          await this.services.pg.createRole(name, password);
          databases.postgres = name;
          if (mode === "empty" || pg.template === "template1") await this.services.pg.empty(name, name);
          else await this.services.pg.clone(name, pg.template, name);
        });
        Object.assign(env, urls("postgres", { role: name, password, database: name }));
      }
      if (rec.mongo) {
        const m = rec.mongo;
        await this.services.use("mongo", async () => {
          databases.mongo = name;
          await this.services.mongo.user(name, password, [name]);
          if (m.template && mode === "clone") await this.services.mongo.clone(m.template, name);
        });
        env.MONGODB_URI = mongoUrl(name, password, name);
      }
    } catch (err) {
      await drop();
      throw err;
    }
    return { env: envList(env), network: this.services.network, databases, drop };
  }

  // ---------------------------------------------------------------- single-file runs

  /**
   * A single-file run's databases (the "single with a database" format,
   * PLAN.md 4.4 and 6.4): a template built once from the lesson's setup, and
   * a fresh clone per test, with the test's own `sql` or `seed` applied to its
   * clone. PostgreSQL setups run as the template's builder role, and test SQL
   * as the run's role, in client containers. Mongo documents are data, loaded
   * by the fixed helpers.
   */
  async prepareRun(setup: Setup, tests: { sql?: string; seed?: string | Record<string, unknown> }[]): Promise<RunDatabases> {
    const pgSetup = typeof setup === "string" ? setup : "postgres" in setup ? setup.postgres : null;
    const mongoSetup = typeof setup === "object" && "mongo" in setup ? JSON.stringify(setup.mongo) : null;
    const count = Math.max(1, tests.length);
    const made: { kind: DbKind; name: string }[] = [];
    const envs: Record<string, string>[] = Array.from({ length: count }, () => ({}));
    const release = async () => {
      await Promise.all(
        made.map(async ({ kind, name }) => {
          if (kind === "postgres") {
            await this.services.pg.dropDatabase(name).catch(() => {});
            await this.services.pg.dropRole(name).catch(() => {});
            await this.clients.forget(`run:${name}`);
          } else {
            await this.services.mongo.dropDatabase(name).catch(() => {});
            await this.services.mongo.dropUser(name).catch(() => {});
          }
          this.active.delete(name);
        })
      );
    };
    try {
      if (pgSetup !== null) {
        const template = lessonTemplateName(hashOf("postgres", pgSetup));
        await this.buildPostgres(template, [{ name: "setup", text: pgSetup }]);
        await this.services.use("postgres", async () => {
          for (let i = 0; i < count; i++) {
            const name = runName();
            const password = newPassword();
            this.active.add(name);
            await this.services.pg.createRole(name, password);
            made.push({ kind: "postgres", name });
            await this.services.pg.clone(name, template, name);
            const conn = { role: name, password, database: name };
            const sql = tests[i]?.sql ?? (typeof tests[i]?.seed === "string" ? (tests[i].seed as string) : undefined);
            if (sql) {
              const r = await this.clients.run(`run:${name}`, ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
                env: pgEnv(conn, ["PGOPTIONS=-c client_min_messages=warning"]),
                stdin: sql,
                timeoutMs: 30_000,
              });
              if (r.code !== 0) throw new DbError(500, "setup_failed", `Test ${i + 1}'s SQL failed: ${r.stderr.toString().trim().replace(/^psql:<stdin>:/gm, "line ")}`);
              await this.clients.forget(`run:${name}`);
            }
            Object.assign(envs[i], urls("postgres", conn));
          }
        });
      }
      if (mongoSetup !== null) {
        const template = lessonTemplateName(hashOf("mongo", mongoSetup));
        await this.buildMongo(template, mongoSetup);
        await this.services.use("mongo", async () => {
          for (let i = 0; i < count; i++) {
            const name = runName();
            const password = newPassword();
            this.active.add(name);
            made.push({ kind: "mongo", name });
            await this.services.mongo.user(name, password, [name]);
            await this.services.mongo.clone(template, name);
            const seed = tests[i]?.seed;
            if (seed && typeof seed === "object") await this.services.mongo.load(name, JSON.stringify(seed));
            envs[i].MONGODB_URI = mongoUrl(name, password, name);
          }
        });
      }
    } catch (err) {
      await release();
      if (err instanceof PgError || err instanceof MongoError) throw new DbError(500, "setup_failed", `The lesson's database setup failed: ${err.message}`);
      throw err;
    }
    return { network: this.services.network, env: (i) => envs[Math.min(i, count - 1)], release };
  }

  // ---------------------------------------------------------------- the Database panel

  /**
   * GET …/db/schema: the tables (PostgreSQL) or collections (MongoDB) of a
   * workspace's database, read as the workspace's own role.
   */
  async schema(id: string, engine?: DbKind, which: "dev" | "test" = "dev"): Promise<PanelSchema> {
    const { rec, kind, db } = this.panelTarget(id, engine, which);
    if (rec.parkedAt) await this.lock(`ws:${id}`, () => this.unpark(id, rec));
    this.touch(id);
    if (kind === "postgres") {
      const pg = rec.postgres!;
      return this.services.use("postgres", async () => {
        const r = await this.clients.run(`ws:${id}`, ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
          env: pgEnv({ role: pg.role, password: pg.password, database: db }, ["PGOPTIONS=-c statement_timeout=10s"]),
          stdin: SCHEMA_SQL,
          timeoutMs: 15_000,
        });
        if (r.code !== 0) throw new DbError(502, "db_error", r.stderr.toString().trim().replace(/^psql:<stdin>:\d+: /gm, "") || "The database didn't answer.");
        const value = JSON.parse(r.stdout.toString("utf8").trim()) as { database: string; sizeBytes: number; tables: TableInfo[] };
        return { engine: "postgres", database: value.database, sizeBytes: value.sizeBytes, tables: value.tables };
      });
    }
    return this.services.use("mongo", async () => {
      const collections = await this.services.mongo.schema(db);
      const sizes = await this.services.mongo.sizes([db]);
      return { engine: "mongo", database: db, sizeBytes: sizes[db] ?? 0, collections };
    });
  }

  /**
   * POST …/db/query: SQL through psql as the workspace's role in its client
   * container, or a Mongo find() on a connection logged in as the
   * workspace's user. At most 500 rows (or documents), 10 s.
   */
  async query(id: string, body: { sql: string; database?: "dev" | "test" } | { collection: string; filter?: unknown; limit?: number; database?: "dev" | "test" }): Promise<SqlAnswer | MongoAnswer> {
    const started = Date.now();
    const engine: DbKind = "sql" in body ? "postgres" : "mongo";
    const { rec, db } = this.panelTarget(id, engine, body.database ?? "dev");
    if (rec.parkedAt) await this.lock(`ws:${id}`, () => this.unpark(id, rec));
    this.touch(id);
    if ("sql" in body) {
      const pg = rec.postgres!;
      return this.services.use("postgres", async () => {
        const nonce = newNonce();
        const { script, statements } = queryScript(body.sql, nonce);
        const r = await this.clients.run(`ws:${id}`, queryArgs(nonce), {
          env: pgEnv({ role: pg.role, password: pg.password, database: db }, ["PGOPTIONS=-c statement_timeout=10s"]),
          stdin: script,
          timeoutMs: 12_000,
          maxBytes: MAX_OUTPUT,
        });
        const { results, error, truncated } = readQueryOutput(r.stdout.toString("utf8"), r.stderr.toString("utf8"), statements, nonce, r.truncated || r.timedOut);
        const lastRows = [...results].reverse().find((x) => x.kind === "rows");
        const answer: SqlAnswer = {
          engine: "postgres",
          database: db,
          columns: lastRows?.kind === "rows" ? lastRows.columns : [],
          rows: lastRows?.kind === "rows" ? lastRows.rows : [],
          tag: results.at(-1)?.tag ?? null,
          error: error ?? (r.timedOut || (r.code === 137 && !error) ? { message: "The query ran past 10 seconds and was stopped.", statement: null } : null),
          truncated,
          results,
          ms: Date.now() - started,
        };
        return answer;
      });
    }
    const m = rec.mongo!;
    const limit = Math.min(Math.max(1, body.limit ?? 50), MAX_ROWS);
    return this.services.use("mongo", async () => {
      try {
        const r = await this.services.mongo.query(m.user, m.password, db, body.collection, JSON.stringify(body.filter ?? {}), limit);
        const documents = r.docs.map((d) => JSON.parse(d) as Record<string, unknown>);
        const columns: string[] = [];
        for (const d of documents) for (const k of Object.keys(d)) if (!columns.includes(k) && columns.length < 50) columns.push(k);
        return {
          engine: "mongo",
          database: db,
          collection: body.collection,
          columns: columns.map((name) => ({ name })),
          rows: documents.map((d) => columns.map((c) => (c in d ? ejsonCell(d[c]) : null))),
          documents,
          relaxed: documents.map(relaxed),
          tag: `${documents.length} document${documents.length === 1 ? "" : "s"}`,
          error: null,
          truncated: r.truncated,
          ms: Date.now() - started,
        } satisfies MongoAnswer;
      } catch (err) {
        if (!(err instanceof MongoError)) throw err;
        return { engine: "mongo", database: db, collection: body.collection, columns: [], rows: [], documents: [], relaxed: [], tag: null, error: { message: err.message, statement: null }, truncated: false, ms: Date.now() - started } satisfies MongoAnswer;
      }
    });
  }

  private panelTarget(id: string, engine: DbKind | undefined, which: "dev" | "test") {
    const rec = this.store.workspaces[id];
    const kind: DbKind | undefined = engine ?? (rec?.postgres ? "postgres" : rec?.mongo ? "mongo" : undefined);
    const dbs = kind === "postgres" ? rec?.postgres?.databases : kind === "mongo" ? rec?.mongo?.databases : undefined;
    if (!rec || !kind || !dbs) {
      throw new DbError(409, "no_database", engine ? `This workspace has no ${engine === "postgres" ? "PostgreSQL" : "MongoDB"} database.` : "This workspace has no database yet. Run it once to create it.");
    }
    const db = which === "test" ? dbs[1] : dbs[0];
    if (!db) throw new DbError(409, "no_database", "This workspace has no test database.");
    if (rec.blocked?.includes(db)) throw new DbError(409, "db_blocked", `This database passed its ${mb(this.config.sizeLimitBytes)} limit and was closed. Reset the database to keep going.`);
    return { rec, kind, db };
  }

  // ---------------------------------------------------------------- the size watch, parking, cleanup

  /**
   * Called every few seconds by the runner's reaper: stops idle servers,
   * watches the sizes of running workspaces' databases (every 30 s), and
   * parks databases unused for 30 days (hourly).
   */
  async tick(now = Date.now()): Promise<void> {
    const running = await this.runningWorkspaces();
    await this.services.stopIdle(now, (kind) => [...running].some((id) => Boolean(kind === "postgres" ? this.store.workspaces[id]?.postgres : this.store.workspaces[id]?.mongo)));
    if (now - this.lastSizeCheck >= this.config.sizePollMs) {
      this.lastSizeCheck = now;
      await this.watchSizes(running).catch((err: Error) => this.log.warn("db.size_watch_failed", { error: err.message }));
    }
    if (now - this.lastParkCheck >= 3_600_000) {
      this.lastParkCheck = now;
      await this.parkIdle(running, now).catch((err: Error) => this.log.warn("db.park_failed", { error: err.message }));
    }
  }

  /** Workspaces whose containers run, read from Docker's labels (hu.kind=workspace). */
  private async runningWorkspaces(): Promise<Set<string>> {
    try {
      const list = await this.docker.listContainers({ filters: { label: [`hu.managed=1`, `hu.ns=${this.owner.ns}`, "hu.kind=workspace"], status: ["running"] } });
      return new Set(list.map((c) => c.Labels["hu.workspace"]).filter((id): id is string => Boolean(id && this.store.workspaces[id])));
    } catch {
      return new Set();
    }
  }

  /** Warns at 512 MB and closes a database at 1 GB (HU_DB_SIZE_WARN_MB, HU_DB_SIZE_LIMIT_MB). */
  async watchSizes(ids: Iterable<string>): Promise<void> {
    const watched = [...ids].filter((id) => this.store.workspaces[id]?.postgres && !this.store.workspaces[id]?.parkedAt);
    if (!watched.length || this.services.state("postgres") !== "running") return;
    const all = watched.flatMap((id) => this.store.workspaces[id].postgres!.databases);
    const sizes = await this.services.pg.sizes(all);
    let changed = false;
    for (const id of watched) {
      const rec = this.store.workspaces[id];
      const pg = rec.postgres!;
      for (const db of pg.databases) {
        const size = sizes.get(db) ?? 0;
        if (size >= this.config.sizeLimitBytes && !rec.blocked?.includes(db)) {
          await this.services.pg.block(db, pg.role);
          rec.blocked = [...(rec.blocked ?? []), db];
          changed = true;
          this.log.warn("db.size_limit", { workspace: id, db, bytes: size });
          this.emit(id, { t: "limit", kind: "quota", message: `Your database ${db} passed ${mb(this.config.sizeLimitBytes)}, so its connections were closed and the server stopped. Reset the database to keep going.` });
        } else if (size >= this.config.sizeWarnBytes && !rec.warned?.includes(db) && !rec.blocked?.includes(db)) {
          rec.warned = [...(rec.warned ?? []), db];
          changed = true;
          this.emit(id, { t: "limit", kind: "quota", message: `Your database ${db} uses ${mb(size)}. At ${mb(this.config.sizeLimitBytes)} it closes until you reset it.` });
        }
      }
    }
    if (changed) this.save();
  }

  /** Dumps and drops the databases of workspaces unused for HU_DB_PARK_DAYS. They come back on the next attach, query, or reset. */
  async parkIdle(running: Set<string>, now = Date.now()): Promise<string[]> {
    const parked: string[] = [];
    for (const [id, rec] of Object.entries(this.store.workspaces)) {
      if (rec.parkedAt || running.has(id) || now - rec.lastUsedAt < this.config.parkMs) continue;
      await this.park(id).then(() => parked.push(id));
    }
    return parked;
  }

  /**
   * Parks a workspace's databases: PostgreSQL as `pg_dump -Fc` run as the
   * workspace's role (nothing of the learner's ever runs as the superuser),
   * MongoDB as a mongodump archive, both into HU_DATA_DIR/db/parked/<id>/,
   * then drops them.
   */
  park(id: string): Promise<void> {
    return this.lock(`ws:${id}`, async () => {
      const rec = this.store.workspaces[id];
      if (!rec || rec.parkedAt) return;
      const dir = path.join(this.dir, "parked", id);
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      if (rec.postgres) {
        const pg = rec.postgres;
        await this.services.use("postgres", async () => {
          const dbs = await this.services.pg.databases();
          for (const db of pg.databases.filter((d) => dbs.has(d))) {
            const file = path.join(dir, `${db}.dump`);
            const r = await this.clients.run(
              `ws:${id}`,
              ["pg_dump", "-Fc", "--no-owner", "--no-privileges", "--exclude-extension=pg_stat_statements", "--exclude-schema=hu_stats"],
              { env: pgEnv({ role: pg.role, password: pg.password, database: db }), timeoutMs: 600_000, sink: createWriteStream(`${file}.tmp`, { mode: 0o600 }) }
            );
            if (r.code !== 0) throw new DbError(500, "park_failed", `pg_dump of ${db} failed: ${r.stderr.toString().trim().slice(-300)}`);
            renameSync(`${file}.tmp`, file);
          }
          for (const db of pg.databases) await this.services.pg.dropDatabase(db);
        });
        await this.clients.forget(`ws:${id}`);
      }
      if (rec.mongo) {
        const m = rec.mongo;
        await this.services.use("mongo", async () => {
          const { databases } = await this.services.mongo.list();
          for (const db of m.databases.filter((d) => databases.includes(d))) {
            const file = path.join(dir, `${db}.archive.gz`);
            await this.services.mongo.dump(db, this.services.secrets.mongo.password, createWriteStream(`${file}.tmp`, { mode: 0o600 }));
            renameSync(`${file}.tmp`, file);
          }
          for (const db of m.databases) await this.services.mongo.dropDatabase(db);
        });
      }
      rec.parkedAt = Date.now();
      this.save();
      this.log.info("db.parked", { workspace: id });
    });
  }

  /** Brings parked databases back: an empty database restored from the dump as the workspace's role. */
  private async unpark(id: string, rec: WorkspaceRecord): Promise<void> {
    const dir = path.join(this.dir, "parked", id);
    if (rec.postgres) {
      const pg = rec.postgres;
      await this.services.use("postgres", async () => {
        const roles = await this.services.pg.roles();
        if (!roles.has(pg.role)) await this.services.pg.createRole(pg.role, pg.password);
        for (const db of pg.databases) {
          const file = path.join(dir, `${db}.dump`);
          await this.services.pg.dropDatabase(db);
          if (!existsSync(file)) {
            await this.cloneFor(db, pg, db !== pg.databases[0]);
            continue;
          }
          await this.services.pg.empty(db, pg.role);
          const r = await this.clients.run(`ws:${id}`, ["pg_restore", "--no-owner", "--no-privileges", "--exit-on-error", "-d", db], {
            env: pgEnv({ role: pg.role, password: pg.password, database: db }),
            stdin: createReadStream(file),
            timeoutMs: 600_000,
          });
          if (r.code !== 0) throw new DbError(500, "unpark_failed", `Restoring ${db} failed: ${r.stderr.toString().trim().slice(-300)}`);
        }
      });
    }
    if (rec.mongo) {
      const m = rec.mongo;
      await this.services.use("mongo", async () => {
        await this.services.mongo.user(m.user, m.password, m.databases);
        for (const db of m.databases) {
          const file = path.join(dir, `${db}.archive.gz`);
          if (existsSync(file) && statSync(file).size > 0) await this.services.mongo.restore(db, this.services.secrets.mongo.password, createReadStream(file));
        }
      });
    }
    rmSync(dir, { recursive: true, force: true });
    delete rec.parkedAt;
    rec.lastUsedAt = Date.now();
    this.save();
    this.log.info("db.unparked", { workspace: id });
  }

  /** When a server comes up: drops the check and run databases, half-built templates, and set-aside resets a crash left. */
  private async sweepLeftovers(kind: DbKind): Promise<void> {
    try {
      if (kind === "postgres") {
        const left = await this.services.pg.leftovers();
        for (const db of left.databases.filter((d) => !this.active.has(d))) await this.services.pg.dropDatabase(db);
        for (const t of left.templates.filter((t) => !this.building.has(t))) await this.services.pg.dropTemplate(t);
        for (const r of left.roles.filter((r) => !this.active.has(r) && !this.building.has(r))) await this.services.pg.dropRole(r).catch(() => {});
      } else {
        const { databases, users } = await this.services.mongo.list();
        for (const db of databases.filter((d) => LEFTOVER.test(d) && !this.active.has(d))) await this.services.mongo.dropDatabase(db);
        for (const u of users.filter((u) => /^(ck|run)_/.test(u) && !this.active.has(u))) await this.services.mongo.dropUser(u);
      }
    } catch (err) {
      this.log.warn("db.sweep_failed", { kind, error: (err as Error).message });
    }
  }

  /** Docker went away: forget the servers until it's back. */
  async refresh(): Promise<void> {
    await this.services.refresh();
  }

  async shutdown(): Promise<void> {
    await this.dropping;
    await this.clients.shutdown();
    await this.services.shutdown();
  }
}

export type PanelSchema =
  | { engine: "postgres"; database: string; sizeBytes: number; tables: TableInfo[] }
  | { engine: "mongo"; database: string; sizeBytes: number; collections: MongoCollectionInfo[] };

export interface MongoAnswer {
  engine: "mongo";
  database: string;
  collection: string;
  /** Top-level fields in the order they first appear (at most 50), for the table view. */
  columns: { name: string }[];
  /** One row per document: each field as text (ObjectId("…"), dates in ISO), null where a document lacks it. */
  rows: (string | null)[][];
  /** The documents in canonical Extended JSON, for the document view. */
  documents: Record<string, unknown>[];
  /** The same documents readable: numbers as numbers, ids and dates as text. */
  relaxed: unknown[];
  tag: string | null;
  error: { message: string; statement: string | null } | null;
  truncated: boolean;
  ms: number;
}

function pgUrl(role: string, password: string, database: string): string {
  return `postgres://${role}:${password}@db:5432/${database}`;
}

function mongoUrl(user: string, password: string, database: string): string {
  return `mongodb://${user}:${password}@mongo:27017/${database}?replicaSet=rs0&authSource=admin`;
}

/** The variables a program uses to reach PostgreSQL: a URL, libpq's own (so psql needs no arguments), and Spring's. */
function urls(_kind: "postgres", conn: { role: string; password: string; database: string }): Record<string, string> {
  return {
    DATABASE_URL: pgUrl(conn.role, conn.password, conn.database),
    PGHOST: "db",
    PGPORT: "5432",
    PGUSER: conn.role,
    PGPASSWORD: conn.password,
    PGDATABASE: conn.database,
    DB_URL: `jdbc:postgresql://db:5432/${conn.database}`,
    DB_USER: conn.role,
    DB_PASSWORD: conn.password,
  };
}

function envList(env: Record<string, string>): string[] {
  return Object.entries(env).map(([k, v]) => `${k}=${v}`);
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 ? n : fallback;
}

function mb(bytes: number): string {
  return bytes >= 1024 * MiB ? `${Math.round((bytes / (1024 * MiB)) * 10) / 10} GB` : `${Math.round(bytes / MiB)} MB`;
}
