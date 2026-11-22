import type * as z from "zod";
import { rejectNonLocal } from "@/lib/local-request";
import { runnerFetch } from "@/lib/runner";
import { WORKSPACE_ID } from "@/lib/workspace-id.mjs";
import { FsRequest, RelPath, ResetRequest, TerminalRequest } from "@/lib/workspace-schemas";
import { errorResponse, fail, readBody, readBytes, relay } from "@/lib/workspace-route";

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
  /** How long the runner may take. */
  timeoutMs?: number;
}

const RULES: Rule[] = [
  { method: "GET", path: /^$/ },
  { method: "DELETE", path: /^$/ },
  { method: "GET", path: /^tree$/, query: ["path", "depth"] },
  { method: "GET", path: /^file$/, query: ["path"], headers: ["if-none-match"] },
  { method: "PUT", path: /^file$/, query: ["path"], body: { raw: MiB }, headers: ["if-match"] },
  { method: "GET", path: /^original$/, query: ["path"] },
  { method: "POST", path: /^fs$/, body: { json: FsRequest } },
  { method: "POST", path: /^upload$/, query: ["path"], body: { raw: 5 * MiB } },
  { method: "GET", path: /^changes$/ },
  { method: "POST", path: /^reset$/, body: { json: ResetRequest }, timeoutMs: 60_000 },
  { method: "GET", path: /^terminals$/ },
  { method: "POST", path: /^terminals$/, body: { json: TerminalRequest }, timeoutMs: 120_000 },
  { method: "DELETE", path: /^terminals\/[A-Za-z0-9_-]{6,64}$/ },
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
      body = JSON.stringify(await readBody(request, rule.body.json));
      headers["content-type"] = "application/json";
    } else if (rule.body && "raw" in rule.body) {
      body = Buffer.from(await readBytes(request, rule.body.raw));
      headers["content-type"] = "application/octet-stream";
    }

    const target = `/v1/workspaces/${id}${sub ? `/${sub}` : ""}`;
    const qs = query.toString();
    const res = await runnerFetch(`${target}${qs ? `?${qs}` : ""}`, { method, headers, body, timeoutMs: rule.timeoutMs, signal: request.signal });
    return relay(res);
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * The folder routes the compiler and the playground use, passed on to the
 * runner (architecture §3.1, §3.2): only the routes listed above, with their
 * bodies checked (1 MB of JSON, a 1 MB file, a 5 MB upload), their paths
 * inside the workspace, and only the query parameters and headers each
 * takes.
 */
export const GET = (request: Request, ctx: Ctx) => handle("GET", request, ctx);
export const PUT = (request: Request, ctx: Ctx) => handle("PUT", request, ctx);
export const POST = (request: Request, ctx: Ctx) => handle("POST", request, ctx);
export const DELETE = (request: Request, ctx: Ctx) => handle("DELETE", request, ctx);
