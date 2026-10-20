import type http from "node:http";
import type { Checks } from "./checks/run.ts";
import { ExecFailed } from "./exec.ts";
import { HttpError, methodNotAllowed, parse, readJson, readRaw, send, sendBytes } from "./http-util.ts";
import { isScope, workspaceId } from "../lib/workspace-id.mjs";
import {
  CarryRequest,
  CheckRequest,
  FsOp,
  HttpPanelRequest,
  OpenWorkspace,
  PortRequest,
  ResetRequest,
  SignalRequest,
  SnapshotRequest,
  TerminalRequest,
} from "./schemas.ts";
import { PathError } from "./storage/host.ts";
import { mimeOf, type Workspace, type Workspaces } from "./workspaces.ts";

/**
 * The /v1/workspaces and /v1/checks routes (runner/README.md, "Workspaces").
 * Next.js forwards them from /api/workspaces/... after its own checks. Every
 * call on a workspace counts as activity for its idle timer.
 */

const JSON_LIMIT = 64 * 1024;
const HTTP_LIMIT = 2 * 1024 * 1024;
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

export interface WorkspaceRouteDeps {
  workspaces: Workspaces;
  checks: Checks;
}

/** Answers a /v1/workspaces or /v1/checks request, or returns false for any other path. */
export async function workspaceRoute(deps: WorkspaceRouteDeps, req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith("/v1/workspaces") && !p.startsWith("/v1/checks/")) return false;
  try {
    await dispatch(deps, req, res, url);
  } catch (err) {
    if (err instanceof PathError) throw new HttpError(PATH_STATUS[err.code], err.code === "is_dir" ? "not_a_file" : err.code, err.message);
    if (err instanceof ExecFailed) throw new HttpError(500, "internal", err.message);
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

async function dispatch(deps: WorkspaceRouteDeps, req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const method = req.method ?? "GET";
  const { workspaces } = deps;

  const check = /^\/v1\/checks\/(c[a-z2-7]{10})$/.exec(url.pathname);
  if (check) {
    only(req, "GET");
    const result = deps.checks.get(check[1]);
    if (!result) throw new HttpError(404, "not_found", "No such check (results are kept for the last 200).");
    return send(res, 200, result);
  }

  if (url.pathname === "/v1/workspaces" || url.pathname === "/v1/workspaces/") {
    only(req, "GET");
    const list = workspaces.all().map((w) => ({
      id: w.id,
      scope: w.meta.scope,
      course: w.meta.course,
      template: w.meta.template,
      status: w.status,
      lastActiveAt: w.lastActive,
      memLimitMb: Math.round(w.limits.memoryBytes / 2 ** 20),
    }));
    return send(res, 200, {
      workspaces: list,
      budgetMb: Math.floor(workspaces.capacity.budget() / 2 ** 20),
      reservedMb: Math.floor(workspaces.capacity.reserved() / 2 ** 20),
    });
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
    case "start":
    case "stop":
    case "restart": {
      only(req, "POST");
      if (rest === "stop") return send(res, 200, await ws.stop("user"));
      if (rest === "restart") await ws.stop("user");
      const result = await ws.start();
      return send(res, result.queued ? 202 : 200, result);
    }
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
    case "archive": {
      only(req, "GET");
      const data = await ws.archive(url.searchParams.get("git") === "1");
      const name = `${ws.meta.template.split("/")[1]}-${ws.id}.zip`;
      return sendBytes(res, data, { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"` });
    }
    case "carry": {
      only(req, "POST");
      const body = parse(CarryRequest, await readJson(req, JSON_LIMIT));
      if (!isScope(body.from)) throw new HttpError(400, "bad_request", "from: is not a workspace scope");
      const from = workspaces.get(workspaceId(body.from));
      if (!from) throw new HttpError(404, "not_found", "That workspace hasn't been opened, so there is nothing to continue from.");
      return send(res, 200, await ws.carry(from));
    }
    case "reset": {
      only(req, "POST");
      const body = parse(ResetRequest, await readJson(req, JSON_LIMIT));
      return send(res, 200, await ws.reset(body.scope, body.path, body.dryRun ?? false));
    }
    case "snapshots": {
      only(req, "GET", "POST");
      if (method === "GET") return send(res, 200, { snapshots: ws.listSnapshots() });
      const body = parse(SnapshotRequest, await readJson(req, JSON_LIMIT));
      return send(res, 200, await ws.snapshot(body.label ?? null));
    }
    case "terminals": {
      only(req, "GET", "POST");
      if (method === "GET") return send(res, 200, ws.terminalList());
      const body = parse(TerminalRequest, await readJson(req, JSON_LIMIT));
      return send(res, 200, { sid: await ws.openTerminal(body.cols, body.rows, body.cwd) });
    }
    case "tasks":
      only(req, "GET");
      return send(res, 200, ws.taskList());
    case "ports": {
      only(req, "GET", "POST");
      if (method === "GET") return send(res, 200, ws.portList());
      const body = parse(PortRequest, await readJson(req, JSON_LIMIT));
      return send(res, 200, await ws.forwardPort(body.port));
    }
    case "http": {
      only(req, "POST");
      const body = parse(HttpPanelRequest, await readJson(req, HTTP_LIMIT));
      return send(res, 200, await ws.httpRequest(body));
    }
    case "cookies":
      only(req, "DELETE");
      ws.clearCookies();
      return send(res, 204);
    case "check": {
      only(req, "POST");
      const body = parse(CheckRequest, await readJson(req, JSON_LIMIT));
      return send(res, 202, { checkId: deps.checks.start(ws, body.suite, body.target ?? { course: ws.meta.course }) });
    }
  }

  const snapshot = /^snapshots\/(s[a-z0-9]{6,20})(\/restore)?$/.exec(rest);
  if (snapshot) {
    if (snapshot[2]) {
      only(req, "POST");
      return send(res, 200, await ws.restoreSnapshot(snapshot[1]));
    }
    only(req, "DELETE");
    await ws.deleteSnapshot(snapshot[1]);
    return send(res, 204);
  }

  const terminal = /^terminals\/([A-Za-z0-9_-]{6,64})$/.exec(rest);
  if (terminal) {
    only(req, "DELETE");
    await ws.closeTerminal(terminal[1]);
    return send(res, 204);
  }

  const task = /^tasks\/([a-z][a-z0-9-]{0,31})\/(start|stop|restart|signal)$/.exec(rest);
  if (task) {
    only(req, "POST");
    const [, name, action] = task;
    if (action === "start") return send(res, 200, await ws.startTask(name));
    if (action === "stop") return send(res, 200, await ws.stopTask(name));
    if (action === "restart") return send(res, 200, await ws.restartTask(name));
    const body = parse(SignalRequest, await readJson(req, JSON_LIMIT));
    await ws.signalTask(name, body.sig);
    return send(res, 204);
  }

  const port = /^ports\/(\d{1,5})$/.exec(rest);
  if (port) {
    only(req, "DELETE");
    ws.unforwardPort(Number(port[1]));
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
    detail: ws.detail,
    image: ws.meta.config.image,
    storage: ws.meta.config.storage,
    createdAt: ws.meta.createdAt,
    lastActiveAt: ws.lastActive,
    ports: ws.portList(),
    leases: ws.leasedPorts(),
    tasks: ws.taskList(),
    terminals: ws.terminalList(),
    changes,
    lastCheck: ws.meta.lastCheck,
    mem: (ws.statusMessage().mem as unknown) ?? null,
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
