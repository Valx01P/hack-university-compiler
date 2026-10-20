import type * as z from "zod";
import { rejectNonLocal } from "@/lib/local-request";
import { runnerFetch } from "@/lib/runner";
import { parseScope, WORKSPACE_ID, workspaceId } from "@/lib/workspace-id.mjs";
import {
  CarryRequest,
  CheckRequest,
  DbQuery,
  FsRequest,
  HttpRequest,
  PortRequest,
  RelPath,
  ResetRequest,
  SignalRequest,
  SnapshotRequest,
  TerminalRequest,
} from "@/lib/workspace-schemas";
import { BodyError, errorResponse, fail, readBody, readBytes, relay } from "@/lib/workspace-route";
import { resolveScope, ScopeError } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

const MiB = 1024 * 1024;

type Method = "GET" | "PUT" | "POST" | "DELETE";
type Ctx = { params: Promise<{ id: string; path?: string[] }> };

/** One route the browser may reach through the proxy (architecture §3.2). */
interface Rule {
  method: Method;
  /** The path after /api/workspaces/:id/, matched whole. */
  path: RegExp;
  /** Query parameters passed on (the rest are dropped). */
  query?: string[];
  /** No body, a JSON body checked against a schema, or raw bytes. */
  body?: { json: z.ZodType<unknown> } | { raw: number };
  /** Request headers passed on. */
  headers?: string[];
  /** Where it goes on the runner, when not /v1/workspaces/:id/<path>. */
  upstream?: (id: string, path: string) => string;
  /** Rewrites a JSON body before it goes on (Next resolves content here). */
  rewrite?: (id: string, body: never) => Promise<unknown>;
  /** How long the runner may take. */
  timeoutMs?: number;
}

/** A check names its workspace's scope. Next finds the suite and the
    target in content, so the browser never names a path. */
async function checkBody(id: string, body: { scope: string }) {
  if (workspaceId(body.scope) !== id) throw new BodyError("That scope isn't this workspace.", 400);
  let resolved;
  try {
    resolved = await resolveScope(body.scope);
  } catch (err) {
    if (err instanceof ScopeError) throw new BodyError(err.message, 404);
    throw err;
  }
  if (!resolved.suite) throw new BodyError("This workspace has no checks.", 404);
  const scope = parseScope(body.scope)!;
  return {
    suite: resolved.suite,
    target: {
      scope: body.scope,
      course: scope.course,
      ...(scope.kind === "learn" ? { lesson: scope.lesson, part: scope.part } : {}),
      ...(scope.kind === "challenge" ? { challenge: scope.challenge } : {}),
      template: `${resolved.course}/${resolved.templateId}`,
    },
  };
}

/** Continue with my code: the previous part's practice, in the same lesson. */
async function carryBody(id: string, body: { from: string }) {
  const from = parseScope(body.from);
  if (!from || from.kind !== "learn" || from.tab !== "practice") throw new BodyError("Only a part's practice can be carried on.", 400);
  if (workspaceId(body.from) === id) throw new BodyError("A workspace can't continue from itself.", 400);
  return { from: body.from };
}

