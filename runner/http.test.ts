import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { WebSocket } from "ws";
import { Tickets } from "./auth.ts";
import type { Config } from "./config.ts";
import type { DockerWatch } from "./docker.ts";
import { createApiServer, type ApiDeps } from "./http.ts";
import type { Images } from "./images.ts";
import { JobPool } from "./jobs.ts";
import { quietLog } from "./log.ts";
import { CLOSE, attachWebSockets } from "./ws.ts";

/**
 * The runner's front door, on a real server with Docker faked out: the token,
 * the Host and Origin rules, CORS, bodies, Docker being off, and the
 * WebSocket tickets (S9 runs the same checks against a real runner).
 */

const TOKEN = "unit-test-token";
let port = 0;
let server: http.Server;
let dockerState: "ready" | "down" | "waking" = "ready";
let imageState = "ready";
const tickets = new Tickets(300);
const config = { port: 0, appPort: 3000 } as Config;

const watch = {
  get state() {
    return dockerState;
  },
  facts: { serverVersion: "29.7.2", apiVersion: "1.55", arch: "aarch64", memTotal: 8_318_976_000, ncpu: 14 },
  docker: {},
  ready: async () => dockerState === "ready",
  onChange: () => () => {},
} as unknown as DockerWatch;

const images = {
  state: () => imageState,
  tag: (name: string) => `hu/${name}:0123456789ab`,
  versionsOf: () => ({ node: "26.12.0" }),
  refresh: async () => {},
} as unknown as Images;

function request(
  method: string,
  path: string,
  { headers = {}, body }: { headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; json: Record<string, unknown> | null }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, json: raw ? JSON.parse(raw) : null }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

const auth = { authorization: `Bearer ${TOKEN}` };
const json = { ...auth, "content-type": "application/json" };

before(async () => {
  const deps: ApiDeps = {
    config,
    token: TOKEN,
    tickets,
    watch,
    images,
    pool: new JobPool(4),
    owner: { ns: "verify", boot: "test", port: 0 },
    log: quietLog,
    services: { piston: true, postgres: "absent", mongo: "absent" },
    startedAt: Date.now(),
    version: "0.0.0",
  };
  server = createApiServer(deps);
  const wsDeps = { port: 0, appPort: 3000, helloTimeoutMs: 200, tickets, watch, log: quietLog };
  attachWebSockets(server, wsDeps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
  config.port = port;
  wsDeps.port = port;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

describe("the REST API", () => {
  it("needs the token", async () => {
    const none = await request("GET", "/v1/health");
    assert.equal(none.status, 401);
    assert.equal(none.headers["www-authenticate"], "Bearer");
    assert.equal(none.json?.error, "unauthorized");
    assert.equal((await request("GET", "/v1/health", { headers: { authorization: "Bearer nope" } })).status, 401);
  });

  it("refuses any request with an Origin, and every preflight, without CORS headers", async () => {
    const withOrigin = await request("GET", "/v1/health", { headers: { ...auth, origin: "http://localhost:3000" } });
    assert.equal(withOrigin.status, 403);
    const preflight = await request("OPTIONS", "/v1/run", {
      headers: { origin: "http://localhost:23017", "access-control-request-method": "POST" },
    });
    assert.equal(preflight.status, 403);
    assert.equal(Object.keys(preflight.headers).some((h) => h.startsWith("access-control-")), false);
  });

  it("refuses a foreign Host (DNS rebinding)", async () => {
    const res = await request("GET", "/v1/health", { headers: { ...auth, host: `evil.example:${port}` } });
    assert.equal(res.status, 403);
    assert.equal((await request("GET", "/v1/health", { headers: { ...auth, host: `localhost:${port}` } })).status, 200);
  });

  it("answers health with Docker, images, recipes, jobs, and the budget", async () => {
    const res = await request("GET", "/v1/health", { headers: auth });
    assert.equal(res.status, 200);
    const body = res.json as Record<string, Record<string, unknown>>;
    assert.equal(body.docker.state, "ready");
    assert.equal(body.docker.belowFloor, false);
    assert.deepEqual(body.images, { "hu/node": "ready", "hu/bash": "ready" });
    assert.equal((body.recipes.typescript as Record<string, unknown>).image, "hu/node:0123456789ab");
    assert.deepEqual(body.jobs, { running: 0, queued: 0, slots: 4 });
    // 7,933 MiB, less 512 of headroom and Piston's 2,048.
    assert.equal(body.workspaces.budgetMb, 5373);
  });

  it("wants JSON bodies that pass the schema", async () => {
    assert.equal((await request("POST", "/v1/run", { headers: { ...auth, "content-type": "text/plain" }, body: "{}" })).status, 415);
    assert.equal((await request("POST", "/v1/run", { headers: json, body: "{" })).status, 400);
    const bad = await request("POST", "/v1/run", { headers: json, body: JSON.stringify({ recipe: "typescript", files: [], cmd: ["sh"] }) });
    assert.equal(bad.status, 400);
    assert.match(String(bad.json?.message), /Unrecognized key/);
    const huge = await request("POST", "/v1/tickets", { headers: json, body: JSON.stringify({ pad: "x".repeat(70_000) }) });
    assert.equal(huge.status, 413);
  });

  it("says to start Docker when it's off, and to build an image that's missing", async () => {
    const body = JSON.stringify({ recipe: "bash", files: [{ name: "main.sh", content: "echo hi" }] });
    dockerState = "down";
    const down = await request("POST", "/v1/run", { headers: json, body });
    assert.equal(down.status, 503);
    assert.deepEqual(down.json, { error: "docker_unavailable", message: "Start Docker to run this." });
    dockerState = "ready";
    imageState = "missing";
    const missing = await request("POST", "/v1/run", { headers: json, body });
    assert.equal(missing.status, 503);
    assert.equal(missing.json?.error, "image_missing");
    imageState = "ready";
  });

  it("issues tickets, and routes the rest", async () => {
    const res = await request("POST", "/v1/tickets", { headers: json, body: JSON.stringify({ workspace: "wk3j6q2m7xa", kind: "events" }) });
    assert.equal(res.status, 200);
    assert.match(String(res.json?.ticket), /^[A-Za-z0-9_-]{43}$/);
    assert.equal((await request("POST", "/v1/prewarm", { headers: json, body: JSON.stringify({ course: "typescript" }) })).status, 204);
    assert.equal((await request("GET", "/v1/workspaces", { headers: auth })).status, 501);
    assert.equal((await request("GET", "/v1/nope", { headers: auth })).status, 404);
    assert.equal((await request("GET", "/v1/admin/images", { headers: auth })).status, 403);
    assert.equal((await request("GET", "/v1/run", { headers: auth })).status, 405);
  });
});

function open(path: string, headers: Record<string, string> = {}): Promise<{ ws: WebSocket; refused?: number }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers: { origin: "http://localhost:3000", ...headers } });
    ws.once("open", () => resolve({ ws }));
    ws.once("unexpected-response", (_req, res) => resolve({ ws, refused: res.statusCode }));
    ws.once("error", () => {});
  });
}

