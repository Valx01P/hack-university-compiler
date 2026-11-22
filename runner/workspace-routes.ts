import type http from "node:http";
import { HttpError, methodNotAllowed, parse, readJson, readRaw, send, sendBytes } from "./http-util.ts";
import { FsOp, OpenWorkspace, ResetRequest, TerminalRequest } from "./schemas.ts";
import { PathError } from "./storage/host.ts";
import { mimeOf, type Workspace, type Workspaces } from "./workspaces.ts";

/**
 * The /v1/workspaces routes (runner/README.md, "Workspaces"). Next.js
 * forwards them from /api/workspaces/... after its own checks.
 */

const JSON_LIMIT = 64 * 1024;
const WRITE_LIMIT = 1024 * 1024;
const UPLOAD_LIMIT = 5 * 1024 * 1024;

const PATH_STATUS: Record<PathError["code"], number> = {
  bad_path: 400,
  outside: 403,
  not_found: 404,
  not_a_file: 409,
  is_dir: 409,
  exists: 409,
  too_large: 413,
};

/** Answers a /v1/workspaces request, or returns false for any other path. */
export async function workspaceRoute(workspaces: Workspaces, req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  if (!url.pathname.startsWith("/v1/workspaces")) return false;
  try {
    await dispatch(workspaces, req, res, url);
  } catch (err) {
    if (err instanceof PathError) throw new HttpError(PATH_STATUS[err.code], err.code === "is_dir" ? "not_a_file" : err.code, err.message);
    throw err;
  }
  return true;
}

function only(req: http.IncomingMessage, ...methods: string[]) {
  if (!methods.includes(req.method ?? "GET")) throw methodNotAllowed(methods.join(" or "));
}

function need(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (value === null || value === "") throw new HttpError(400, "bad_request", `${name}: is missing`);
  return value;
}

async function dispatch(workspaces: Workspaces, req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const method = req.method ?? "GET";

  if (url.pathname === "/v1/workspaces" || url.pathname === "/v1/workspaces/") {
    only(req, "GET");
    const list = await Promise.all(
      workspaces.all().map(async (w) => ({
        id: w.id,
        scope: w.meta.scope,
        course: w.meta.course,
        template: w.meta.template,
        status: w.status,
        lastActiveAt: w.lastActive,
        sizeBytes: await w.diskBytes(),
      }))
    );
    return send(res, 200, { workspaces: list });
  }

  const m = /^\/v1\/workspaces\/(w[a-z2-7]{10})(?:\/(.*))?$/.exec(url.pathname);
  if (!m) throw new HttpError(404, "not_found", "No such route.");
  const id = m[1];
  const rest = m[2] ?? "";

  if (rest === "" && method === "PUT") {
    const body = parse(OpenWorkspace, await readJson(req, JSON_LIMIT));
    return send(res, 200, await workspaces.open(id, body));
  }

  const ws = workspaces.get(id);
  if (!ws) throw new HttpError(404, "not_found", "No such workspace. Open it first.");
  ws.touch();

  if (rest === "") {
    only(req, "GET", "DELETE", "PUT");
    if (method === "DELETE") {
      await workspaces.remove(id);
      return send(res, 204);
    }
    return send(res, 200, await describe(ws));
  }

  switch (rest) {
    case "tree": {
      only(req, "GET");
      const depth = Math.min(64, Math.max(1, Number(url.searchParams.get("depth") ?? 1) || 1));
      return send(res, 200, await ws.tree(url.searchParams.get("path") ?? "", depth));
    }
    case "file": {
      only(req, "GET", "PUT");
      const rel = need(url, "path");
      if (method === "PUT") {
        const data = await readRaw(req, WRITE_LIMIT);
        const ifMatch = req.headers["if-match"];
        const result = await ws.writeFile(rel, data, {
          ifMatch: typeof ifMatch === "string" && ifMatch !== "*" ? ifMatch.replace(/^W\//, "").replace(/"/g, "").trim() : undefined,
          ifNoneMatch: req.headers["if-none-match"] === "*",
        });
        return send(res, 200, result);
      }
      const file = ws.readFile(rel);
      const none = req.headers["if-none-match"];
      if (typeof none === "string" && none.replace(/^W\//, "").replace(/"/g, "").trim() === file.etag) {
        res.writeHead(304, { ETag: `"${file.etag}"`, "Cache-Control": "no-store" });
        return res.end();
      }
      return sendFile(res, file, rel, url.searchParams.get("raw") === "1");
    }
    case "original": {
      only(req, "GET");
      const rel = need(url, "path");
      return sendFile(res, ws.readOriginal(rel), rel, url.searchParams.get("raw") === "1");
    }
    case "fs": {
      only(req, "POST");
      const op = parse(FsOp, await readJson(req, JSON_LIMIT));
      return send(res, 200, await ws.fsOp(op));
    }
    case "upload": {
      only(req, "POST");
      const rel = need(url, "path");
      const data = await readRaw(req, UPLOAD_LIMIT);
      return send(res, 200, await ws.writeFile(rel, data, { cap: UPLOAD_LIMIT }));
    }
    case "changes":
      only(req, "GET");
      return send(res, 200, await ws.changes());
    case "reset": {
      only(req, "POST");
      const body = parse(ResetRequest, await readJson(req, JSON_LIMIT));
      return send(res, 200, await ws.reset(body.scope, body.path, body.dryRun ?? false));
    }
    case "terminals": {
      only(req, "GET", "POST");
      if (method === "GET") return send(res, 200, ws.terminalList());
      const body = parse(TerminalRequest, await readJson(req, JSON_LIMIT));
      return send(res, 200, { sid: await ws.openTerminal(body.cols, body.rows, body.cwd) });
    }
  }

  const terminal = /^terminals\/([A-Za-z0-9_-]{6,64})$/.exec(rest);
  if (terminal) {
    only(req, "DELETE");
    await ws.closeTerminal(terminal[1]);
    return send(res, 204);
  }

  throw new HttpError(404, "not_found", "No such route.");
}

async function describe(ws: Workspace) {
  const { changes } = await ws.snapshotTree();
  return {
    id: ws.id,
    scope: ws.meta.scope,
    course: ws.meta.course,
    template: ws.meta.template,
    templateHash: ws.meta.templateHash,
    status: ws.status,
    storage: ws.meta.config.storage,
    createdAt: ws.meta.createdAt,
    lastActiveAt: ws.lastActive,
    terminals: ws.terminalList(),
    changes,
  };
}

function sendFile(res: http.ServerResponse, file: { data: Buffer; size: number; mode: number; mtimeMs: number; etag: string; text: boolean }, rel: string, raw: boolean) {
  const mime = mimeOf(rel, file.text);
  const headers = {
    ETag: `"${file.etag}"`,
    "X-HU-Size": String(file.size),
    "X-HU-Mode": String(file.mode),
    "X-HU-Mtime": String(file.mtimeMs),
  };
  if (raw) return sendBytes(res, file.data, { ...headers, "Content-Type": file.text ? `${mime}; charset=utf-8` : mime });
  if (!file.text) return send(res, 200, { binary: true, size: file.size, mime, etag: file.etag }, headers);
  return sendBytes(res, file.data, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
}
