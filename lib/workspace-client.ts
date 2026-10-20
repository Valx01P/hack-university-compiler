import type { CheckResult, PortInfo, TreeEntry } from "@/lib/workspace-types";

/**
 * The IDE's calls to the app's workspace routes (/api/workspaces, the
 * allowlisted proxy to the runner, and /api/tickets). Every write carries
 * `X-HU: 1` (lib/local-request.ts). Failures come back as WorkspaceError
 * with the sentence the route answered, which the IDE shows as it is.
 */

export class WorkspaceError extends Error {
  readonly status: number;
  readonly code: string;
  readonly data: Record<string, unknown>;
  constructor(message: string, status: number, code: string, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

const UNREACHABLE = "Couldn't reach the app's server. Make sure npm run up is still running.";

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  if (method !== "GET") headers.set("X-HU", "1");
  let res: Response;
  try {
    res = await fetch(url, { ...init, method, headers, cache: "no-store" });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new WorkspaceError(UNREACHABLE, 0, "unreachable");
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const message = typeof data.error === "string" ? data.error : `The request failed (${res.status}).`;
    throw new WorkspaceError(message, res.status, typeof data.code === "string" ? data.code : "error", data);
  }
  return res;
}

const json = async <T>(res: Response): Promise<T> => (res.status === 204 ? ({} as T) : ((await res.json()) as T));
const post = (url: string, body?: unknown) =>
  call(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? "{}" : JSON.stringify(body) });

/** The tree as the runner sends it: `{path, entries, removed, more}` from
    GET …/tree, the same object as an open's `tree` (with `removed` beside
    it), or a bare list. */
export function readTree(data: unknown): { tree: TreeEntry[]; removed: string[]; more: Record<string, number> } {
  if (Array.isArray(data)) return { tree: data as TreeEntry[], removed: [], more: {} };
  const d = (data ?? {}) as { tree?: unknown; entries?: TreeEntry[]; removed?: string[]; more?: Record<string, number> };
  if (d.tree && !Array.isArray(d.tree) && typeof d.tree === "object") {
    const inner = readTree(d.tree);
    return { ...inner, removed: d.removed ?? inner.removed };
  }
  return { tree: (Array.isArray(d.tree) ? (d.tree as TreeEntry[]) : undefined) ?? d.entries ?? [], removed: d.removed ?? [], more: d.more ?? {} };
}

export interface OpenResult {
  id: string;
  scope: string;
  status: string;
  templateHash?: string;
  updated?: string[];
  ports?: Record<string, unknown> | PortInfo[];
  tree: TreeEntry[];
  removed: string[];
}

export async function openWorkspace(scope: string, signal?: AbortSignal): Promise<OpenResult> {
  const res = await call("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
    signal,
  });
  const data = await json<Record<string, unknown>>(res);
  return { ...(data as unknown as OpenResult), ...readTree(data) };
}

/** A file's contents with its ETag, or what it is when it isn't text. */
export type FileRead = { kind: "text"; text: string; etag: string | null } | { kind: "binary"; size: number; mime: string };

const base = (id: string) => `/api/workspaces/${id}`;
const q = (path: string) => `?path=${encodeURIComponent(path)}`;

function decodeFile(res: Response, bytes: ArrayBuffer): FileRead {
  const type = res.headers.get("content-type") ?? "";
  const etag = res.headers.get("etag");
  // A binary file answers a small JSON description instead of its bytes
  // (text files, .json ones included, come as text/plain).
  if (type.startsWith("application/json")) {
    try {
      const data = JSON.parse(new TextDecoder().decode(bytes)) as { binary?: boolean; size?: number; mime?: string };
      if (data && data.binary === true) return { kind: "binary", size: data.size ?? 0, mime: data.mime ?? "application/octet-stream" };
    } catch {
      /* a .json file itself */
    }
  }
  const view = new Uint8Array(bytes);
  if (view.subarray(0, 8000).includes(0)) return { kind: "binary", size: view.length, mime: type || "application/octet-stream" };
  return { kind: "text", text: new TextDecoder().decode(bytes), etag };
}