/** Sends a hello and resolves with the first message, or the close code. */
function hello(ws: WebSocket, ticket?: string): Promise<{ message?: Record<string, unknown>; code?: number }> {
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve({ message: JSON.parse(String(data)) }));
    ws.once("close", (code) => resolve({ code }));
    if (ticket !== undefined) ws.send(JSON.stringify({ t: "hello", ticket }));
  });
}

describe("the WebSockets", () => {
  const issue = (kind: "events" | "term" = "events", sid?: string) => tickets.issue({ workspace: "wk3j6q2m7xa", kind, sid }).ticket;

  it("need the app's Origin and the runner's Host before anything opens", async () => {
    assert.equal((await open("/v1/ws/events", { origin: "http://evil.example" })).refused, 403);
    assert.equal((await open("/v1/ws/events", { origin: "http://localhost:23017" })).refused, 403);
    assert.equal((await open("/v1/ws/events", { host: `evil.example:${port}` })).refused, 403);
    assert.equal((await open("/v1/ws/nope")).refused, 404);
  });

  it("open with a ticket and say ready", async () => {
    const { ws } = await open("/v1/ws/events");
    const first = await hello(ws, issue());
    assert.deepEqual(first.message, { t: "ready", workspace: "wk3j6q2m7xa", seq: 0 });
    ws.close();
  });

  it("refuse a reused, expired, or missing ticket with 4401", async () => {
    const ticket = issue();
    const one = await open("/v1/ws/events");
    await hello(one.ws, ticket);
    one.ws.close();
    const again = await open("/v1/ws/events");
    assert.equal((await hello(again.ws, ticket)).code, CLOSE.noTicket);

    const stale = issue();
    await new Promise((r) => setTimeout(r, 350));
    const late = await open("/v1/ws/events");
    assert.equal((await hello(late.ws, stale)).code, CLOSE.noTicket);

    const silent = await open("/v1/ws/events");
    assert.equal((await hello(silent.ws)).code, CLOSE.noTicket);
  });

  it("refuse a ticket for another kind of socket or another terminal with 4403", async () => {
    const term = await open("/v1/ws/term/s1abcdef");
    assert.equal((await hello(term.ws, issue("events"))).code, CLOSE.wrongTicket);
    const other = await open("/v1/ws/term/s2abcdef");
    assert.equal((await hello(other.ws, issue("term", "s1abcdef"))).code, CLOSE.wrongTicket);
    const events = await open("/v1/ws/events");
    assert.equal((await hello(events.ws, issue("term", "s1abcdef"))).code, CLOSE.wrongTicket);
  });

  it("close a good terminal ticket with 4404 until terminals exist (P1)", async () => {
    const term = await open("/v1/ws/term/s1abcdef");
    assert.equal((await hello(term.ws, issue("term", "s1abcdef"))).code, CLOSE.noSuchSession);
  });
});
