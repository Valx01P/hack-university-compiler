import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { hostAllowed, originAllowed, type TicketKind, type Tickets } from "./auth.ts";
import type { DockerWatch } from "./docker.ts";
import type { Log } from "./log.ts";

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
 *    with 4401, and a ticket for another kind of socket or another terminal
 *    with 4403.
 *
 * Tickets never appear in URLs or logs. In P0 an events socket answers
 * "ready" and reports Docker's state. Terminals arrive in P1, so a term ticket
 * that checks out still closes with 4404.
 */

export const CLOSE = { badHello: 4400, noTicket: 4401, wrongTicket: 4403, noSuchSession: 4404 } as const;

export interface WsDeps {
  port: number;
  appPort: number;
  helloTimeoutMs: number;
  tickets: Tickets;
  watch: DockerWatch;
  log: Log;
}

function refuse(socket: Duplex, status: number, reason: string) {
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
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

function greet(ws: WebSocket, kind: TicketKind, sid: string | undefined, deps: WsDeps) {
  const timer = setTimeout(() => ws.close(CLOSE.noTicket, "No ticket"), deps.helloTimeoutMs);
  ws.on("error", () => ws.terminate());
  ws.once("message", (data, isBinary) => {
    clearTimeout(timer);
    let hello: { t?: unknown; ticket?: unknown } | null = null;
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
    if (kind === "term") return ws.close(CLOSE.noSuchSession, "No such terminal");

    const { workspace } = redeemed.binding;
    const send = (message: unknown) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
    };
    send({ t: "ready", workspace, seq: 0 });
    send({ t: "docker", state: deps.watch.state === "ready" ? "up" : deps.watch.state });
    const off = deps.watch.onChange((state) => send({ t: "docker", state: state === "ready" ? "up" : state }));
    ws.on("close", off);
    // Heartbeats ({"t":"hb"}) keep a workspace from going idle in P1. Nothing else is read yet.
    ws.on("message", () => {});
  });
}
