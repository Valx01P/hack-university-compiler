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
    const res = await open.POST(req("/api/workspaces", { method: "POST", body: { scope: "playground" } }));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.id, workspaceId("playground"));
    assert.equal(data.scope, "playground");
    // The tree comes in GET …/tree's shape: {path, entries, removed, more}.
    const entries = data.tree.entries;
    assert.ok(entries.some((e) => e.path === "README.md" && e.type === "file"));
    assert.ok(entries.some((e) => e.path === "AGENTS.md"));
  });

  test("sends the runner what content says, never what the browser says", async () => {
    const ws = fake.workspaces.get(workspaceId("playground"));
    assert.deepEqual(ws.body, {
      scope: "playground",
      template: "playground/blank",
      course: "playground",
      layers: ["base"],
      storage: "host",
      shell: "host",
      hidden: ["AGENTS.md", "CLAUDE.md", ".hu"],
      readonly: [],
    });
    const res = await open.POST(req("/api/workspaces", { method: "POST", body: { scope: "compiler/python" } }));
    assert.equal(res.status, 200);
    const compiler = fake.workspaces.get(workspaceId("compiler/python"));
    assert.equal(compiler.body.template, "python/compiler");
    assert.equal(compiler.body.course, "python");
    assert.equal(compiler.body.shell, "host");
    assert.equal(compiler.body.image, undefined);
  });

  test("refuses a body with anything but a scope", async () => {
    const res = await open.POST(req("/api/workspaces", { method: "POST", body: { scope: "playground", image: "evil" } }));
    assert.equal(res.status, 400);
  });

  test("refuses what isn't a scope, the old kinds, and a course with no compiler", async () => {
    for (const scope of ["playground/../../etc", "/etc/passwd", "Playground", "playground/typescript", "sandbox/typescript/orders-service", "learn/python/basics/1/practice", 42]) {
      const res = await open.POST(req("/api/workspaces", { method: "POST", body: { scope } }));
      assert.equal(res.status, 400, String(scope));
    }
    for (const scope of ["compiler/react", "compiler/nope"]) {
      const res = await open.POST(req("/api/workspaces", { method: "POST", body: { scope } }));
      assert.equal(res.status, 404, scope);
      assert.equal((await res.json()).code, "no_such_workspace");
    }
  });

  test("refuses writes without X-HU, other sites, other origins, and other hosts", async () => {
    const body = { scope: "playground" };
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
      const res = await open.POST(req("/api/workspaces", { method: "POST", body: { scope: "playground" } }));
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
  const scope = "compiler/python";
  let id;
  before(async () => {
    id = workspaceId(scope);
    await open.POST(req("/api/workspaces", { method: "POST", body: { scope } }));
  });

  test("reads a file with its ETag", async () => {
    const res = await proxy.GET(req(`/api/workspaces/${id}/file?path=main.py`), ctx(id, ["file"]));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("etag"), /^"[0-9a-f]{64}"$/);
    assert.match(await res.text(), /print/);
  });

  test("refuses paths outside the workspace", async () => {
    for (const p of ["../etc/passwd", "/etc/passwd", "src/../../x", "a//b", "a/./b"]) {
      const res = await proxy.GET(req(`/api/workspaces/${id}/file?path=${encodeURIComponent(p)}`), ctx(id, ["file"]));
      assert.equal(res.status, 400, p);
    }
  });

  test("saves with If-Match, and answers 409 for a stale one", async () => {
    const got = await proxy.GET(req(`/api/workspaces/${id}/file?path=main.py`), ctx(id, ["file"]));
    const etag = got.headers.get("etag");
    const text = `${await got.text()}// edited\n`;
    const saved = await proxy.PUT(
      req(`/api/workspaces/${id}/file?path=main.py`, { method: "PUT", body: text, raw: true, headers: { "if-match": etag } }),
      ctx(id, ["file"])
    );
    assert.equal(saved.status, 200);
    const stale = await proxy.PUT(
      req(`/api/workspaces/${id}/file?path=main.py`, { method: "PUT", body: "x", raw: true, headers: { "if-match": etag } }),
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

  test("passes on only the listed routes, none of the old containers'", async () => {
    const cases = [
      ["GET", ["admin"]],
      ["POST", ["exec"]],
      ["POST", ["start"]],
      ["POST", ["tasks", "dev", "start"]],
      ["GET", ["ports"]],
      ["POST", ["http"]],
      ["POST", ["check"]],
      ["GET", ["snapshots"]],
      ["POST", ["carry"]],
      ["GET", ["archive"]],
      ["POST", ["db", "query"]],
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

  test("resets one file back to the template, and nothing wider", async () => {
    await proxy.PUT(req(`/api/workspaces/${id}/file?path=main.py`, { method: "PUT", body: "changed\n", raw: true }), ctx(id, ["file"]));
    const res = await proxy.POST(req(`/api/workspaces/${id}/reset`, { method: "POST", body: { scope: "file", path: "main.py" } }), ctx(id, ["reset"]));
    assert.equal(res.status, 200);
    const back = await proxy.GET(req(`/api/workspaces/${id}/file?path=main.py`), ctx(id, ["file"]));
    assert.match(await back.text(), /print/);
    for (const body of [{ scope: "file" }, { scope: "all" }, { scope: "everything" }, { scope: "db" }]) {
      const bad = await proxy.POST(req(`/api/workspaces/${id}/reset`, { method: "POST", body }), ctx(id, ["reset"]));
      assert.equal(bad.status, 400, JSON.stringify(body));
    }
  });
});

describe("POST /api/tickets", () => {
  test("gets a ticket and the socket address", async () => {
    const id = workspaceId("playground");
    const res = await tickets.POST(req("/api/tickets", { method: "POST", body: { workspace: id, kind: "events" } }));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.match(data.ticket, /^[A-Za-z0-9_-]{20,}$/);
    assert.equal(data.url, `ws://127.0.0.1:${fake.port}`);
  });

  test("refuses bad bindings", async () => {
    const id = workspaceId("playground");
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
