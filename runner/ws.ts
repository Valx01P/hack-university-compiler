import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { hostAllowed, originAllowed, type TicketBinding, type TicketKind, type Tickets } from "./auth.ts";
import type { DockerWatch } from "./docker.ts";
import type { EventMessage, Subscriber } from "./events.ts";
import type { Log } from "./log.ts";
import type { TermSocket } from "./terminals.ts";
import type { Workspaces } from "./workspaces.ts";

/**
 * The browser's WebSockets (architecture §3.3): /v1/ws/events, one per open
 * workspace, and /v1/ws/term/:sid, one per terminal. The browser connects to
 * ws://127.0.0.1:3100 (never localhost, so the localhost cookies that previews
 * set never ride along) and must:
 *
 * 1. send the runner's own Host and the app's Origin, or the upgrade is
 *    refused with 403 before any WebSocket exists;
 * 2. send its ticket as the first message, {"t":"hello","ticket":"…"},
 *    within 5 seconds. A missing, reused, or expired ticket closes the socket
 *    with 4401, a ticket for another kind of socket or another terminal with
 *    4403, and a workspace or terminal that doesn't exist with 4404.
 *
 * Tickets never appear in URLs or logs. runner/README.md lists every message.
 */

export const CLOSE = { badHello: 4400, noTicket: 4401, wrongTicket: 4403, noSuchSession: 4404 } as const;

const PING_MS = 25_000;

export interface WsDeps {
  port: number;
  appPort: number;
  helloTimeoutMs: number;
  tickets: Tickets;
  watch: DockerWatch;
  log: Log;
  /** Workspaces, when the runner has them (tests of the front door run without). */
  workspaces?: Workspaces;
  termGraceMs?: number;
}

/** Answers an upgrade with an HTTP error, then closes the socket once it's sent. */
function refuse(socket: Duplex, status: number, reason: string) {
  socket.once("finish", () => socket.destroy());
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

export function attachWebSockets(server: http.Server, deps: WsDeps): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false });

  server.on("upgrade", (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on("error", () => socket.destroy());
    if (!hostAllowed(req.headers.host, deps.port)) return refuse(socket, 403, "Forbidden");
    if (!originAllowed(req.headers.origin, deps.appPort)) return refuse(socket, 403, "Forbidden");
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const term = /^\/v1\/ws\/term\/([A-Za-z0-9_-]{6,64})$/.exec(url.pathname);
    let kind: TicketKind;
    if (url.pathname === "/v1/ws/events") kind = "events";
    else if (term) kind = "term";
    else return refuse(socket, 404, "Not Found");
    const sid = term?.[1];
    wss.handleUpgrade(req, socket, head, (ws) => greet(ws, kind, sid, deps));
  });

  return wss;
}

