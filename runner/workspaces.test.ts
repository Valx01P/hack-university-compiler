import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { base32, workspaceId } from "../lib/workspace-id.mjs";
import { Tickets } from "./auth.ts";
import { ROOT, loadConfig } from "./config.ts";
import type { DockerWatch } from "./docker.ts";
import type { EventMessage } from "./events.ts";
import { createApiServer } from "./http.ts";
import { HttpError } from "./http-util.ts";
import type { Images } from "./images.ts";
import { JobPool } from "./jobs.ts";
import { quietLog } from "./log.ts";
import type { OpenWorkspace } from "./schemas.ts";
import { Workspaces } from "./workspaces.ts";

/**
 * Workspaces as folders on this computer, with no Docker anywhere: a
 * compiler's folder (compiler/python) and the playground, opened from the
 * templates in runner/test-fixtures (copied, so a test can change one), in
 * a data folder of the test's own. tmux is off (HU_HOST_TMUX=0), so nothing
 * here can reach a tmux server, the app's included.
 */

process.env.HU_HOST_TMUX = "0";

const FIXTURES = path.join(ROOT, "runner", "test-fixtures", "content");
// The real path: macOS's tmpdir() is under /var, a symbolic link, which the
// runner's reads never follow (O_NOFOLLOW_ANY).
const base = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), "hv-ws-")));
const content = path.join(base, "content");
fs.cpSync(FIXTURES, content, { recursive: true });
const config = loadConfig({ HU_NS: "verify", HU_DATA_DIR: path.join(base, "data"), HU_CONTENT_DIR: content });
const workspaces = new Workspaces({ config, owner: { ns: "verify", boot: "test", port: 0 }, log: quietLog });

const HIDDEN = ["AGENTS.md", "CLAUDE.md", ".hu"];
const python: OpenWorkspace = { scope: "compiler/python", template: "python/compiler", layers: ["base"], storage: "host", shell: "host", hidden: HIDDEN };
const playground: OpenWorkspace = { scope: "playground", template: "playground/blank", layers: ["base"], storage: "host", shell: "host", hidden: HIDDEN };
const PY = workspaceId("compiler/python");
const PG = workspaceId("playground");
const filesOf = (id: string) => path.join(config.dataDir, "workspaces", id, "files");
const states = async (id: string) => Object.fromEntries((await workspaces.get(id)!.snapshotTree()).entries.map((e) => [e.path, e.state]));

after(async () => {
  await workspaces.shutdown();
  fs.rmSync(base, { recursive: true, force: true });
});

/** Waits for `ok`, a few seconds at most. */
async function until(ok: () => boolean, ms = 5_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (ok()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return ok();
}

/** The HTTP error a promise fails with. */
async function refused(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof HttpError) return err;
    throw err;
  }
  throw new Error("It was accepted.");
}

describe("opening a workspace", () => {
  it("makes a compiler's folder and the playground from their templates, and finds them again", async () => {
    const opened = await workspaces.open(PY, python);
    assert.equal(opened.created, true);
    assert.equal(opened.status, "files");
    assert.deepEqual(
      opened.tree.map((e) => [e.path, e.state]).sort(),
      [
        ["AGENTS.md", "same"],
        ["CLAUDE.md", "same"],
        ["main.py", "same"],
      ]
    );
    assert.equal(fs.readFileSync(path.join(filesOf(PY), "main.py"), "utf8"), 'print("Hello")\n');
    const pg = await workspaces.open(PG, playground);
    assert.equal(pg.created, true);
    assert.ok(pg.tree.some((e) => e.path === "README.md"));
    const again = await workspaces.open(PY, python);
    assert.equal(again.created, false);
    assert.deepEqual(again.updated, []);
    assert.equal(again.templateHash, opened.templateHash);
    const meta = JSON.parse(fs.readFileSync(path.join(config.dataDir, "workspaces", PG, "meta.json"), "utf8"));
    assert.equal(meta.course, "playground");
    assert.deepEqual(meta.config, { storage: "host", shell: "host", hidden: HIDDEN, readonly: [] });
  });

  it("refuses what isn't a scope, another course's template, and a template that isn't there", async () => {
    const id = (scope: string) => `w${base32(createHash("sha256").update(scope).digest()).slice(0, 10)}`;
    const old = await refused(workspaces.open(id("playground/typescript"), { ...playground, scope: "playground/typescript" }));
    assert.equal(old.status, 400);
    assert.equal((await refused(workspaces.open(PG, { ...playground, template: "python/compiler" }))).status, 400);
    assert.equal((await refused(workspaces.open(PG, { ...playground, course: "python" }))).status, 400);
    assert.equal((await refused(workspaces.open(PY, { ...python, template: "python/nope" }))).status, 400);
    assert.equal((await refused(workspaces.open(PG, python))).status, 400, "the id isn't the scope's");
  });
});

