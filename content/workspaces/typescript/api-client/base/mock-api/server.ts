// Parcelly's API as a local mock: "the vendor's server". The SDK in src/ talks to it exactly
// as it would talk to the real service, so everything runs offline. It checks the Bearer
// key, pages shipments with an opaque cursor, answers errors in Parcelly's error envelope,
// and misbehaves when a request asks it to (chaos.ts). openapi.yaml is its contract.
// npm run mock starts it on MOCK_PORT.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createChaos } from "./chaos.ts";
import { carriers, events, shipments, type MockShipment } from "./data.ts";
import { toV2 } from "./v2.ts";

export type MockCall = { readonly method: string; readonly path: string; readonly search: string };

export type MockOptions = {
  readonly apiKey?: string;
  /** 0 to 30 ms of made-up network delay per request, from a seeded generator. On by default. */
  readonly latency?: boolean;
  /** DHL stops sending ETAs too, like USPS (a challenge turns this on with MOCK_DHL_NULL_ETA=1). */
  readonly dhlNullEta?: boolean;
};

const STATUSES = ["label_created", "in_transit", "out_for_delivery", "delivered", "exception"];

/** A small seeded random number generator (mulberry32), so the delays repeat run after run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString("base64url");

function decodeCursor(cursor: string): number | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof value === "object" && value !== null && "offset" in value && Number.isInteger(value.offset)) return Number(value.offset);
  } catch {
    // Falls through: not a cursor this server made.
  }
  return null;
}

export function createMockServer(options: MockOptions = {}): { server: Server; calls: MockCall[] } {
  const apiKey = options.apiKey ?? "test_key_123";
  const calls: MockCall[] = [];
  const chaos = createChaos();
  const random = seeded(42);
  let requests = 0;

  const view = (shipment: MockShipment): MockShipment =>
    options.dhlNullEta && shipment.carrier === "dhl" ? { ...shipment, eta: null } : shipment;

  function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
    const text = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)), ...headers });
    res.end(text);
  }

  function handle(req: IncomingMessage, res: ServerResponse, requestId: string): void {
    const url = new URL(req.url ?? "/", "http://localhost");
    const fail = (status: number, code: string, message: string, headers: Record<string, string> = {}): void => {
      send(res, status, { error: { code, message, requestId } }, { "x-request-id": requestId, ...headers });
    };
    if (url.pathname === "/health") {
      send(res, 200, { status: "ok" });
      return;
    }
    if (req.method !== "GET") {
      fail(405, "method_not_allowed", `${String(req.method)} is not supported`, { allow: "GET" });
      return;
    }
    if (req.headers.authorization !== `Bearer ${apiKey}`) {
      fail(401, "unauthorized", "Missing or invalid API key");
      return;
    }
    const action = chaos.decide(url.pathname, req.headers);
    if (action?.kind === "fail") {
      fail(action.status, action.status === 503 ? "unavailable" : "server_error", "Parcelly is having a moment. Try again.");
      return;
    }
    if (action?.kind === "rate_limit") {
      fail(429, "rate_limited", "Too many requests", { "retry-after": String(action.retryAfterSeconds) });
      return;
    }
    const ok = (body: unknown): void => {
      // Garbage: a 200 whose body breaks the contract, as a vendor bug would.
      send(res, 200, action?.kind === "garbage" ? { items: [{ id: 42, status: "lost" }], nextCursor: 7 } : body, { "x-request-id": requestId });
    };

    let match: RegExpExecArray | null;
    if (url.pathname === "/v1/carriers") {
      ok({ items: carriers });
    } else if (url.pathname === "/v1/shipments") {
      const status = url.searchParams.get("status");
      const limit = Number(url.searchParams.get("limit") ?? "5");
      const cursor = url.searchParams.get("cursor");
      const offset = cursor === null ? 0 : decodeCursor(cursor);
      if (status !== null && !STATUSES.includes(status)) fail(400, "invalid_request", `Unknown status: ${status}`);
      else if (!Number.isInteger(limit) || limit < 1 || limit > 20) fail(400, "invalid_request", "limit must be 1 to 20");
      else if (offset === null) fail(400, "invalid_request", "Unknown cursor");
      else {
        const matching = shipments.filter((shipment) => status === null || shipment.status === status).map(view);
        const items = matching.slice(offset, offset + limit);
        ok({ items, nextCursor: offset + limit < matching.length ? encodeCursor(offset + limit) : null });
      }
    } else if ((match = /^\/v1\/shipments\/([^/]+)$/.exec(url.pathname))) {
      const shipment = shipments.find((candidate) => candidate.id === match?.[1]);
      if (shipment) ok(view(shipment));
      else fail(404, "not_found", `No shipment ${String(match[1])}`);
    } else if ((match = /^\/v1\/shipments\/([^/]+)\/events$/.exec(url.pathname))) {
      const id = match[1];
      if (shipments.some((candidate) => candidate.id === id)) ok({ items: events.filter((event) => event.shipmentId === id) });
      else fail(404, "not_found", `No shipment ${String(id)}`);
    } else if ((match = /^\/v2\/shipments\/([^/]+)$/.exec(url.pathname))) {
      const shipment = shipments.find((candidate) => candidate.id === match?.[1]);
      if (shipment) ok(toV2(view(shipment)));
      else fail(404, "not_found", `No shipment ${String(match[1])}`);
    } else {
      fail(404, "not_found", `No route ${url.pathname}`);
    }
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    calls.push({ method: req.method ?? "GET", path: url.pathname, search: url.search });
    const requestId = `req_${String(++requests).padStart(5, "0")}`;
    const delay = (options.latency === false ? 0 : Math.floor(random() * 31)) + chaos.delayMs(req.headers);
    setTimeout(() => {
      handle(req, res, requestId);
    }, delay);
  });
  return { server, calls };
}

// Started directly (npm run mock), it listens on MOCK_PORT. Imported (by test/mock.ts), it
// only exports createMockServer.
if (import.meta.main) {
  const port = Number(process.env["MOCK_PORT"] ?? "4010");
  const host = process.env["HOST"] ?? "0.0.0.0";
  const { server } = createMockServer({ dhlNullEta: process.env["MOCK_DHL_NULL_ETA"] === "1" });
  server.listen(port, host, () => {
    console.log(`Parcelly mock listening on http://localhost:${port} (key test_key_123)`);
  });
}