const RULES: Rule[] = [
  { method: "GET", path: /^$/ },
  { method: "DELETE", path: /^$/ },
  { method: "POST", path: /^(?:start|stop|restart)$/, timeoutMs: 120_000 },
  { method: "GET", path: /^tree$/, query: ["path", "depth"] },
  { method: "GET", path: /^file$/, query: ["path"], headers: ["if-none-match"] },
  { method: "PUT", path: /^file$/, query: ["path"], body: { raw: MiB }, headers: ["if-match"] },
  { method: "GET", path: /^original$/, query: ["path"] },
  { method: "POST", path: /^fs$/, body: { json: FsRequest } },
  { method: "POST", path: /^upload$/, query: ["path"], body: { raw: 5 * MiB } },
  { method: "GET", path: /^archive$/, query: ["git"], timeoutMs: 120_000 },
  { method: "GET", path: /^changes$/ },
  { method: "POST", path: /^reset$/, body: { json: ResetRequest }, timeoutMs: 60_000 },
  { method: "GET", path: /^snapshots$/ },
  { method: "POST", path: /^snapshots$/, body: { json: SnapshotRequest }, timeoutMs: 60_000 },
  { method: "POST", path: /^snapshots\/[A-Za-z0-9_-]{1,64}\/restore$/, timeoutMs: 60_000 },
  { method: "DELETE", path: /^snapshots\/[A-Za-z0-9_-]{1,64}$/ },
  { method: "POST", path: /^carry$/, body: { json: CarryRequest }, rewrite: carryBody as Rule["rewrite"], timeoutMs: 60_000 },
  { method: "GET", path: /^terminals$/ },
  { method: "POST", path: /^terminals$/, body: { json: TerminalRequest }, timeoutMs: 120_000 },
  { method: "DELETE", path: /^terminals\/[A-Za-z0-9_-]{6,64}$/ },
  { method: "GET", path: /^tasks$/ },
  { method: "POST", path: /^tasks\/[a-z][a-z0-9-]{0,31}\/(?:start|stop|restart)$/, timeoutMs: 120_000 },
  { method: "POST", path: /^tasks\/[a-z][a-z0-9-]{0,31}\/signal$/, body: { json: SignalRequest } },
  { method: "GET", path: /^ports$/ },
  { method: "POST", path: /^ports$/, body: { json: PortRequest } },
  { method: "DELETE", path: /^ports\/\d{1,5}$/ },
  { method: "POST", path: /^http$/, body: { json: HttpRequest }, timeoutMs: 125_000 },
  { method: "DELETE", path: /^cookies$/ },
  { method: "GET", path: /^db\/schema$/ },
  { method: "POST", path: /^db\/query$/, body: { json: DbQuery }, timeoutMs: 30_000 },
  { method: "POST", path: /^check$/, body: { json: CheckRequest }, rewrite: checkBody as Rule["rewrite"], timeoutMs: 30_000 },
  // A check's final result, for a socket that dropped (GET /v1/checks/:checkId).
  { method: "GET", path: /^checks\/[A-Za-z0-9_-]{1,64}$/, upstream: (_id, p) => `/v1/${p}` },
];

async function handle(method: Method, request: Request, ctx: Ctx) {
  const rejected = rejectNonLocal(request);
  if (rejected) return rejected;
  const { id, path: segments = [] } = await ctx.params;
  if (!WORKSPACE_ID.test(id)) return fail("That isn't a workspace.", 404, "not_found");
  const sub = segments.join("/");
  const rule = RULES.find((r) => r.method === method && r.path.test(sub));
  if (!rule) return fail("No such workspace route.", 404, "not_found");

  try {
    // Only the query parameters the route takes, and paths checked.
    const url = new URL(request.url);
    const query = new URLSearchParams();
    for (const name of rule.query ?? []) {
      const value = url.searchParams.get(name);
      if (value === null) continue;
      if (name === "path" && value !== "" && !RelPath.safeParse(value).success) return fail("That path isn't inside the workspace.", 400);
      if (name === "depth" && !/^\d{1,2}$/.test(value)) return fail("depth must be a small number.", 400);
      if (name === "git" && value !== "1") return fail("git must be 1.", 400);
      query.set(name, value);
    }
    if ((rule.query ?? []).includes("path") && sub !== "tree" && !query.get("path")) return fail("Name a file with ?path=.", 400);

    const headers: Record<string, string> = {};
    for (const name of rule.headers ?? []) {
      const value = request.headers.get(name);
      if (value && value.length <= 256) headers[name] = value;
    }
    let body: BodyInit | undefined;
    if (rule.body && "json" in rule.body) {
      let data: unknown = await readBody(request, rule.body.json);
      if (rule.rewrite) data = await rule.rewrite(id, data as never);
      body = JSON.stringify(data);
      headers["content-type"] = "application/json";
    } else if (rule.body && "raw" in rule.body) {
      body = Buffer.from(await readBytes(request, rule.body.raw));
      headers["content-type"] = "application/octet-stream";
    }

    const target = rule.upstream ? rule.upstream(id, sub) : `/v1/workspaces/${id}${sub ? `/${sub}` : ""}`;
    const qs = query.toString();
    const res = await runnerFetch(`${target}${qs ? `?${qs}` : ""}`, { method, headers, body, timeoutMs: rule.timeoutMs, signal: request.signal });
    return relay(res);
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * The workspace routes the IDE uses, passed on to the runner (architecture
 * §3.1, §3.2): only the routes listed above, with their bodies checked
 * (1 MB of JSON, a 1 MB file, a 5 MB upload), their paths inside the
 * workspace, and only the query parameters and headers each takes. Checks
 * and Continue with my code name content (a scope), which Next resolves.
 */
export const GET = (request: Request, ctx: Ctx) => handle("GET", request, ctx);
export const PUT = (request: Request, ctx: Ctx) => handle("PUT", request, ctx);
export const POST = (request: Request, ctx: Ctx) => handle("POST", request, ctx);
export const DELETE = (request: Request, ctx: Ctx) => handle("DELETE", request, ctx);
