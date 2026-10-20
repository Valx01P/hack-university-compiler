import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { workspaceId } from "../lib/workspace-id.mjs";
import { LABEL, connect, resolveEndpoint } from "./docker.ts";
import { ROOT } from "./config.ts";
import { Images } from "./images.ts";
import { buildManifest, manifestHash } from "./storage/host.ts";
import { WebSocket, freePort, startRunner, type RunnerProcess } from "./verify.ts";

/**
 * Workspaces against real Docker, through a real runner in the verify
 * namespace (hv- containers), on the TypeScript playground template in
 * runner/test-fixtures plus a part overlay with a small server. Skipped when
 * Docker is off or hu/node isn't built.
 *
 *   HU_TEST_DATA_DIR    where the runners keep their data (a temp folder by default)
 *   HU_TEST_RUNNER_PORT the first runner's port (3401, or a free one)
 *   HU_TEST_WS_PORTS    the workspace port range the runners split (24000-24099)
 */

const FIXTURES = path.join(ROOT, "runner", "test-fixtures", "content");
const endpoint = resolveEndpoint();
const docker = connect(endpoint);
let skip: string | false = false;
try {
  await docker.ping();
  const images = new Images(ROOT, docker, endpoint.dockerHost);
  await images.refresh();
  if (images.state("node") !== "ready") skip = "hu/node isn't built (npm run images)";
} catch {
  skip = "Docker isn't running";
}

const base = process.env.HU_TEST_DATA_DIR ?? fs.mkdtempSync(path.join(tmpdir(), "hv-ws-"));
const [first, last] = (process.env.HU_TEST_WS_PORTS ?? "24000-24099").split("-").map(Number);
const half = Math.floor((first + last) / 2);
const APP = "http://localhost:3000";

const LAYERS = ["base", "@learn/typescript/runner-test/part-1/practice/starter"];
const TASKS = { start: { cmd: "npm start" }, serve: { cmd: "node src/server.ts", label: "Server" } };
const openBody = (scope: string) => ({
  scope,
  template: "typescript/playground",
  layers: LAYERS,
  tasks: TASKS,
  ports: [{ env: "PORT", label: "API", readyPath: "/healthz" }],
  env: { HU_FIXED_TIME: "2026-10-01T09:00:00Z" },
});

let runner: RunnerProcess;
const opened = new Set<string>();

/** Opens a workspace and remembers it for cleanup. */
async function open(r: RunnerProcess, scope: string) {
  const id = workspaceId(scope);
  const res = await r.request("PUT", `/v1/workspaces/${id}`, { body: openBody(scope) });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  opened.add(`${r.port}:${id}`);
  return { id, json: res.json };
}

/** A raw request to the runner with a byte body. */
function raw(r: RunnerProcess, method: string, urlPath: string, body: Buffer, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: r.port, method, path: urlPath, headers: { host: `127.0.0.1:${r.port}`, authorization: `Bearer ${r.token}`, ...headers } },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, json: text ? JSON.parse(text) : null }));
      }
    );
    req.on("error", reject);
    req.end(body);
  });
}

/** An events socket with every message it got. */
async function events(r: RunnerProcess, id: string) {
  const { ticket } = (await r.request("POST", "/v1/tickets", { body: { workspace: id, kind: "events" } })).json;
  const ws = new WebSocket(`ws://127.0.0.1:${r.port}/v1/ws/events`, { headers: { origin: APP } });
  const got: { at: number; m: any }[] = [];
  ws.on("message", (d) => got.push({ at: Date.now(), m: JSON.parse(String(d)) }));
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  ws.send(JSON.stringify({ t: "hello", ticket }));
  await until(() => got.some((g) => g.m.t === "ready"), 5_000);
  return {
    ws,
    got,
    wait: (pred: (m: any) => boolean, ms = 10_000) => until(() => got.find((g) => pred(g.m)), ms) as Promise<{ at: number; m: any }>,
  };
}

/** A terminal socket: its output so far, and its text messages. */
async function terminal(r: RunnerProcess, id: string, sid: string) {
  const { ticket } = (await r.request("POST", "/v1/tickets", { body: { workspace: id, kind: "term", sid } })).json;
  const ws = new WebSocket(`ws://127.0.0.1:${r.port}/v1/ws/term/${sid}`, { headers: { origin: APP } });
  const state = { out: "", texts: [] as any[] };
  ws.on("message", (d, binary) => {
    if (binary) return void (state.out += d.toString());
    const message = JSON.parse(String(d));
    state.texts.push(message);
    // What the shell printed before this socket attached (its first prompt, say) comes as the replay.
    if (message.t === "replay") state.out += message.data;
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  ws.send(JSON.stringify({ t: "hello", ticket, cols: 100, rows: 30 }));
  await until(() => state.texts.some((t) => t.t === "ready"), 5_000);
  return { ws, state, type: (text: string) => ws.send(Buffer.from(text), { binary: true }) };
}

async function until<T>(fn: () => T | Promise<T>, ms: number, step = 50): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error(`Timed out after ${ms} ms`);
    await new Promise((r) => setTimeout(r, step));
  }
}