describe("a workspace's files", () => {
  before(async () => {
    await workspaces.open(PY, python);
  });

  it("are read and written with etags, and a stale one is refused", async () => {
    const ws = workspaces.get(PY)!;
    const first = ws.readFile("main.py");
    assert.equal(first.text, true);
    const saved = await ws.writeFile("main.py", Buffer.from('print("Hi")\n'), { ifMatch: first.etag });
    assert.notEqual(saved.etag, first.etag);
    const stale = await refused(ws.writeFile("main.py", Buffer.from("x\n"), { ifMatch: first.etag }));
    assert.equal(stale.status, 409);
    assert.equal(ws.readOriginal("main.py").data.toString(), 'print("Hello")\n');
    assert.equal((await states(PY))["main.py"], "modified");
  });

  it("are made, moved, copied, deleted, and put back, and marked against the original", async () => {
    const ws = workspaces.get(PY)!;
    await ws.fsOp({ op: "mkdir", path: "data" });
    await ws.writeFile("data/input.txt", Buffer.from("3 4\n"));
    await ws.fsOp({ op: "copy", path: "data/input.txt", to: "data/copy.txt" });
    await ws.fsOp({ op: "rename", path: "data/copy.txt", to: "data/moved.txt" });
    let now = await states(PY);
    assert.equal(now.data, "new");
    assert.equal(now["data/input.txt"], "new");
    assert.equal(now["data/moved.txt"], "new");
    assert.equal(now["data/copy.txt"], undefined);
    const { undo } = await ws.fsOp({ op: "delete", path: "data" });
    assert.ok(undo);
    assert.equal(fs.existsSync(path.join(filesOf(PY), "data")), false);
    await ws.fsOp({ op: "restore", undo });
    assert.equal(fs.readFileSync(path.join(filesOf(PY), "data", "input.txt"), "utf8"), "3 4\n");
    await ws.fsOp({ op: "delete", path: "CLAUDE.md" });
    const tree = await ws.snapshotTree();
    assert.deepEqual(tree.removed, ["CLAUDE.md"]);
    assert.deepEqual(tree.changes, { added: ["data/input.txt", "data/moved.txt"], modified: ["main.py"], removed: ["CLAUDE.md"] });
    now = await states(PY);
    assert.equal(now["AGENTS.md"], "same");
  });

  it("go back to the original a file or a folder at a time, and a dry run changes nothing", async () => {
    const ws = workspaces.get(PY)!;
    assert.deepEqual(await ws.reset("file", "main.py", true), { restored: ["main.py"], removed: [] });
    assert.equal(fs.readFileSync(path.join(filesOf(PY), "main.py"), "utf8"), 'print("Hi")\n');
    assert.deepEqual(await ws.reset("file", "main.py", false), { restored: ["main.py"], removed: [] });
    assert.equal(fs.readFileSync(path.join(filesOf(PY), "main.py"), "utf8"), 'print("Hello")\n');
    assert.deepEqual(await ws.reset("file", "CLAUDE.md", false), { restored: ["CLAUDE.md"], removed: [] });
    assert.deepEqual(await ws.reset("dir", "data", false), { restored: [], removed: ["data"] });
    assert.deepEqual((await ws.changes()), { added: [], modified: [], removed: [] });
  });

  it("show up as events a moment after something else changes them (a terminal, a tool)", async () => {
    const ws = workspaces.get(PY)!;
    const got: EventMessage[] = [];
    const sub = { send: (m: EventMessage) => void got.push(m) };
    ws.subscribe(sub);
    try {
      fs.writeFileSync(path.join(filesOf(PY), "made-outside.txt"), "hello\n");
      const seen = () => got.some((m) => m.t === "fs" && (m.events as [string, string][]).some(([kind, p]) => kind === "add" && p === "made-outside.txt"));
      assert.ok(await until(seen), JSON.stringify(got));
    } finally {
      ws.unsubscribe(sub);
      fs.rmSync(path.join(filesOf(PY), "made-outside.txt"), { force: true });
    }
  });
});

