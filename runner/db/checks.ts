import { isDeepStrictEqual } from "node:util";
import * as z from "zod";
import type { CheckDatabase, Databases } from "./index.ts";
import { relaxed } from "./panel.ts";

/**
 * The `sql` and `mongo` check steps (architecture §6.8): a query against the
 * check's own database, run as the check's own role after the learner's code
 * has had its turn, and the rows (or documents, or a count, or an index in
 * the plan) it must give. The check runner calls these for steps of these
 * kinds and puts the verdict in the step's result (§7.3):
 *
 *   if (raw.kind === "sql") return done(await sqlCheck(databases, ck, SqlCheckStep.parse(raw)));
 *   if (raw.kind === "mongo") return done(await mongoCheck(databases, ck, MongoCheckStep.parse(raw)));
 */

export interface StepVerdict {
  status: "pass" | "fail" | "error";
  message?: string;
  expected?: string;
  actual?: string;
}

export const SqlCheckStep = z.looseObject({
  id: z.string(),
  kind: z.literal("sql"),
  /** Suite content, never a learner's: one or more statements, the last one's rows judged. */
  query: z.string().min(1).max(64 * 1024),
  /** The rows exactly, as psql prints them (text, null for NULL). */
  rows: z.array(z.array(z.string().nullable())).optional(),
  /** Or how many rows. */
  count: z.number().int().min(0).optional(),
  /** Or that the plan uses an index (any, or the one named), with sequential scans discouraged. */
  plan: z.strictObject({ usesIndex: z.union([z.string().min(1), z.literal(true)]) }).optional(),
});

export const MongoCheckStep = z.looseObject({
  id: z.string(),
  kind: z.literal("mongo"),
  collection: z.string().min(1).max(120),
  filter: z.record(z.string(), z.unknown()).optional(),
  /** The documents found, in order: each has these fields with these values (Extended JSON read as plain values). */
  documents: z.array(z.record(z.string(), z.unknown())).optional(),
  /** Or how many documents match. */
  count: z.number().int().min(0).optional(),
});

export type SqlCheckStep = z.infer<typeof SqlCheckStep>;
export type MongoCheckStep = z.infer<typeof MongoCheckStep>;

const show = (value: unknown) => JSON.stringify(value).slice(0, 8192);

export async function sqlCheck(databases: Databases, check: CheckDatabase, step: SqlCheckStep): Promise<StepVerdict> {
  const login = check.logins.postgres;
  if (!login) return { status: "error", message: "This check has no PostgreSQL database." };
  if (step.plan) {
    const r = await databases.sqlAs(login, `SET enable_seqscan = off;\nEXPLAIN (FORMAT JSON) ${step.query.trim().replace(/;\s*$/, "")}`);
    if (r.error) return { status: "fail", message: `The query failed: ${r.error.message}` };
    const last = r.results.at(-1);
    const plan = last?.kind === "rows" ? JSON.parse(last.rows[0]?.[0] ?? "[]") : [];
    const indexes: string[] = [];
    const walk = (node: Record<string, unknown>) => {
      if (typeof node["Index Name"] === "string") indexes.push(node["Index Name"]);
      for (const child of (node.Plans as Record<string, unknown>[] | undefined) ?? []) walk(child);
    };
    for (const p of plan as { Plan: Record<string, unknown> }[]) walk(p.Plan);
    const want = step.plan.usesIndex;
    const ok = want === true ? indexes.length > 0 : indexes.includes(want);
    return ok
      ? { status: "pass" }
      : { status: "fail", message: want === true ? "The query's plan uses no index." : `The query's plan doesn't use ${want}.`, expected: want === true ? "an index" : want, actual: indexes.join(", ") || "no index" };
  }
  const r = await databases.sqlAs(login, step.query);
  if (r.error) return { status: "fail", message: `The query failed: ${r.error.message}` };
  const last = r.results.at(-1);
  const rows = last?.kind === "rows" ? last.rows : [];
  if (step.count !== undefined && rows.length !== step.count) {
    return { status: "fail", message: `Expected ${step.count} row${step.count === 1 ? "" : "s"}, got ${rows.length}.`, expected: String(step.count), actual: String(rows.length) };
  }
  if (step.rows !== undefined && !isDeepStrictEqual(rows, step.rows)) {
    return { status: "fail", message: "The rows differ.", expected: show(step.rows), actual: show(rows) };
  }
  return { status: "pass" };
}

export async function mongoCheck(databases: Databases, check: CheckDatabase, step: MongoCheckStep): Promise<StepVerdict> {
  const login = check.logins.mongo;
  if (!login) return { status: "error", message: "This check has no MongoDB database." };
  let found: Record<string, unknown>[];
  try {
    found = (await databases.findAs(login, step.collection, step.filter ?? {})).documents;
  } catch (err) {
    return { status: "fail", message: `The query failed: ${(err as Error).message}` };
  }
  if (step.count !== undefined && found.length !== step.count) {
    return { status: "fail", message: `Expected ${step.count} document${step.count === 1 ? "" : "s"}, got ${found.length}.`, expected: String(step.count), actual: String(found.length) };
  }
  if (step.documents !== undefined) {
    const actual = found.map((d) => relaxed(d) as Record<string, unknown>);
    const expected = step.documents.map((d) => relaxed(d) as Record<string, unknown>);
    const same =
      actual.length === expected.length &&
      expected.every((want, i) => Object.entries(want).every(([k, v]) => isDeepStrictEqual(actual[i][k], v)));
    if (!same) {
      // Only the fields the step names, so the difference is easy to see.
      const shown = actual.map((d, i) => Object.fromEntries(Object.keys(expected[i] ?? d).map((k) => [k, d[k]])));
      return { status: "fail", message: "The documents differ.", expected: show(expected), actual: show(shown) };
    }
  }
  return { status: "pass" };
}