/** A GET to a port on the Mac, with any Host, on a new connection (the bridge checks Host per connection, as browsers pool per origin). */
function get(port: number, urlPath: string, host = `127.0.0.1:${port}`) {
  return new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, headers: { host }, agent: false }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}

/** The manifest hash of a workspace's files on the Mac, without .git. */
function filesHash(r: RunnerProcess, id: string): string {
  return manifestHash(buildManifest(path.join(r.dataDir, "workspaces", id, "files"), (p) => p === ".git" || p.startsWith(".git/")));
}

const home = (dataDir: string) => createHash("sha256").update(fs.realpathSync(dataDir)).digest("hex").slice(0, 8);

describe("workspaces", { skip }, () => {
  before(async () => {
    const dir = path.join(base, "runner-a");
    fs.mkdirSync(dir, { recursive: true });
    const port = Number(process.env.HU_TEST_RUNNER_PORT ?? (await freePort(3401)));
    runner = startRunner(port, { HU_CONTENT_DIR: FIXTURES, HU_WS_PORTS: `${first}-${half}`, HU_WS_POLL_MS: "500" }, dir);
    await runner.ready();
  });

  after(async () => {
    if (!runner) return;
    for (const key of opened) {
      const [port, id] = key.split(":");
      if (Number(port) === runner.port) await runner.request("DELETE", `/v1/workspaces/${id}`).catch(() => {});
    }
    await runner.stop();
    const left = await docker.listContainers({ all: true, filters: { label: [`${LABEL.home}=${home(runner.dataDir)}`] } });
    assert.deepEqual(left.map((c) => c.Names[0]), [], "every workspace container is removed");
    const volumes = (await docker.listVolumes({ filters: { label: [`${LABEL.home}=${home(runner.dataDir)}`] } })).Volumes ?? [];
    assert.deepEqual(volumes.map((v) => v.Name), [], "every workspace volume is removed");
  });

  it("materializes the layers, and a full reset reproduces the manifest hash", async () => {
    const { id, json } = await open(runner, "learn/typescript/runner-test/1/practice");
    assert.equal(json.created, true);
    assert.match(json.templateHash, /^[0-9a-f]{12}$/);
    const paths = json.tree.map((e: { path: string }) => e.path);
    assert.ok(paths.includes("src/server.ts"), "the part's overlay is in");
    assert.ok(!paths.includes("README.md"), "its delete.txt removed README.md");
    assert.ok(!paths.includes("transcript.json") && !paths.includes("delete.txt"), "layer metadata stays out");
    assert.ok(json.tree.every((e: { state: string }) => e.state === "same"));
    assert.equal(filesHash(runner, id), json.templateHash);
    const again = await runner.request("PUT", `/v1/workspaces/${id}`, { body: openBody("learn/typescript/runner-test/1/practice") });
    assert.equal(again.json.created, false);
    assert.deepEqual(again.json.updated, []);

    // Change things while stopped (on the Mac): a save, an upload, a delete, a folder, a mode.
    const file = await runner.request("GET", `/v1/workspaces/${id}/file?path=src/greet.ts`);
    const etag = String(file.headers.etag).replace(/"/g, "");
    assert.equal((await raw(runner, "PUT", `/v1/workspaces/${id}/file?path=src/greet.ts`, Buffer.from("export const greet = (n: string) => n;\n"), { "if-match": `"${etag}"` })).status, 200);
    const stale = await raw(runner, "PUT", `/v1/workspaces/${id}/file?path=src/greet.ts`, Buffer.from("x"), { "if-match": `"${etag}"` });
    assert.equal(stale.status, 409, "a save from a stale buffer conflicts");
    assert.match(stale.json.etag, /^[0-9a-f]{64}$/);
    assert.equal((await raw(runner, "POST", `/v1/workspaces/${id}/upload?path=img/logo.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]))).status, 200);
    const del = await runner.request("POST", `/v1/workspaces/${id}/fs`, { body: { op: "delete", path: "data/sample.json" } });
    assert.match(del.json.undo, /^[a-z0-9]{8,40}$/);
    assert.equal((await runner.request("POST", `/v1/workspaces/${id}/fs`, { body: { op: "mkdir", path: "tmp/x" } })).status, 200);
    assert.equal((await runner.request("POST", `/v1/workspaces/${id}/fs`, { body: { op: "chmod", path: "src/main.ts", mode: 0o755 } })).status, 200);
    const binary = await runner.request("GET", `/v1/workspaces/${id}/file?path=img/logo.png`);
    assert.equal(binary.json.binary, true);
    assert.equal(binary.json.mime, "image/png");

    const changes = (await runner.request("GET", `/v1/workspaces/${id}/changes`)).json;
    assert.deepEqual(changes, { added: ["img/logo.png"], modified: ["src/greet.ts", "src/main.ts"], removed: ["data/sample.json"] });
    assert.notEqual(filesHash(runner, id), json.templateHash);

    // Rename and copy, refusing to land on something that exists.
    assert.equal((await runner.request("POST", `/v1/workspaces/${id}/fs`, { body: { op: "copy", path: "src", to: "src-copy" } })).status, 200);
    assert.equal((await runner.request("POST", `/v1/workspaces/${id}/fs`, { body: { op: "rename", path: "src-copy/main.ts", to: "src-copy/greet.ts" } })).status, 409);
    assert.equal((await runner.request("POST", `/v1/workspaces/${id}/fs`, { body: { op: "rename", path: "src-copy", to: "lib/moved" } })).status, 200);
    const moved = (await runner.request("GET", `/v1/workspaces/${id}/tree?path=lib/moved`)).json;
    assert.deepEqual(moved.entries.map((e: { name: string; state: string }) => `${e.name} ${e.state}`), ["greet.ts new", "main.ts new", "server.ts new"]);
    await runner.request("POST", `/v1/workspaces/${id}/fs`, { body: { op: "delete", path: "lib" } });

    // Undo the delete, then delete again.
    assert.equal((await runner.request("POST", `/v1/workspaces/${id}/fs`, { body: { op: "restore", undo: del.json.undo } })).status, 200);
    assert.deepEqual((await runner.request("GET", `/v1/workspaces/${id}/changes`)).json.removed, []);
    await runner.request("POST", `/v1/workspaces/${id}/fs`, { body: { op: "delete", path: "data/sample.json" } });

    const dry = (await runner.request("POST", `/v1/workspaces/${id}/reset`, { body: { scope: "all", dryRun: true } })).json;
    assert.deepEqual(dry.restored.sort(), ["data/sample.json", "src/greet.ts", "src/main.ts"]);
    assert.deepEqual(dry.removed.sort(), ["img", "tmp"]);
    const reset = (await runner.request("POST", `/v1/workspaces/${id}/reset`, { body: { scope: "all" } })).json;
    assert.match(reset.snapshot, /^s[a-z0-9]+$/);
    assert.deepEqual((await runner.request("GET", `/v1/workspaces/${id}/changes`)).json, { added: [], modified: [], removed: [] });
    assert.equal(filesHash(runner, id), json.templateHash, "a full reset reproduces the manifest hash");

    // Undo the reset with its snapshot, then reset again.
    await runner.request("POST", `/v1/workspaces/${id}/snapshots/${reset.snapshot}/restore`);
    assert.deepEqual((await runner.request("GET", `/v1/workspaces/${id}/changes`)).json.modified, ["src/greet.ts", "src/main.ts"]);
    await runner.request("POST", `/v1/workspaces/${id}/reset`, { body: { scope: "file", path: "src/greet.ts" } });
    assert.deepEqual((await runner.request("GET", `/v1/workspaces/${id}/changes`)).json.modified, ["src/main.ts"]);
    await runner.request("POST", `/v1/workspaces/${id}/reset`, { body: { scope: "dir", path: "data" } });
    assert.deepEqual((await runner.request("GET", `/v1/workspaces/${id}/changes`)).json.removed, [], "a folder reset brings back what it held");
    await runner.request("POST", `/v1/workspaces/${id}/reset`, { body: { scope: "all" } });
    assert.equal(filesHash(runner, id), json.templateHash);
    const original = await runner.request("GET", `/v1/workspaces/${id}/original?path=src/greet.ts`);
    assert.equal(original.status, 200);
    assert.equal((await runner.request("GET", `/v1/workspaces/${id}/original?path=img/none.png`)).status, 404);

    // Caps: 1 MB per save, 5 MB per upload.
    assert.equal((await raw(runner, "PUT", `/v1/workspaces/${id}/file?path=big.txt`, Buffer.alloc(1024 * 1024 + 1, 97))).status, 413);
    assert.equal((await raw(runner, "POST", `/v1/workspaces/${id}/upload?path=big.bin`, Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413);

    // A template that changed: the original is rebuilt, the files are left alone, and updated says what moved.
    await raw(runner, "PUT", `/v1/workspaces/${id}/file?path=src/greet.ts`, Buffer.from("mine\n"));
    const changed = await runner.request("PUT", `/v1/workspaces/${id}`, { body: { ...openBody("learn/typescript/runner-test/1/practice"), layers: ["base"] } });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.json.templateHash, json.templateHash);
    assert.deepEqual(changed.json.updated, ["README.md", "src/server.ts"]);
    assert.equal((await runner.request("GET", `/v1/workspaces/${id}/file?path=src/greet.ts`)).json, "mine\n", "the learner's file is untouched");
    const back = await runner.request("PUT", `/v1/workspaces/${id}`, { body: openBody("learn/typescript/runner-test/1/practice") });
    assert.equal(back.json.templateHash, json.templateHash);
    await runner.request("POST", `/v1/workspaces/${id}/reset`, { body: { scope: "all" } });
    assert.equal(filesHash(runner, id), json.templateHash);
  });

  it("refuses paths that escape the workspace, stopped and running", async () => {
    const { id } = await open(runner, "learn/typescript/runner-test/1/practice");
    const outside = path.join(runner.dataDir, "outside");
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "secret.txt"), "top secret\n");
    const files = path.join(runner.dataDir, "workspaces", id, "files");
    fs.symlinkSync(outside, path.join(files, "leak"));
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(files, "leakfile"));

    for (const bad of ["../meta.json", "/etc/passwd", "src/../../meta.json", "a//b"]) {
      assert.equal((await runner.request("GET", `/v1/workspaces/${id}/file?path=${encodeURIComponent(bad)}`)).status, 400, bad);
    }
    assert.equal((await runner.request("GET", `/v1/workspaces/${id}/file?path=leak/secret.txt`)).status, 403);
    assert.equal((await runner.request("GET", `/v1/workspaces/${id}/file?path=leakfile`)).status, 403);
    assert.equal((await raw(runner, "PUT", `/v1/workspaces/${id}/file?path=leak/new.txt`, Buffer.from("x"))).status, 403);
    assert.equal((await runner.request("POST", `/v1/workspaces/${id}/fs`, { body: { op: "rename", path: "leak/secret.txt", to: "s.txt" } })).status, 403);
    assert.equal((await runner.request("POST", `/v1/workspaces/${id}/fs`, { body: { op: "delete", path: "leak/secret.txt" } })).status, 403);
    assert.equal((await runner.request("GET", `/v1/workspaces/${id}/tree?path=leak`)).status, 403);
    const tree = (await runner.request("GET", `/v1/workspaces/${id}/tree`)).json;
    const leak = tree.entries.find((e: { path: string }) => e.path === "leak");
    assert.equal(leak.type, "symlink");
    assert.equal(leak.outside, true);

    // Running: the same refusals, made inside the container.
    assert.equal((await runner.request("POST", `/v1/workspaces/${id}/start`)).json.status, "running");
    assert.equal((await raw(runner, "PUT", `/v1/workspaces/${id}/file?path=leak/new.txt`, Buffer.from("x"))).status, 403);
    assert.equal((await runner.request("POST", `/v1/workspaces/${id}/fs`, { body: { op: "mkdir", path: "leak/d" } })).status, 403);
    assert.equal((await runner.request("GET", `/v1/workspaces/${id}/file?path=leak/secret.txt`)).status, 403);
    assert.deepEqual(fs.readdirSync(outside), ["secret.txt"], "nothing was written outside");
    assert.equal(fs.readFileSync(path.join(outside, "secret.txt"), "utf8"), "top secret\n");
    fs.rmSync(path.join(files, "leak"));
    fs.rmSync(path.join(files, "leakfile"));
  });

  it("shows a file made in a terminal as an fs event within 1 s, and a terminal survives a reattach", async () => {
    const id = workspaceId("learn/typescript/runner-test/1/practice");
    const ev = await events(runner, id);
    const { sid } = (await runner.request("POST", `/v1/workspaces/${id}/terminals`, { body: { cols: 100, rows: 30 } })).json;
    const t1 = await terminal(runner, id, sid);
    await until(() => t1.state.out.includes("$ "), 10_000);
    const sent = Date.now();
    t1.type("echo marker-$((40+2)); echo hi > made-in-terminal.txt\r");
    const event = await ev.wait((m) => m.t === "fs" && m.events.some((e: unknown[]) => e[0] === "add" && e[1] === "made-in-terminal.txt"), 5_000);
    assert.ok(event.at - sent < 1000, `the fs event came ${event.at - sent} ms after the keystroke`);
    await until(() => t1.state.out.includes("marker-42"), 5_000);
    t1.ws.close();
    await new Promise((r) => setTimeout(r, 300));

    const t2 = await terminal(runner, id, sid);
    const replay = await until(() => t2.state.texts.find((t) => t.t === "replay"), 5_000);
    assert.ok(replay.data.includes("marker-42"), "the replay has the scrollback");
    t2.type("echo again-$((1+1))\r");
    await until(() => t2.state.out.includes("again-2"), 5_000);
    t2.ws.close();
    ev.ws.close();
    assert.equal((await runner.request("DELETE", `/v1/workspaces/${id}/terminals/${sid}`)).status, 204);
    await runner.request("POST", `/v1/workspaces/${id}/fs`, { body: { op: "delete", path: "made-in-terminal.txt" } });
  });

  it("pauses a flooding terminal until it's acknowledged, answers Ctrl+C at once, and has one writer", async () => {
    const id = workspaceId("learn/typescript/runner-test/1/practice");
    const { sid } = (await runner.request("POST", `/v1/workspaces/${id}/terminals`, { body: { cols: 100, rows: 30 } })).json;
    const t = await terminal(runner, id, sid);
    await until(() => t.state.out.includes("$ "), 10_000);
    const viewer = await terminal(runner, id, sid);
    assert.equal(viewer.state.texts.find((m) => m.t === "ready").readonly, true, "a second socket is read-only");
    viewer.type("echo from-viewer\r");
    t.type("yes\r");
    // Without acks the runner stops reading after 100,000 bytes (plus what was in flight).
    await new Promise((r) => setTimeout(r, 1000));
    const before = t.state.out.length;
    await new Promise((r) => setTimeout(r, 500));
    assert.ok(t.state.out.length - before < 300_000, `paused: ${t.state.out.length - before} more bytes arrived`);
    assert.ok(t.state.out.length < 2_000_000, `bounded: ${t.state.out.length} bytes`);
    const sent = Date.now();
    t.ws.send(JSON.stringify({ t: "signal", sig: "INT" }));
    // Acknowledge everything from here on, so the rest drains.
    const ack = setInterval(() => t.ws.send(JSON.stringify({ t: "ack", bytes: 1_000_000 })), 20);
    t.type("echo after-$((2*3))\r");
    await until(() => t.state.out.includes("after-6"), 10_000);
    clearInterval(ack);
    assert.ok(Date.now() - sent < 5_000, `Ctrl+C answered in ${Date.now() - sent} ms`);
    assert.ok(!t.state.out.includes("from-viewer"), "a read-only socket can't type");
    viewer.ws.send(JSON.stringify({ t: "takeover" }));
    await until(() => t.state.texts.some((m) => m.t === "mode" && m.readonly === true), 5_000);
    viewer.type("echo viewer-$((3*3))\r");
    await until(() => viewer.state.out.includes("viewer-9"), 5_000);
    t.ws.close();
    viewer.ws.close();
    assert.equal((await runner.request("DELETE", `/v1/workspaces/${id}/terminals/${sid}`)).status, 204);
  });

  it("forwards a server it finds listening on a port it didn't lease, and snapshots while running", async () => {
    const id = workspaceId("learn/typescript/runner-test/1/practice");
    const ev = await events(runner, id);
    const extra = half - 1;
    const { sid } = (await runner.request("POST", `/v1/workspaces/${id}/terminals`, { body: { cols: 100, rows: 30 } })).json;
    const t = await terminal(runner, id, sid);
    await until(() => t.state.out.includes("$ "), 10_000);
    t.type(`node -e "require('http').createServer((q,s)=>s.end('extra')).listen(${extra}, '127.0.0.1')" &\r`);
    const found = await ev.wait((m) => m.t === "port" && m.target === extra && m.state === "listening", 10_000);
    assert.equal(found.m.declared, false);
    assert.equal(found.m.bind, "127.0.0.1", "a loopback bind is noted");
    assert.equal(found.m.port, extra, "the same number when the Mac has it free");
    assert.equal((await get(found.m.port, "/")).body, "extra");
    const ports = (await runner.request("GET", `/v1/workspaces/${id}/ports`)).json;
    assert.ok(ports.some((p: { target: number }) => p.target === extra));
    const byHand = (await runner.request("POST", `/v1/workspaces/${id}/ports`, { body: { port: extra - 1 } })).json;
    assert.equal(byHand.target, extra - 1);
    assert.equal(byHand.state, "closed");
    assert.equal((await get(byHand.port, "/")).status, 503, "forwarded, with nothing listening yet");
    assert.equal((await runner.request("DELETE", `/v1/workspaces/${id}/ports/${byHand.port}`)).status, 204);
    const snap = (await runner.request("POST", `/v1/workspaces/${id}/snapshots`, { body: { label: "before kill" } })).json;
    assert.equal(snap.label, "before kill");
    assert.ok((await runner.request("GET", `/v1/workspaces/${id}/snapshots`)).json.snapshots.some((x: { id: string }) => x.id === snap.id));
    t.type("kill %1\r");
    await ev.wait((m) => m.t === "port" && m.target === extra && m.state === "closed", 10_000);
    t.ws.close();
    ev.ws.close();
    await runner.request("DELETE", `/v1/workspaces/${id}/terminals/${sid}`);
  });

  it("serves a task's server on its leased port, from the Mac and through the API panel", async () => {
    const id = workspaceId("learn/typescript/runner-test/1/practice");
    const ev = await events(runner, id);
    const task = (await runner.request("POST", `/v1/workspaces/${id}/tasks/serve/start`)).json;
    assert.match(task.sid, /^l/);
    const listening = await ev.wait((m) => m.t === "port" && m.state === "listening", 15_000);
    const port = listening.m.port;
    assert.ok(port >= first && port <= half, `port ${port} is in the range`);
    assert.equal(listening.m.target, port, "the same number inside and out");
    assert.equal(listening.m.framable, true, "GET / sends no X-Frame-Options");
    assert.equal(listening.m.process, "node");
    await ev.wait((m) => m.t === "task" && m.name === "serve" && m.state === "running", 5_000);

    const direct = await get(port, "/healthz");
    assert.equal(direct.status, 200);
    assert.deepEqual(JSON.parse(direct.body), { ok: true });
    assert.equal((await get(port, "/healthz", `localhost:${port}`)).status, 200);
    assert.equal((await get(port, "/healthz", `evil.example:${port}`)).status, 421, "DNS rebinding is refused");

    const one = (await runner.request("POST", `/v1/workspaces/${id}/http`, { body: { port, method: "GET", path: "/hello?name=Ada" } })).json;
    assert.equal(one.status, 200);
    assert.deepEqual(JSON.parse(one.body), { greeting: "Hello, Ada!", seen: null });
    assert.equal(one.cookies[0].name, "seen");
    const two = (await runner.request("POST", `/v1/workspaces/${id}/http`, { body: { port, method: "GET", path: "/hello?name=Bo" } })).json;
    assert.equal(JSON.parse(two.body).seen, "seen=1", "the cookie jar sent it back");
    assert.equal((await runner.request("POST", `/v1/workspaces/${id}/http`, { body: { port: 1, method: "GET", path: "/" } })).status, 404);

    // The log view replays the server's output.
    const log = await terminal(runner, id, task.sid);
    const replay = await until(() => log.state.texts.find((t) => t.t === "replay"), 5_000);
    assert.match(replay.data, /Listening on http:\/\/localhost:\d+/);
    log.ws.close();

    const stopped = (await runner.request("POST", `/v1/workspaces/${id}/tasks/serve/stop`)).json;
    assert.equal(stopped.state, "exited");
    const exit = await ev.wait((m) => m.t === "task" && m.name === "serve" && m.state === "exited", 5_000);
    assert.equal(exit.m.code, 0, "the server shut down cleanly on TERM");
    await ev.wait((m) => m.t === "port" && m.port === port && m.state === "closed", 5_000);
    assert.equal((await get(port, "/healthz")).status, 503, "nothing listening gives the 503 page");
    ev.ws.close();
  });

  it("never gives two workspaces the same port", async () => {
    const a = workspaceId("learn/typescript/runner-test/1/practice");
    const { id: b } = await open(runner, "learn/typescript/runner-test/1/example-2");
    assert.equal((await runner.request("POST", `/v1/workspaces/${b}/start`)).json.status, "running");
    // The standard profile (architecture §11.2).
    const info = await docker.getContainer(`hv-ws-${home(runner.dataDir)}-${b}`).inspect();
    const hc = info.HostConfig as Record<string, any>;
    assert.equal(info.Config.User, "1000:1000");
    assert.deepEqual(hc.CapDrop, ["ALL"]);
    assert.equal(hc.Privileged, false);
    assert.equal(hc.ReadonlyRootfs, true);
    assert.deepEqual(hc.SecurityOpt, ["no-new-privileges"]);
    assert.equal(hc.NetworkMode, "none");
    assert.equal(hc.Memory, 1024 ** 3);
    assert.equal(hc.MemorySwap, 1024 ** 3);
    assert.equal(hc.PidsLimit, 512);
    assert.deepEqual(hc.Ulimits.find((u: { Name: string }) => u.Name === "nofile"), { Name: "nofile", Soft: 4096, Hard: 8192 });
    assert.deepEqual(Object.keys(hc.PortBindings ?? {}), [], "no published port");
    assert.equal(info.Mounts.find((m: { Destination: string }) => m.Destination === "/workspace")?.Type, "bind");
    assert.ok(info.Config.Env.includes("HOST=0.0.0.0"));
    // Changes inside the running container: a rename and a copy.
    assert.equal((await runner.request("POST", `/v1/workspaces/${b}/fs`, { body: { op: "copy", path: "src/greet.ts", to: "src/greet2.ts" } })).status, 200);
    assert.equal((await runner.request("POST", `/v1/workspaces/${b}/fs`, { body: { op: "rename", path: "src/greet2.ts", to: "src/greet.ts" } })).status, 409);
    assert.equal((await runner.request("POST", `/v1/workspaces/${b}/fs`, { body: { op: "rename", path: "src/greet2.ts", to: "src/greet3.ts" } })).status, 200);
    assert.deepEqual((await runner.request("GET", `/v1/workspaces/${b}/changes`)).json.added, ["src/greet3.ts"]);

    const pa = (await runner.request("GET", `/v1/workspaces/${a}`)).json.leases.PORT;
    const pb = (await runner.request("GET", `/v1/workspaces/${b}`)).json.leases.PORT;
    assert.ok(pa && pb && pa !== pb, `${pa} and ${pb}`);
    assert.equal((await runner.request("POST", `/v1/workspaces/${b}/stop`)).json.status, "stopped");
    assert.equal((await runner.request("POST", `/v1/workspaces/${b}/start`)).json.status, "running");
    assert.equal((await runner.request("GET", `/v1/workspaces/${b}`)).json.leases.PORT, pb, "a restart keeps its port");
    assert.equal((await runner.request("DELETE", `/v1/workspaces/${b}`)).status, 204);
    opened.delete(`${runner.port}:${b}`);
  });

  it("downloads a zip without .git, and carries code on from another workspace", async () => {
    const a = workspaceId("learn/typescript/runner-test/1/practice");
    // The running workspace has a .git from its first start: the zip leaves it out.
    const zipped = await new Promise<Buffer>((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port: runner.port, path: `/v1/workspaces/${a}/archive`, headers: { host: `127.0.0.1:${runner.port}`, authorization: `Bearer ${runner.token}` } },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve(Buffer.concat(chunks)));
        }
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(zipped.subarray(0, 4).toString("latin1"), "PK\x03\x04");
    const file = path.join(runner.dataDir, "download.zip");
    fs.writeFileSync(file, zipped);
    const listing = execFileSync("unzip", ["-l", file], { encoding: "utf8" });
    assert.match(listing, /src\/greet\.ts/);
    assert.doesNotMatch(listing, /\.git\//);
    assert.ok(fs.existsSync(path.join(runner.dataDir, "workspaces", a, "files", ".git")), "the workspace itself has one");
    execFileSync("unzip", ["-tq", file]);

    await raw(runner, "PUT", `/v1/workspaces/${a}/file?path=src/greet.ts`, Buffer.from("// carried\nexport const greet = (n: string) => `Yo ${n}`;\n"));
    const { id: b } = await open(runner, "learn/typescript/runner-test/2/practice");
    const carried = (await runner.request("POST", `/v1/workspaces/${b}/carry`, { body: { from: "learn/typescript/runner-test/1/practice" } })).json;
    assert.deepEqual(carried.restored, ["src/greet.ts"]);
    assert.equal((await runner.request("GET", `/v1/workspaces/${b}/file?path=src/greet.ts`)).json, "// carried\nexport const greet = (n: string) => `Yo ${n}`;\n");
    await runner.request("POST", `/v1/workspaces/${b}/snapshots/${carried.snapshot}/restore`);
    assert.deepEqual((await runner.request("GET", `/v1/workspaces/${b}/changes`)).json.modified, [], "Undo puts its own files back");
    assert.equal((await runner.request("POST", `/v1/workspaces/${b}/carry`, { body: { from: "learn/typescript/nowhere/1/practice" } })).status, 404);
    await runner.request("POST", `/v1/workspaces/${a}/reset`, { body: { scope: "file", path: "src/greet.ts" } });
  });

  it("runs cmd, http, and process checks that pass and fail when they should", async () => {
    const id = workspaceId("learn/typescript/runner-test/1/practice");
    const ev = await events(runner, id);
    const run = async (suite: string) => {
      const { checkId } = (await runner.request("POST", `/v1/workspaces/${id}/check`, { body: { suite, target: { course: "typescript", lesson: "runner-test", part: 1 } } })).json;
      assert.match(checkId, /^c[a-z2-7]{10}$/);
      const done = await ev.wait((m) => m.t === "check" && m.checkId === checkId && m.phase === "done", 90_000);
      const rows = ev.got.filter((g) => g.m.t === "check" && g.m.checkId === checkId && g.m.phase === "tests");
      assert.equal(rows.length, done.m.result.tests.length, "one event per finished test");
      assert.deepEqual((await runner.request("GET", `/v1/checks/${checkId}`)).json, done.m.result);
      return done.m.result;
    };
    const pass = await run("workspaces/typescript/playground/checks/runner");
    assert.equal(pass.status, "passed", JSON.stringify(pass.tests));
    assert.deepEqual(pass.tests.map((t: { id: string; status: string }) => `${t.id} ${t.status}`), ["typecheck pass", "start pass", "hello pass", "graceful pass"]);
    assert.equal(pass.tests[0].title, "The project type-checks");

    // Break greet: the program's output and the API both change.
    await raw(runner, "PUT", `/v1/workspaces/${id}/file?path=src/greet.ts`, Buffer.from("export function greet(name: string): string {\n  return `Hi ${name}`;\n}\n"));
    const fail = await run("workspaces/typescript/playground/checks/runner");
    assert.equal(fail.status, "failed");
    const byId = Object.fromEntries(fail.tests.map((t: { id: string }) => [t.id, t]));
    assert.equal(byId.typecheck.status, "pass");
    assert.equal(byId.start.status, "fail");
    assert.equal(byId.start.expected.split("\n")[0], "Hello, TypeScript!");
    assert.equal(byId.start.actual.split("\n")[0], "Hi TypeScript");
    assert.equal(byId.hello.status, "fail");
    assert.match(byId.hello.message, /\$\.greeting: expected "Hello, Ada!", got "Hi Ada"/);
    assert.equal(byId.hello.request.path, "/hello?name=Ada");
    assert.equal(byId.hello.response.status, 200);

    // A type error shows where it is.
    await raw(runner, "PUT", `/v1/workspaces/${id}/file?path=src/greet.ts`, Buffer.from("export function greet(name: string): string {\n  return 42;\n}\n"));
    const typed = await run("workspaces/typescript/playground/checks/runner");
    const typecheck = typed.tests.find((t: { id: string }) => t.id === "typecheck");
    assert.equal(typecheck.status, "fail");
    assert.deepEqual(typecheck.location, { file: "src/greet.ts", line: 2, col: 3 });

    const unsupported = await run("workspaces/typescript/playground/checks/unsupported");
    assert.equal(unsupported.tests[1].status, "error", "a kind the runner can't run never passes");
    assert.notEqual(unsupported.status, "passed");
    await runner.request("POST", `/v1/workspaces/${id}/reset`, { body: { scope: "file", path: "src/greet.ts" } });
    ev.ws.close();
  });

  it("stops a workspace that's idle", async () => {
    const dir = path.join(base, "runner-b");
    fs.mkdirSync(dir, { recursive: true });
    const idle = startRunner(await freePort(runner.port + 1), { HU_CONTENT_DIR: FIXTURES, HU_WS_PORTS: `${half + 1}-${last}`, HU_IDLE_MS: "2000", HU_POLL_MS: "1000" }, dir);
    try {
      await idle.ready();
      const { id } = await open(idle, "learn/typescript/runner-test/1/example-3");
      const ev = await events(idle, id);
      assert.equal((await idle.request("POST", `/v1/workspaces/${id}/start`)).json.status, "running");
      const limit = await ev.wait((m) => m.t === "limit" && m.kind === "idle", 15_000);
      assert.match(limit.m.message, /20 minutes|activity/);
      assert.equal((await idle.request("GET", `/v1/workspaces/${id}`)).json.status, "stopped");
      ev.ws.close();
      assert.equal((await idle.request("DELETE", `/v1/workspaces/${id}`)).status, 204);
    } finally {
      await idle.stop();
      const left = await docker.listContainers({ all: true, filters: { label: [`${LABEL.home}=${home(dir)}`] } });
      for (const c of left) await docker.getContainer(c.Id).remove({ force: true }).catch(() => {});
      assert.equal(left.length, 0, "the idle runner left no container");
    }
  });
});