describe("a template's hidden notes", () => {
  it("follow the template where the learner left them, and stay the learner's where they edited them", async () => {
    await workspaces.open(PG, playground);
    fs.writeFileSync(path.join(filesOf(PG), "CLAUDE.md"), "my own\n");
    fs.writeFileSync(path.join(content, "workspaces", "playground", "blank", "base", "AGENTS.md"), "# This folder\n\nNew notes.\n");
    fs.writeFileSync(path.join(content, "workspaces", "playground", "blank", "base", "CLAUDE.md"), "@AGENTS.md\n\nMore.\n");
    fs.writeFileSync(path.join(content, "workspaces", "playground", "blank", "base", "README.md"), "# Playground\n\nChanged.\n");
    fs.writeFileSync(path.join(filesOf(PG), "README.md"), "mine\n");
    const reopened = await workspaces.open(PG, playground);
    assert.deepEqual(reopened.updated, ["AGENTS.md", "CLAUDE.md", "README.md"]);
    assert.equal(fs.readFileSync(path.join(filesOf(PG), "AGENTS.md"), "utf8"), "# This folder\n\nNew notes.\n");
    assert.equal(fs.readFileSync(path.join(filesOf(PG), "CLAUDE.md"), "utf8"), "my own\n");
    // Not a hidden note: the learner's, whatever the template does.
    assert.equal(fs.readFileSync(path.join(filesOf(PG), "README.md"), "utf8"), "mine\n");
  });
});

describe("a folder from before", () => {
  it("whose scope is no longer one is left alone, never opened and never removed", async () => {
    const scope = "playground/typescript";
    const id = `w${base32(createHash("sha256").update(scope).digest()).slice(0, 10)}`;
    const dir = path.join(config.dataDir, "workspaces", id);
    fs.mkdirSync(path.join(dir, "files"), { recursive: true });
    fs.writeFileSync(path.join(dir, "files", "notes.md"), "mine\n");
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ version: 1, id, scope, course: "typescript", template: "typescript/playground", layers: ["base"] }));
    assert.equal(workspaces.get(id), null);
    assert.ok(workspaces.all().every((w) => w.id !== id));
    await workspaces.open(PG, playground);
    workspaces.sweep();
    assert.equal(fs.readFileSync(path.join(dir, "files", "notes.md"), "utf8"), "mine\n");
  });
});

describe("terminals", () => {
  it("are this computer's shell, only where shellPlace allows one", async () => {
    await workspaces.open(PG, playground);
    const ws = workspaces.get(PG)!;
    const sid = await ws.openTerminal(80, 24);
    assert.match(sid, /^h[A-Za-z0-9_-]{12}$/);
    assert.deepEqual(ws.terminalList().map((t) => [t.sid, t.kind]), [[sid, "shell"]]);
    await ws.closeTerminal(sid);
    assert.deepEqual(ws.terminalList(), []);
    // Opened without asking for a shell here, it has none.
    await workspaces.open(PG, { ...playground, shell: undefined });
    assert.equal((await refused(ws.openTerminal(80, 24))).status, 409);
    await workspaces.open(PG, playground);
  });
});

