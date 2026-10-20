import path from "node:path";
import type { ServiceSpec, SqlSource } from "./index.ts";

/**
 * template.json's `services` (architecture §6.7), read against the template's
 * own files, into what Databases.attach takes. The workspace lane calls this
 * with the template's original files (never a learner's edits), so a
 * workspace's database always starts from the template:
 *
 *   const { spec, build } = serviceSpec(meta.config.services, files);
 *   const { env, network } = await databases.attach(id, ref, spec, build ? builder(build) : undefined);
 *
 * PostgreSQL, when template.json names no files, follows the outlines'
 * convention: schema.sql, seed.sql, then migrations/*.sql in name order, in
 * db/ or at the top of the template. The test twin gets the schema and the
 * migrations without the seed. A `build` command (`npm run db:build`) is
 * handed back for the caller to run in a job instead. MongoDB loads
 * db/seed.json (Extended JSON) or db/seed.archive.gz (mongodump --archive
 * --gzip), or the files template.json names.
 */

/** What a template.json may say under `services`. */
export interface TemplateServices {
  postgres?: {
    databases?: ("dev" | "test")[];
    /** A command that builds the template database (migrations, then seed), run in the template's image. */
    build?: string[];
    /** SQL files to run in order, instead of the convention. */
    sql?: string[];
    /** SQL files for the test database (schema only). */
    testSql?: string[];
    /** Start from an empty database. */
    empty?: boolean;
  };
  mongo?: {
    databases?: ("dev" | "test")[];
    /** db/seed.json or db/seed.archive.gz when left out. */
    seed?: string;
    testSeed?: string;
  };
}

/** The template's original files, by path relative to its root. */
export interface TemplateFiles {
  read(rel: string): Buffer | null;
  /** The names of the files in a folder, or [] when there is none. */
  list(rel: string): string[];
}

export class SpecError extends Error {}

export function serviceSpec(services: unknown, files: TemplateFiles): { spec: ServiceSpec; build: string[] | null } {
  const spec: ServiceSpec = {};
  let build: string[] | null = null;
  if (!services || typeof services !== "object") return { spec, build };
  const s = services as TemplateServices;
  const text = (rel: string): SqlSource => {
    const data = files.read(rel);
    if (!data) throw new SpecError(`template.json names ${rel}, which the template doesn't have.`);
    return { name: rel, text: data.toString("utf8") };
  };
  const first = (...rels: string[]) => rels.find((rel) => files.read(rel) !== null) ?? null;
  const migrations = () => {
    for (const dir of ["db/migrations", "migrations"]) {
      const names = files.list(dir).filter((n) => n.endsWith(".sql")).sort();
      if (names.length) return names.map((n) => upOnly(text(path.posix.join(dir, n))));
    }
    return [];
  };

  if (s.postgres) {
    const pg = s.postgres;
    const databases = pg.databases?.length ? pg.databases : ["dev" as const];
    if (pg.empty) {
      spec.postgres = { databases, empty: true };
    } else if (pg.sql?.length || !pg.build) {
      let sql: SqlSource[];
      let testSql: SqlSource[] | undefined;
      if (pg.sql?.length) {
        sql = pg.sql.map(text);
      } else {
        const schema = first("db/schema.sql", "schema.sql");
        const seed = first("db/seed.sql", "seed.sql");
        if (!schema && !seed) throw new SpecError("The template uses PostgreSQL but has no db/schema.sql, db/seed.sql, or build command.");
        const steps = migrations();
        sql = [...(schema ? [text(schema)] : []), ...(seed ? [text(seed)] : []), ...steps];
        if (databases.includes("test") && schema) testSql = [text(schema), ...steps];
      }
      if (pg.testSql?.length) testSql = pg.testSql.map(text);
      spec.postgres = { databases, sql, ...(testSql ? { testSql } : {}) };
    } else {
      spec.postgres = { databases };
      build = pg.build;
    }
  }

  if (s.mongo) {
    const m = s.mongo;
    const databases = m.databases?.length ? m.databases : ["dev" as const];
    const seed = m.seed ?? first("db/seed.json", "db/seed.archive.gz");
    const out: NonNullable<ServiceSpec["mongo"]> = { databases };
    if (seed) {
      const data = files.read(seed);
      if (!data) throw new SpecError(`template.json names ${seed}, which the template doesn't have.`);
      if (seed.endsWith(".json")) out.documents = data.toString("utf8");
      else out.archive = data;
    }
    if (m.testSeed) {
      const data = files.read(m.testSeed);
      if (!data || !m.testSeed.endsWith(".json")) throw new SpecError(`The test seed ${m.testSeed} must be a JSON file in the template.`);
      out.testDocuments = data.toString("utf8");
    }
    spec.mongo = out;
  }
  return { spec, build };
}

/** A goose migration's Up section: the file also holds its Down, which psql would run right after. */
export function upOnly(source: SqlSource): SqlSource {
  const up = /^--\s*\+goose Up\b.*$/m.exec(source.text);
  if (!up) return source;
  const rest = source.text.slice((up.index ?? 0) + up[0].length);
  const down = /^--\s*\+goose Down\b/m.exec(rest);
  return { name: source.name, text: down ? rest.slice(0, down.index) : rest };
}
