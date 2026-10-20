import { readFileSync } from "node:fs";
import path from "node:path";
import type Docker from "dockerode";
import { execCollect, openExec, Session } from "./exec.ts";
import { checkIdent, checkPassword, LEFTOVER } from "./names.ts";

/**
 * The runner's side of hu-postgres (architecture §3.4, §4.5): fixed SQL from
 * runner/db/sql/*.sql, filled only with checked identifiers and passwords,
 * piped into psql inside the container as the superuser over its Unix socket.
 * Never `psql -c` with a value in it, and never anything a learner or a
 * template wrote: their SQL runs in client containers as their own roles
 * (clients.ts).
 *
 * Hot operations (a clone, a reset, a drop) go through one long-lived psql,
 * a statement at a time, so a reset costs PostgreSQL's own 15 to 25 ms and no
 * docker exec. Operations that switch databases (\connect) run as their own
 * psql, since a failed \connect ends a non-interactive psql.
 */

const SQL_DIR = path.join(import.meta.dirname, "sql");
const templates = new Map<string, string>();

export type SqlTemplate =
  | "init"
  | "init-template1"
  | "template-begin"
  | "template-finish"
  | "template-drop"
  | "role"
  | "clone"
  | "reset"
  | "drop-db"
  | "drop-role"
  | "block"
  | "empty";

/** Fills a template: {{name}} takes an identifier, {{password}} 32 hex characters, each checked first. */
export function fill(name: SqlTemplate, vars: Record<string, string>): string {
  let text = templates.get(name);
  if (text === undefined) {
    text = readFileSync(path.join(SQL_DIR, `${name}.sql`), "utf8");
    templates.set(name, text);
  }
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    if (value === undefined) throw new Error(`The ${name} template needs {{${key}}}.`);
    return key === "password" ? checkPassword(value) : checkIdent(value);
  });
}

/** A filled template's statements, one per item, comments dropped. */
export function statements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.startsWith("--"))
    .join("\n")
    .split(/;\s*\n/)
    .map((s) => s.trim().replace(/;$/, ""))
    .filter(Boolean)
    .map((s) => `${s};`);
}

/** What psql prints on stderr when a statement fails. Notices are off, and warnings don't count. */
const FAILED = /\b(ERROR|FATAL|PANIC):\s+(.*)/;

export class PgError extends Error {
  readonly statement: string;
  constructor(message: string, statement: string) {
    super(message);
    this.statement = statement;
  }
}

export class PgAdmin {
  private readonly container: Docker.Container;
  private readonly session: Session;

  constructor(docker: Docker, containerName: string) {
    this.container = docker.getContainer(containerName);
    this.session = new Session(
      () =>
        openExec(this.container, ["psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-F", "|", "-P", "pager=off", "-f", "-"], {
          user: "postgres",
          env: ["PGOPTIONS=-c client_min_messages=warning -c statement_timeout=30s -c lock_timeout=10s"],
        }),
      (command, mark) => `${command}\n\\echo ${mark}\n\\warn ${mark}\n`
    );
  }

  /**
   * Runs statements one at a time and stops at the first that fails, so an
   * operation never runs on past an error. Answers each statement's rows
   * (fields split on "|").
   */
  async run(sql: string, timeoutMs = 30_000): Promise<string[][][]> {
    const results: string[][][] = [];
    for (const statement of statements(sql)) {
      const { out, err } = await this.session.run(statement, timeoutMs);
      const failed = FAILED.exec(err);
      if (failed) throw new PgError(failed[2].trim(), statement);
      results.push(
        out
          .split("\n")
          .filter((line) => line !== "")
          .map((line) => line.split("|"))
      );
    }
    return results;
  }

  /** Runs a whole script as its own psql (for \connect), stopping at the first error. */
  async script(sql: string, database = "postgres", timeoutMs = 60_000): Promise<string> {
    const r = await execCollect(this.container, ["psql", "-U", "postgres", "-d", database, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
      user: "postgres",
      env: ["PGOPTIONS=-c client_min_messages=warning"],
      stdin: sql,
      timeoutMs,
    });
    if (r.code !== 0) {
      const message = r.stderr.toString("utf8").trim();
      throw new PgError(FAILED.exec(message)?.[2]?.trim() ?? (message || `psql exited with ${r.code}`), sql.slice(0, 200));
    }
    return r.stdout.toString("utf8");
  }