export const workspaceApi = {
  async status(id: string) {
    return json<Record<string, unknown>>(await call(base(id)));
  },
  /** A folder's entries, `depth` levels down (the whole tree by default:
      heavy folders like node_modules stay closed until named). */
  async tree(id: string, path = "", depth = 64) {
    const params = new URLSearchParams();
    if (path) params.set("path", path);
    if (depth !== undefined) params.set("depth", String(depth));
    const qs = params.toString();
    return readTree(await json(await call(`${base(id)}/tree${qs ? `?${qs}` : ""}`)));
  },
  async readFile(id: string, path: string): Promise<FileRead> {
    const res = await call(`${base(id)}/file${q(path)}`);
    return decodeFile(res, await res.arrayBuffer());
  },
  async readOriginal(id: string, path: string): Promise<FileRead | null> {
    try {
      const res = await call(`${base(id)}/original${q(path)}`);
      return decodeFile(res, await res.arrayBuffer());
    } catch (err) {
      if (err instanceof WorkspaceError && err.status === 404) return null;
      throw err;
    }
  },
  /** Saves a file. `etag` is what the editor started from (If-Match), or
      null to write whatever is there. A conflict throws with code "conflict". */
  async writeFile(id: string, path: string, text: string, etag: string | null): Promise<{ etag: string | null }> {
    const res = await call(`${base(id)}/file${q(path)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", ...(etag ? { "If-Match": etag } : {}) },
      body: text,
    });
    const data = await json<{ etag?: string }>(res);
    return { etag: data.etag ?? res.headers.get("etag") };
  },
  async fs(
    id: string,
    op:
      | { op: "mkdir" | "delete"; path: string }
      | { op: "rename" | "copy"; path: string; to: string }
      | { op: "chmod"; path: string; mode: number }
      | { op: "restore"; undo: string }
  ) {
    return json<{ undo?: string }>(await post(`${base(id)}/fs`, op));
  },
  async reset(id: string, scope: "file" | "dir" | "all" | "db" | "everything", path?: string, dryRun = false) {
    return json<{ snapshot?: string | null; restored?: string[]; removed?: string[] }>(
      await post(`${base(id)}/reset`, { scope, ...(path ? { path } : {}), ...(dryRun ? { dryRun } : {}) })
    );
  },
  async snapshots(id: string) {
    const data = await json<{ snapshots?: Snapshot[] } | Snapshot[]>(await call(`${base(id)}/snapshots`));
    return (Array.isArray(data) ? data : (data.snapshots ?? [])).map(snapshotOf);
  },
  async saveSnapshot(id: string, label?: string) {
    return snapshotOf(await json<Snapshot>(await post(`${base(id)}/snapshots`, label ? { label } : {})));
  },
  async restoreSnapshot(id: string, sid: string) {
    return json(await post(`${base(id)}/snapshots/${encodeURIComponent(sid)}/restore`));
  },
  async start(id: string) {
    return json<{ status?: string }>(await post(`${base(id)}/start`));
  },
  async stop(id: string) {
    return json<{ status?: string }>(await post(`${base(id)}/stop`));
  },
  async restart(id: string) {
    return json<{ status?: string }>(await post(`${base(id)}/restart`));
  },
  async newTerminal(id: string, cols: number, rows: number, cwd?: string) {
    return json<{ sid: string }>(await post(`${base(id)}/terminals`, cwd ? { cols, rows, cwd } : { cols, rows }));
  },
  async closeTerminal(id: string, sid: string) {
    await call(`${base(id)}/terminals/${encodeURIComponent(sid)}`, { method: "DELETE" });
  },
  async task(id: string, name: string, action: "start" | "stop" | "restart") {
    return json<{ sid?: string }>(await post(`${base(id)}/tasks/${encodeURIComponent(name)}/${action}`));
  },
  async signalTask(id: string, name: string, sig: "INT" | "TERM" = "INT") {
    await post(`${base(id)}/tasks/${encodeURIComponent(name)}/signal`, { sig });
  },
  async clearCookies(id: string) {
    await call(`${base(id)}/cookies`, { method: "DELETE" });
  },
  async forwardPort(id: string, port: number) {
    return json(await post(`${base(id)}/ports`, { port }));
  },
  async stopPort(id: string, port: number) {
    await call(`${base(id)}/ports/${port}`, { method: "DELETE" });
  },
  async http(id: string, request: HttpRequest) {
    return json<HttpResponse>(await post(`${base(id)}/http`, request));
  },
  async check(id: string, scope: string) {
    return json<{ checkId: string }>(await post(`${base(id)}/check`, { scope }));
  },
  async checkResult(id: string, checkId: string) {
    return json<CheckResult>(await call(`${base(id)}/checks/${encodeURIComponent(checkId)}`));
  },
  archiveUrl(id: string) {
    return `${base(id)}/archive`;
  },
};

export interface Snapshot {
  /** The runner's `id` (older answers say `sid`). */
  sid: string;
  label?: string;
  auto?: boolean;
  createdAt?: number | string;
}

const snapshotOf = (s: Snapshot & { id?: string }): Snapshot => ({ ...s, sid: s.id ?? s.sid });

export interface HttpRequest {
  port: number;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
  jar?: boolean;
}

export interface HttpResponse {
  status: number;
  statusText?: string;
  /** Every header, repeated ones joined, except set-cookie, a list. */
  headers: Record<string, string | string[]>;
  cookies?: { name: string; value: string; path?: string; httpOnly?: boolean; sameSite?: string; expires?: string | null }[];
  body: string;
  bodyEncoding?: "utf8" | "base64";
  size?: number;
  truncated?: boolean;
  timingMs?: number;
}

/** A WebSocket ticket and where to open the socket. */
export async function getTicket(workspace: string, kind: "events" | "term", sid?: string): Promise<{ ticket: string; url: string }> {
  return json(await post("/api/tickets", sid ? { workspace, kind, sid } : { workspace, kind }));
}
