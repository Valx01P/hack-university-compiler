import type http from "node:http";
import * as z from "zod";
import { isDockerDown } from "../docker.ts";
import type { Log } from "../log.ts";
import { DbError, type Databases } from "./index.ts";
import { MongoError } from "./mongo.ts";
import { PgError } from "./postgres.ts";

/**
 * The Database panel's routes and a workspace's database reset (architecture
 * §3.2), under /v1/workspaces/:id/db. They answer on their own (the same
 * error shape as every route), so http.ts only hands them the request:
 *
 *   GET  /v1/workspaces/:id/db                  which databases the workspace has
 *   GET  /v1/workspaces/:id/db/schema           tables, or collections, with their columns or indexes
 *   POST /v1/workspaces/:id/db/query            {sql} or {collection, filter, limit}
 *   POST /v1/workspaces/:id/db/reset            {database?: "dev" | "test" | "all"}
 */

export const DB_ROUTE = /^\/v1\/workspaces\/(w[a-z2-7]{10})\/db(?:\/(schema|query|reset))?$/;

const Which = z.enum(["dev", "test"]);

export const DbQuery = z.union([
  z.strictObject({
    /** SQL, run as the workspace's role: several statements, each answered. */
    sql: z.string().min(1).max(64 * 1024),
    database: Which.optional(),
  }),
  z.strictObject({
    /** A collection of the workspace's MongoDB database. */
    collection: z
      .string()
      .min(1)
      .max(120)
      .refine((c) => !c.includes("\0") && !c.startsWith("$"), "is not a collection name"),
    /** A find() filter in Extended JSON ({"_id": {"$oid": "…"}}). */
    filter: z.record(z.string(), z.unknown()).optional(),
    limit: z.number().int().min(1).max(500).optional(),
    database: Which.optional(),
  }),
]);

export const DbReset = z.strictObject({ database: z.enum(["dev", "test", "all"]).optional() });

const LIMIT = 128 * 1024;

function reply(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(Buffer.byteLength(payload)),
  });
  res.end(payload);
}

async function body(req: http.IncomingMessage): Promise<unknown> {
  if (!/^application\/json\s*(;|$)/i.test(req.headers["content-type"] ?? "")) {
    throw new DbError(415, "unsupported_media_type", "Send a JSON body (Content-Type: application/json).");
  }
  if (Number(req.headers["content-length"] ?? 0) > LIMIT) throw new DbError(413, "too_large", `The body is over ${LIMIT} bytes.`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > LIMIT) throw new DbError(413, "too_large", `The body is over ${LIMIT} bytes.`);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DbError(400, "bad_request", "The body isn't valid JSON.");
  }
}

function check<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const message = r.error.issues
      .slice(0, 5)
      .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
      .join("; ");
    throw new DbError(400, "bad_request", message);
  }
  return r.data;
}

/**
 * Answers a /v1/workspaces/:id/db route, or returns false when the path
 * isn't one. The caller has already checked the token, Host, and Origin.
 */
export async function dbRoute(databases: Databases, req: http.IncomingMessage, res: http.ServerResponse, url: URL, log: Log): Promise<boolean> {
  const match = DB_ROUTE.exec(url.pathname);
  if (!match) return false;
  const [, id, action] = match;
  const method = req.method ?? "GET";
  try {
    if (!action) {
      if (method !== "GET") throw new DbError(405, "method_not_allowed", "Use GET.");
      const info = databases.info(id);
      if (!info) throw new DbError(404, "not_found", "This workspace has no database.");
      reply(res, 200, { ...info, services: { postgres: databases.state("postgres"), mongo: databases.state("mongo") } });
    } else if (action === "schema") {
      if (method !== "GET") throw new DbError(405, "method_not_allowed", "Use GET.");
      const engine = url.searchParams.get("engine");
      if (engine !== null && engine !== "postgres" && engine !== "mongo") throw new DbError(400, "bad_request", "engine is postgres or mongo.");
      const which = check(Which.optional(), url.searchParams.get("database") ?? undefined);
      reply(res, 200, await databases.schema(id, engine ?? undefined, which));
    } else if (action === "query") {
      if (method !== "POST") throw new DbError(405, "method_not_allowed", "Use POST.");
      reply(res, 200, await databases.query(id, check(DbQuery, await body(req))));
    } else {
      if (method !== "POST") throw new DbError(405, "method_not_allowed", "Use POST.");
      const { database } = check(DbReset, await body(req));
      reply(res, 200, await databases.resetWorkspace(id, database ?? "all"));
    }
  } catch (err) {
    if (res.headersSent) {
      res.destroy();
    } else if (err instanceof DbError) {
      reply(res, err.status, { error: err.code, message: err.message });
    } else if (isDockerDown(err)) {
      reply(res, 503, { error: "docker_unavailable", message: "Start Docker to run this." });
    } else if (err instanceof PgError || err instanceof MongoError) {
      log.warn("db.route_failed", { path: url.pathname, error: err.message });
      reply(res, 502, { error: "db_error", message: err.message });
    } else {
      log.error("db.route_error", { path: url.pathname, error: (err as Error).message });
      reply(res, 500, { error: "internal", message: "The runner hit an unexpected error." });
    }
  }
  return true;
}