  close() {
    this.session.close();
  }

  /** Whether the server takes TCP connections: the real server, not the entrypoint's socket-only first run. */
  async ready(): Promise<boolean> {
    try {
      const r = await execCollect(this.container, ["pg_isready", "-q", "-h", "127.0.0.1", "-U", "postgres"], { user: "postgres", timeoutMs: 5_000 });
      return r.code === 0;
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    await this.script(fill("init", {}));
    await this.script(fill("init-template1", {}), "template1");
  }

  /** The databases that exist, with whether each is a template. */
  async databases(): Promise<Map<string, { template: boolean }>> {
    const [rows] = await this.run("SELECT datname, datistemplate FROM pg_database;");
    return new Map(rows.map(([name, template]) => [name, { template: template === "t" }]));
  }

  async roles(): Promise<Set<string>> {
    const [rows] = await this.run("SELECT rolname FROM pg_roles;");
    return new Set(rows.map(([name]) => name));
  }

  async createRole(role: string, password: string): Promise<void> {
    await this.run(fill("role", { role, password }));
  }

  async clone(db: string, template: string, role: string): Promise<void> {
    await this.run(fill("clone", { db, tpl: template, role }));
  }

  async empty(db: string, role: string): Promise<void> {
    await this.run(fill("empty", { db, role }));
  }

  /** Replaces a database with a fresh clone. The old one is set aside and dropped after, off the clock. */
  async reset(db: string, template: string, role: string, old: string): Promise<void> {
    await this.run(fill("reset", { db, tpl: template, role, old }));
  }

  async dropDatabase(db: string): Promise<void> {
    await this.run(fill("drop-db", { db }));
  }

  /**
   * Drops a database off the session, as its own psql, so the next reset
   * never waits for the files of the last one to be deleted.
   */
  async dropDatabaseAside(db: string): Promise<void> {
    await this.script(fill("drop-db", { db }));
  }

  async dropRole(role: string): Promise<void> {
    await this.run(fill("drop-role", { role }));
  }

  async block(db: string, role: string): Promise<void> {
    await this.run(fill("block", { db, role }));
  }

  /** Starts a template's build: its builder role and an empty database it owns. */
  async beginTemplate(template: string, password: string): Promise<void> {
    await this.run(fill("template-begin", { tpl: template, password }));
  }

  /** Finishes a build: hands everything to pg_database_owner and marks it a template. */
  async finishTemplate(template: string): Promise<void> {
    await this.script(fill("template-finish", { tpl: template }));
  }

  /** Drops a template (or a half-built one) and its builder role. */
  async dropTemplate(template: string): Promise<void> {
    const dbs = await this.databases();
    if (dbs.has(template)) await this.run(fill("template-drop", { tpl: template }));
    await this.dropRole(template).catch(() => {});
  }

  /** Each database's size in bytes. Catalog functions only: nothing a learner wrote runs. */
  async sizes(dbs: string[]): Promise<Map<string, number>> {
    if (!dbs.length) return new Map();
    const list = dbs.map((d) => `'${checkIdent(d)}'`).join(", ");
    const [rows] = await this.run(`SELECT datname, pg_database_size(datname) FROM pg_database WHERE datname IN (${list});`);
    return new Map(rows.map(([name, size]) => [name, Number(size)]));
  }

  /** Check and run databases, half-built templates, and set-aside resets a crash left behind. */
  async leftovers(): Promise<{ databases: string[]; roles: string[]; templates: string[] }> {
    const dbs = await this.databases();
    const roles = await this.roles();
    return {
      databases: [...dbs.keys()].filter((d) => LEFTOVER.test(d)),
      roles: [...roles].filter((r) => /^(ck|run)_/.test(r) || (/^tpl_/.test(r) && !dbs.get(r)?.template)),
      templates: [...dbs.entries()].filter(([d, info]) => /^tpl_/.test(d) && !info.template).map(([d]) => d),
    };
  }
}
