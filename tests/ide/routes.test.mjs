// The workspace routes (app/api/workspaces, app/api/tickets) against the
// in-memory fake runner: the rules every request must meet (architecture
// §3.1), and that only the allowlisted routes, paths, and bodies get through.
//
//   node --import ./tests/ide/register.mjs --test tests/ide/routes.test.mjs

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { startFakeRunner } from "./fake-runner.mjs";

let fake;
let open;
let proxy;
let tickets;
let workspaceId;

const APP = "http://localhost:3410";

/** A request as the app's own page sends it. */
function req(path, { method = "GET", body, headers = {}, raw = false } = {}) {
  const h = new Headers({ host: "localhost:3410", origin: APP, "sec-fetch-site": "same-origin", ...headers });
  if (method !== "GET" && !("x-hu" in headers)) h.set("x-hu", "1");
  for (const [k, v] of Object.entries(headers)) if (v === null) h.delete(k);
  return new Request(`${APP}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
}

const ctx = (id, path = []) => ({ params: Promise.resolve({ id, path }) });

before(async () => {
  fake = await startFakeRunner({ token: "test-token", appPort: 3410 });
  process.env.HU_RUNNER_PORT = String(fake.port);
  process.env.HU_RUNNER_TOKEN = "test-token";
  open = await import("@/app/api/workspaces/route");
  proxy = await import("@/app/api/workspaces/[id]/[[...path]]/route");
  tickets = await import("@/app/api/tickets/route");
  ({ workspaceId } = await import("@/lib/workspace-id.mjs"));
});

after(async () => {
  await fake?.close();
});

describe("POST /api/workspaces", () => {
  test("opens the playground and answers its tree", async () => {
    const res = await open.POST(req("/api/workspaces", { method: "POST", body: { scope: "playground/typescript" } }));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.id, workspaceId("playground/typescript"));
    assert.equal(data.scope, "playground/typescript");
    // The tree comes in GET …/tree's shape: {path, entries, removed, more}.
    const entries = data.tree.entries;
    assert.ok(entries.some((e) => e.path === "README.md" && e.type === "file"));
    assert.ok(entries.some((e) => e.path === "src/main.ts"));
  });

  test("sends the runner what content says, never what the browser says", async () => {
    const id = workspaceId("playground/typescript");
    const ws = fake.workspaces.get(id);
    assert.equal(ws.body.image, "node");
    assert.deepEqual(ws.body.layers, ["base"]);
    assert.deepEqual(ws.body.tasks.dev, { cmd: "npm run dev", label: "Watch" });
    assert.equal(ws.body.template, "typescript/playground");
    assert.equal(ws.body.course, "typescript");
  });

  test("refuses a body with anything but a scope", async () => {
    const res = await open.POST(req("/api/workspaces", { method: "POST", body: { scope: "playground/typescript", image: "evil" } }));
    assert.equal(res.status, 400);
  });

  test("refuses what isn't a scope, and a course with no playground", async () => {
    for (const scope of ["playground/typescript/../../etc", "/etc/passwd", "playground/TypeScript", 42]) {
      const res = await open.POST(req("/api/workspaces", { method: "POST", body: { scope } }));
      assert.equal(res.status, 400, String(scope));
    }
    const res = await open.POST(req("/api/workspaces", { method: "POST", body: { scope: "playground/python" } }));
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, "no_such_workspace");
  });

  test("refuses writes without X-HU, other sites, other origins, and other hosts", async () => {
    const body = { scope: "playground/typescript" };
    const cases = [
      { "x-hu": null },
      { "sec-fetch-site": "same-site" },
      { "sec-fetch-site": "cross-site" },
      { origin: "http://localhost:24101" },
      { host: "evil.example:3410" },
    ];
    for (const headers of cases) {
      const res = await open.POST(req("/api/workspaces", { method: "POST", body, headers }));
      assert.equal(res.status, 403, JSON.stringify(headers));
    }
  });

  test("says the runner isn't running when nothing answers", async () => {
    const saved = process.env.HU_RUNNER_PORT;
    process.env.HU_RUNNER_PORT = "1";
    try {
      const res = await open.POST(req("/api/workspaces", { method: "POST", body: { scope: "playground/typescript" } }));
      assert.equal(res.status, 503);
      const data = await res.json();
      assert.equal(data.code, "runner_down");
      assert.match(data.error, /npm run up/);
    } finally {
      process.env.HU_RUNNER_PORT = saved;
    }
  });
});

describe("/api/workspaces/:id/...", () => {
  const scope = "playground/typescript";
  let id;
  before(async () => {
    id = workspaceId(scope);
    await open.POST(req("/api/workspaces", { method: "POST", body: { scope } }));
  });

  test("reads a file with its ETag", async () => {
    const res = await proxy.GET(req(`/api/workspaces/${id}/file?path=src/greet.ts`), ctx(id, ["file"]));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("etag"), /^"[0-9a-f]{64}"$/);
    assert.match(await res.text(), /export function greet/);
  });

  test("refuses paths outside the workspace", async () => {
    for (const p of ["../etc/passwd", "/etc/passwd", "src/../../x", "a//b", "a/./b"]) {
      const res = await proxy.GET(req(`/api/workspaces/${id}/file?path=${encodeURIComponent(p)}`), ctx(id, ["file"]));
      assert.equal(res.status, 400, p);
    }
  });

  test("saves with If-Match, and answers 409 for a stale one", async () => {
    const got = await proxy.GET(req(`/api/workspaces/${id}/file?path=src/greet.ts`), ctx(id, ["file"]));
    const etag = got.headers.get("etag");
    const text = `${await got.text()}// edited\n`;
    const saved = await proxy.PUT(
      req(`/api/workspaces/${id}/file?path=src/greet.ts`, { method: "PUT", body: text, raw: true, headers: { "if-match": etag } }),
      ctx(id, ["file"])
    );
    assert.equal(saved.status, 200);
    const stale = await proxy.PUT(
      req(`/api/workspaces/${id}/file?path=src/greet.ts`, { method: "PUT", body: "x", raw: true, headers: { "if-match": etag } }),
      ctx(id, ["file"])
    );
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).code, "conflict");
  });

  test("caps a file write at 1 MB", async () => {
    const big = "x".repeat(1024 * 1024 + 1);
    const res = await proxy.PUT(req(`/api/workspaces/${id}/file?path=big.txt`, { method: "PUT", body: big, raw: true }), ctx(id, ["file"]));
    assert.equal(res.status, 413);
  });

  test("checks file operations", async () => {
    const bad = await proxy.POST(req(`/api/workspaces/${id}/fs`, { method: "POST", body: { op: "rename", path: "a.ts" } }), ctx(id, ["fs"]));
    assert.equal(bad.status, 400);
    const restoreByPath = await proxy.POST(req(`/api/workspaces/${id}/fs`, { method: "POST", body: { op: "restore", path: "a.ts" } }), ctx(id, ["fs"]));
    assert.equal(restoreByPath.status, 400);
    const escape = await proxy.POST(req(`/api/workspaces/${id}/fs`, { method: "POST", body: { op: "mkdir", path: "../up" } }), ctx(id, ["fs"]));
    assert.equal(escape.status, 400);
    const ok = await proxy.POST(req(`/api/workspaces/${id}/fs`, { method: "POST", body: { op: "mkdir", path: "src/models" } }), ctx(id, ["fs"]));
    assert.equal(ok.status, 200);
  });

  test("passes on only the listed routes", async () => {
    const cases = [
      ["GET", ["admin"]],
      ["POST", ["exec"]],
      ["POST", ["tasks", "dev;rm", "start"]],
      ["DELETE", ["file"]],
      ["GET", ["file", "extra"]],
    ];
    for (const [method, path] of cases) {
      const res = await proxy[method](req(`/api/workspaces/${id}/${path.join("/")}`, { method, body: method === "GET" ? undefined : {} }), ctx(id, path));
      assert.equal(res.status, 404, `${method} ${path.join("/")}`);
    }
    const notId = await proxy.GET(req("/api/workspaces/abc/tree"), ctx("abc", ["tree"]));
    assert.equal(notId.status, 404);
  });

  test("starts only the template's tasks, by name", async () => {
    const res = await proxy.POST(req(`/api/workspaces/${id}/tasks/dev/start`, { method: "POST" }), ctx(id, ["tasks", "dev", "start"]));
    const signal = await proxy.POST(req(`/api/workspaces/${id}/tasks/dev/signal`, { method: "POST", body: { sig: "EXEC" } }), ctx(id, ["tasks", "dev", "signal"]));
    assert.equal(signal.status, 400);
    assert.equal(res.status, 200);
    assert.match((await res.json()).sid, /^s/);
    const unknown = await proxy.POST(req(`/api/workspaces/${id}/tasks/deploy/start`, { method: "POST" }), ctx(id, ["tasks", "deploy", "start"]));
    assert.equal(unknown.status, 404);
  });

  test("checks the API panel's requests", async () => {
    const bad = await proxy.POST(
      req(`/api/workspaces/${id}/http`, { method: "POST", body: { port: 24100, method: "GET", path: "/", headers: { "x-a": "1\r\nInjected: yes" } } }),
      ctx(id, ["http"])
    );
    assert.equal(bad.status, 400);
    const noSlash = await proxy.POST(req(`/api/workspaces/${id}/http`, { method: "POST", body: { port: 24100, method: "GET", path: "http://evil" } }), ctx(id, ["http"]));
    assert.equal(noSlash.status, 400);
  });

  test("a playground has no checks, and a check names its own workspace", async () => {
    const none = await proxy.POST(req(`/api/workspaces/${id}/check`, { method: "POST", body: { scope } }), ctx(id, ["check"]));
    assert.equal(none.status, 404);
    const other = await proxy.POST(req(`/api/workspaces/${id}/check`, { method: "POST", body: { scope: "playground/typescript/2" } }), ctx(id, ["check"]));
    assert.equal(other.status, 400);
  });

  test("resets one file back to the template", async () => {
    await proxy.PUT(req(`/api/workspaces/${id}/file?path=src/main.ts`, { method: "PUT", body: "changed\n", raw: true }), ctx(id, ["file"]));
    const res = await proxy.POST(req(`/api/workspaces/${id}/reset`, { method: "POST", body: { scope: "file", path: "src/main.ts" } }), ctx(id, ["reset"]));
    assert.equal(res.status, 200);
    const back = await proxy.GET(req(`/api/workspaces/${id}/file?path=src/main.ts`), ctx(id, ["file"]));
    assert.match(await back.text(), /The playground's program/);
    const noPath = await proxy.POST(req(`/api/workspaces/${id}/reset`, { method: "POST", body: { scope: "file" } }), ctx(id, ["reset"]));
    assert.equal(noPath.status, 400);
  });
});

describe("POST /api/tickets", () => {
  test("gets a ticket and the socket address", async () => {
    const id = workspaceId("playground/typescript");
    const res = await tickets.POST(req("/api/tickets", { method: "POST", body: { workspace: id, kind: "events" } }));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.match(data.ticket, /^[A-Za-z0-9_-]{20,}$/);
    assert.equal(data.url, `ws://127.0.0.1:${fake.port}`);
  });

  test("refuses bad bindings", async () => {
    const id = workspaceId("playground/typescript");
    const cases = [
      { workspace: "nope", kind: "events" },
      { workspace: id, kind: "admin" },
      { workspace: id, kind: "term" },
      { workspace: id, kind: "events", sid: "s1234567" },
      { workspace: id, kind: "term", sid: "bad sid!" },
    ];
    for (const body of cases) {
      const res = await tickets.POST(req("/api/tickets", { method: "POST", body }));
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });
});