function sendJson(ws: WebSocket, message: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function greet(ws: WebSocket, kind: TicketKind, sid: string | undefined, deps: WsDeps) {
  const timer = setTimeout(() => ws.close(CLOSE.noTicket, "No ticket"), deps.helloTimeoutMs);
  ws.on("error", () => ws.terminate());
  ws.once("message", (data, isBinary) => {
    clearTimeout(timer);
    let hello: { t?: unknown; ticket?: unknown; since?: unknown; cols?: unknown; rows?: unknown } | null = null;
    try {
      hello = isBinary ? null : JSON.parse(data.toString());
    } catch {
      hello = null;
    }
    if (!hello || hello.t !== "hello") return ws.close(CLOSE.badHello, "Expected hello");
    const redeemed = deps.tickets.redeem(hello.ticket, kind, sid);
    if (!redeemed.ok) {
      deps.log.warn("ws.refused", { kind, reason: redeemed.reason });
      return ws.close(redeemed.reason === "mismatch" ? CLOSE.wrongTicket : CLOSE.noTicket, "Ticket refused");
    }
    const ping = setInterval(() => sendJson(ws, { t: "ping" }), PING_MS);
    ping.unref();
    ws.on("close", () => clearInterval(ping));
    if (kind === "term") return terminal(ws, redeemed.binding, hello, deps);
    events(ws, redeemed.binding, hello, deps);
  });
}

function events(ws: WebSocket, binding: TicketBinding, hello: { since?: unknown }, deps: WsDeps) {
  const workspace = deps.workspaces?.get(binding.workspace) ?? null;
  const dockerState = () => (deps.watch.state === "ready" ? "up" : deps.watch.state);
  if (!workspace) {
    if (deps.workspaces) return ws.close(CLOSE.noSuchSession, "No such workspace");
    // The front door alone (its tests): ready and Docker, nothing else.
    sendJson(ws, { t: "ready", workspace: binding.workspace, seq: 0, resync: false });
    sendJson(ws, { t: "docker", state: dockerState() });
    const off = deps.watch.onChange((state) => sendJson(ws, { t: "docker", state: state === "ready" ? "up" : state }));
    ws.on("close", off);
    ws.on("message", () => {});
    return;
  }
  const sub: Subscriber = { send: (message: EventMessage) => sendJson(ws, message) };
  const since = typeof hello.since === "number" && Number.isInteger(hello.since) ? hello.since : undefined;
  const { seq, resync, missed } = workspace.subscribe(sub, since);
  sendJson(ws, { t: "ready", workspace: workspace.id, seq, resync });
  sendJson(ws, workspace.statusMessage());
  sendJson(ws, { t: "docker", state: dockerState() });
  for (const port of workspace.portList()) sendJson(ws, { t: "port", ...port });
  for (const task of workspace.taskList()) sendJson(ws, { t: "task", name: task.name, state: task.state, code: task.code, signal: task.signal, sid: task.sid });
  for (const message of missed) sendJson(ws, message);
  const off = deps.watch.onChange((state) => sendJson(ws, { t: "docker", state: state === "ready" ? "up" : state }));
  ws.on("close", () => {
    off();
    workspace.unsubscribe(sub);
  });
  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    let message: { t?: unknown; visible?: unknown };
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (message.t === "hb") workspace.heartbeat(message.visible !== false);
    else if (message.t === "ping") sendJson(ws, { t: "pong" });
  });
}

function terminal(ws: WebSocket, binding: TicketBinding, hello: { cols?: unknown; rows?: unknown }, deps: WsDeps) {
  const workspace = deps.workspaces?.get(binding.workspace) ?? null;
  const session = binding.sid ? workspace?.session(binding.sid) : undefined;
  if (!workspace || !session) return ws.close(CLOSE.noSuchSession, "No such terminal");
  const socket: TermSocket = {
    sendText: (message) => sendJson(ws, message),
    sendBinary: (data) => {
      if (ws.readyState === ws.OPEN) ws.send(data, { binary: true });
    },
    close: (code, reason) => ws.close(code, reason),
    get buffered() {
      return ws.bufferedAmount;
    },
  };
  const size = (v: unknown, fallback: number) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : fallback);
  void session.attach(socket, size(hello.cols, session.cols), size(hello.rows, session.rows));
  ws.on("message", (data, isBinary) => {
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
    if (isBinary) return session.input(socket, buf);
    let message: { t?: unknown; cols?: unknown; rows?: unknown; bytes?: unknown; sig?: unknown };
    try {
      message = JSON.parse(buf.toString("utf8"));
    } catch {
      return;
    }
    if (message.t === "resize") session.resize(socket, size(message.cols, session.cols), size(message.rows, session.rows));
    else if (message.t === "ack") session.ack(socket, Number(message.bytes));
    else if (message.t === "signal" && typeof message.sig === "string") session.signal(socket, message.sig);
    else if (message.t === "takeover") session.takeover(socket);
    else if (message.t === "ping") sendJson(ws, { t: "pong" });
  });
  ws.on("close", () => session.detach(socket, deps.termGraceMs ?? 600_000, () => workspace.expireTerminal(session.sid)));
}