describe("the routes", () => {
  let server: http.Server;
  let port = 0;
  const TOKEN = "unit-test-token";
  const watch = { state: "down", facts: null, docker: {}, ready: async () => false, check: async () => "down", onChange: () => () => {} } as unknown as DockerWatch;
  const images = { state: () => "missing", tag: (n: string) => `hu/${n}:0123456789ab`, versionsOf: () => ({}), refresh: async () => {} } as unknown as Images;

  // The server's Host rule reads its port, known once it listens.
  const serverConfig = { ...config, port: 0 };

  before(async () => {
    server = createApiServer({
      config: serverConfig,
      token: TOKEN,
      tickets: new Tickets(300),
      watch,
      images,
      pool: new JobPool(1),
      owner: { ns: "verify", boot: "test", port: 0 },
      log: quietLog,
      startedAt: Date.now(),
      version: "0.0.0",
      workspaces,
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
    serverConfig.port = port;
  });

  after(() => {
    server.closeAllConnections();
    server.close();
  });

  function request(method: string, url: string, body?: unknown): Promise<{ status: number; json: any }> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const headers: Record<string, string> = { host: `127.0.0.1:${port}`, authorization: `Bearer ${TOKEN}` };
      if (payload) headers["content-type"] = "application/json";
      const req = http.request({ host: "127.0.0.1", port, method, path: url, headers }, (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, json: raw && raw.startsWith("{") ? JSON.parse(raw) : raw }));
      });
      req.on("error", reject);
      req.end(payload);
    });
  }

  it("open a folder with Docker off, and say what it has, its terminals included", async () => {
    const opened = await request("PUT", `/v1/workspaces/${PG}`, playground);
    assert.equal(opened.status, 200);
    assert.deepEqual(Object.keys(opened.json).sort(), ["created", "id", "removed", "status", "templateHash", "tree", "updated"]);
    const { json: term } = await request("POST", `/v1/workspaces/${PG}/terminals`, { cols: 80, rows: 24 });
    const status = await request("GET", `/v1/workspaces/${PG}`);
    assert.equal(status.json.status, "files");
    assert.deepEqual(status.json.terminals.map((t: { sid: string; kind: string; exited: boolean }) => [t.sid, t.kind, t.exited]), [[term.sid, "shell", false]]);
    assert.equal((await request("DELETE", `/v1/workspaces/${PG}/terminals/${term.sid}`)).status, 204);
  });

  it("take only what the folders use", async () => {
    // A container's fields, a database reset, and the routes that ran in one.
    assert.equal((await request("PUT", `/v1/workspaces/${PG}`, { ...playground, image: "node" })).status, 400);
    assert.equal((await request("PUT", `/v1/workspaces/${PG}`, { ...playground, tasks: { dev: "npm run dev" } })).status, 400);
    assert.equal((await request("PUT", `/v1/workspaces/${PG}`, { ...playground, storage: "volume" })).status, 400);
    assert.equal((await request("POST", `/v1/workspaces/${PG}/reset`, { scope: "all" })).status, 400);
    assert.equal((await request("POST", `/v1/workspaces/${PG}/reset`, { scope: "file", path: "README.md" })).status, 200);
    for (const [method, route] of [
      ["POST", "start"],
      ["POST", "stop"],
      ["GET", "tasks"],
      ["GET", "ports"],
      ["POST", "http"],
      ["GET", "snapshots"],
      ["POST", "carry"],
      ["POST", "check"],
      ["GET", "archive"],
    ]) {
      assert.equal((await request(method, `/v1/workspaces/${PG}/${route}`, method === "POST" ? {} : undefined)).status, 404, route);
    }
    assert.equal((await request("GET", "/v1/checks/cabcdefghij")).status, 404);
  });

  it("list the folders, and remove one", async () => {
    const { json } = await request("GET", "/v1/workspaces");
    assert.deepEqual(json.workspaces.map((w: { scope: string }) => w.scope).sort(), ["compiler/python", "playground"]);
    assert.equal((await request("DELETE", `/v1/workspaces/${PY}`)).status, 204);
    assert.equal(fs.existsSync(path.join(config.dataDir, "workspaces", PY)), false);
    assert.equal((await request("GET", `/v1/workspaces/${PY}`)).status, 404);
  });
});
