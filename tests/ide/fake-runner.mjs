// An in-memory stand-in for hu-runner's workspace routes (architecture §3.2
// and §3.3), for the IDE's tests and for working on the IDE before the
// runner's own routes exist. It lives only here: the app never ships it.
//
// It keeps each workspace's files in memory, materialized from the same
// content layers the runner copies, and speaks the same REST routes and
// WebSockets: tickets, the events socket (status, fs, port, task, check), and
// terminal sockets with replay. Terminals run a tiny pretend shell written
// here (ls, cd, cat, echo, touch, mkdir, rm, mv, pwd, clear), never anything
// on this machine. A task named dev serves a fixed page on a port from the
// workspace range, so the Ports panel, the preview, and the API panel have
// something real to talk to. Nothing a learner types ever runs.

import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import http from "node:http";
import path from "node:path";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { layerSource } from "../../lib/workspace-layers.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const require = createRequire(path.join(ROOT, "runner", "package.json"));
const { WebSocketServer } = require("ws");

const sha = (data) => createHash("sha256").update(data).digest("hex");
const now = () => Date.now();

/** Materializes layers into a Map of path -> {type, data, mode}. */
function materialize(course, template, layers) {
  const files = new Map();
  const remove = (p) => {
    for (const key of [...files.keys()]) if (key === p || key.startsWith(`${p}/`)) files.delete(key);
  };
  const dirs = (p) => {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) {
      const d = parts.slice(0, i).join("/");
      if (!files.has(d)) files.set(d, { type: "dir", mode: 0o755, mtimeMs: now() });
    }
  };
  for (const layer of layers) {
    const { dir, deletes, notes } = layerSource(ROOT, course, template, layer);
    for (const p of deletes) remove(p);
    if (!existsSync(dir)) continue;
    const walk = (rel) => {
      for (const name of readdirSync(path.join(dir, rel)).sort()) {
        if (name === ".DS_Store" || (notes && !rel && (name === "delete.txt" || name === "transcript.json"))) continue;
        const relPath = rel ? `${rel}/${name}` : name;
        const stat = lstatSync(path.join(dir, relPath));
        if (stat.isDirectory()) {
          dirs(relPath);
          files.set(relPath, { type: "dir", mode: stat.mode & 0o777, mtimeMs: now() });
          walk(relPath);
        } else if (stat.isFile()) {
          dirs(relPath);
          files.set(relPath, { type: "file", data: readFileSync(path.join(dir, relPath)), mode: stat.mode & 0o777, mtimeMs: now() });
        }
      }
    };
    walk("");
  }
  return files;
}

/** Starts a fake runner. Options: port (0 picks one), token, appPort, portRange [from, to]. */
export async function startFakeRunner({ port = 0, token = "fake-token", appPort = 3000, portRange = [24100, 24199] } = {}) {
  const workspaces = new Map();
  const tickets = new Map();
  const checks = new Map();
  let nextPort = portRange[0];

  const sendJson = (res, status, body, headers = {}) => {
    const text = body === undefined ? "" : JSON.stringify(body);
    res.writeHead(status, { "Cache-Control": "no-store", ...(text ? { "Content-Type": "application/json" } : {}), ...headers });
    res.end(text);
  };
  const error = (res, status, code, message) => sendJson(res, status, { error: code, message });

  function treeOf(ws) {
    const tree = [];
    for (const [p, f] of ws.files) {
      const orig = ws.manifest.get(p);
      const state = !orig ? "new" : f.type === "file" && orig.sha !== sha(f.data) ? "modified" : f.type === "file" && orig.mode !== f.mode ? "modified" : "same";
      tree.push({
        name: p.slice(p.lastIndexOf("/") + 1),
        path: p,
        type: f.type,
        ...(f.type === "file" ? { size: f.data.length } : {}),
        mtimeMs: f.mtimeMs,
        mode: f.mode | (f.type === "dir" ? 0o040000 : 0o100000),
        state,
      });
    }
    // Files of the starting point that are gone (folders roll up in the IDE).
    const removed = [...ws.manifest.entries()].filter(([p, m]) => m.sha !== null && !ws.files.has(p)).map(([p]) => p);
    return { tree, removed };
  }

  function emit(ws, message) {
    for (const sock of ws.events) if (sock.readyState === 1) sock.send(JSON.stringify(message));
  }
  function fsEvent(ws, events) {
    ws.seq += 1;
    ws.log.push({ seq: ws.seq, events });
    emit(ws, { t: "fs", seq: ws.seq, events });
  }
  const meta = (f) => ({ type: f.type, ...(f.type === "file" ? { size: f.data.length } : {}), mtimeMs: f.mtimeMs, mode: f.mode });

  function setStatus(ws, status) {
    ws.status = status;
    emit(ws, { t: "status", status, mem: { usedMb: status === "running" ? 96 : 0, limitMb: 1024 } });
  }
  function start(ws) {
    if (ws.status === "running") return;
    setStatus(ws, "starting");
    setStatus(ws, "running");
  }

  function writeFile(ws, p, data, mode) {
    const had = ws.files.get(p);
    const parts = p.split("/");
    const added = [];
    for (let i = 1; i < parts.length; i++) {
      const d = parts.slice(0, i).join("/");
      if (!ws.files.has(d)) {
        ws.files.set(d, { type: "dir", mode: 0o755, mtimeMs: now() });
        added.push(["addDir", d]);
      }
    }
    ws.files.set(p, { type: "file", data, mode: mode ?? had?.mode ?? 0o644, mtimeMs: now() });
    fsEvent(ws, [...added, [had ? "change" : "add", p, meta(ws.files.get(p))]]);
  }
  function removePath(ws, p) {
    const events = [];
    for (const key of [...ws.files.keys()].sort().reverse()) {
      if (key === p || key.startsWith(`${p}/`)) {
        events.push([ws.files.get(key).type === "dir" ? "unlinkDir" : "unlink", key]);
        ws.files.delete(key);
      }
    }
    if (events.length) fsEvent(ws, events);
    return events.length > 0;
  }
  function movePath(ws, from, to) {
    const moved = [...ws.files.entries()].filter(([k]) => k === from || k.startsWith(`${from}/`));
    if (!moved.length) return false;
    for (const [k] of moved) ws.files.delete(k);
    const events = moved.map(([k, f]) => [f.type === "dir" ? "unlinkDir" : "unlink", k]);
    for (const [k, f] of moved) {
      const nk = to + k.slice(from.length);
      ws.files.set(nk, { ...f, mtimeMs: now() });
      events.push([f.type === "dir" ? "addDir" : "add", nk, meta(f)]);
    }
    fsEvent(ws, events);
    return true;
  }

  // The pretend shell behind every terminal.
  function shell(ws, term, line) {
    const out = (s) => term.write(s.replace(/\n/g, "\r\n"));
    const resolve = (p) => {
      const parts = (p.startsWith("/workspace") ? p.slice("/workspace".length) : `${term.cwd}/${p}`).split("/").filter(Boolean);
      const stack = [];
      for (const s of parts) {
        if (s === ".") continue;
        if (s === "..") stack.pop();
        else stack.push(s);
      }
      return stack.join("/");
    };
    const words = line.trim().split(/\s+/).filter(Boolean);
    const [cmd, ...args] = words;
    const redirect = line.match(/^\s*echo\s+(.*?)\s*>\s*(\S+)\s*$/);
    if (redirect) {
      writeFile(ws, resolve(redirect[2]), Buffer.from(`${redirect[1].replace(/^["']|["']$/g, "")}\n`));
    } else if (!cmd) {
      // nothing
    } else if (cmd === "pwd") out(`/workspace${term.cwd ? `/${term.cwd}` : ""}\n`);
    else if (cmd === "echo") out(`${args.join(" ")}\n`);
    else if (cmd === "ls") {
      const dir = resolve(args.find((a) => !a.startsWith("-")) ?? ".");
      const kids = [...ws.files.keys()].filter((k) => (dir ? k.startsWith(`${dir}/`) : true) && !k.slice(dir ? dir.length + 1 : 0).includes("/"));
      out(`${kids.map((k) => k.slice(k.lastIndexOf("/") + 1)).sort().join("  ")}\n`);
    } else if (cmd === "cat") {
      for (const a of args) {
        const f = ws.files.get(resolve(a));
        out(f?.type === "file" ? f.data.toString("utf8") : `cat: ${a}: No such file or directory\n`);
      }
    } else if (cmd === "touch") for (const a of args) writeFile(ws, resolve(a), ws.files.get(resolve(a))?.data ?? Buffer.alloc(0));
    else if (cmd === "mkdir") {
      for (const a of args.filter((x) => !x.startsWith("-"))) {
        const p = resolve(a);
        const parts = p.split("/");
        const events = [];
        for (let i = 1; i <= parts.length; i++) {
          const d = parts.slice(0, i).join("/");
          if (!ws.files.has(d)) {
            ws.files.set(d, { type: "dir", mode: 0o755, mtimeMs: now() });
            events.push(["addDir", d, { type: "dir", mode: 0o755, mtimeMs: now() }]);
          }
        }
        if (events.length) fsEvent(ws, events);
      }
    } else if (cmd === "rm") for (const a of args.filter((x) => !x.startsWith("-"))) removePath(ws, resolve(a));
    else if (cmd === "mv" && args.length === 2) movePath(ws, resolve(args[0]), resolve(args[1]));
    else if (cmd === "cd") {
      const p = resolve(args[0] ?? "/workspace");
      if (p && ws.files.get(p)?.type !== "dir") out(`bash: cd: ${args[0]}: No such file or directory\n`);
      else term.cwd = p;
    } else if (cmd === "clear") term.write("\x1b[H\x1b[2J");
    else out(`bash: ${cmd}: command not found\n`);
    term.prompt();
  }

  function newTerminal(ws, kind = "shell", task = null) {
    const sid = `s${randomBytes(6).toString("hex")}`;
    const term = {
      sid,
      kind,
      task,
      cwd: "",
      scroll: "",
      line: "",
      sockets: new Set(),
      write(s) {
        term.scroll += s;
        if (term.scroll.length > 200_000) term.scroll = term.scroll.slice(-150_000);
        for (const sock of term.sockets) if (sock.readyState === 1) sock.send(Buffer.from(s, "utf8"));
      },
      prompt() {
        term.write(`\x1b[1;32mlearner@workspace\x1b[0m:\x1b[1;34m/workspace${term.cwd ? `/${term.cwd}` : ""}\x1b[0m$ `);
      },
      input(data) {
        if (kind !== "shell") return;
        for (const ch of data) {
          if (ch === "\r") {
            term.write("\r\n");
            const line = term.line;
            term.line = "";
            shell(ws, term, line);
          } else if (ch === "\x7f") {
            if (term.line) {
              term.line = term.line.slice(0, -1);
              term.write("\b \b");
            }
          } else if (ch === "\x03") {
            term.line = "";
            term.write("^C\r\n");
            term.prompt();
          } else if (ch >= " ") {
            term.line += ch;
            term.write(ch);
          }
        }
      },
    };
    ws.terminals.set(sid, term);
    if (kind === "shell") term.prompt();
    return term;
  }

  function startTask(ws, name) {
    const existing = ws.tasks.get(name);
    if (existing?.state === "running") return existing;
    const term = existing?.term ?? newTerminal(ws, "task", name);
    const task = { name, state: "starting", term, server: null, port: null };
    ws.tasks.set(name, task);
    start(ws);
    emit(ws, { t: "task", name, state: "starting", code: null, signal: null });
    term.write(`\x1b[2m$ ${ws.body.tasks?.[name] ?? name}\x1b[0m\r\n`);
    if (name === "dev") {
      const p = nextPort++;
      task.port = p;
      task.server = http.createServer((req, res) => {
        if (req.url?.startsWith("/api/")) {
          res.writeHead(200, { "Content-Type": "application/json", "Set-Cookie": "fake_session=1; Path=/; HttpOnly" });
          res.end(JSON.stringify({ ok: true, path: req.url, method: req.method }));
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<!doctype html><title>fake dev server</title><h1>Hello from the fake dev server</h1>");
      });
      task.server.listen(p, "127.0.0.1", () => {
        task.state = "running";
        term.write(`Listening on http://localhost:${p}\r\n`);
        ws.ports.set(p, { port: p, url: `http://localhost:${p}`, state: "listening", bind: "0.0.0.0", process: "node", framable: true });
        emit(ws, { t: "task", name, state: "running", code: null, signal: null });
        emit(ws, { t: "port", ...ws.ports.get(p) });
      });
    } else {
      task.state = "running";
      emit(ws, { t: "task", name, state: "running", code: null, signal: null });
      setTimeout(() => {
        term.write("Hello, TypeScript!\r\n");
        task.state = "exited";
        emit(ws, { t: "task", name, state: "exited", code: 0, signal: null });
      }, 50);
    }
    return task;
  }
  function stopTask(ws, name) {
    const task = ws.tasks.get(name);
    if (!task) return;
    task.server?.close();
    if (task.port) {
      ws.ports.delete(task.port);
      emit(ws, { t: "port", port: task.port, url: `http://localhost:${task.port}`, state: "closed" });
    }
    task.state = "exited";
    task.term.write("\r\n\x1b[2m[stopped]\x1b[0m\r\n");
    emit(ws, { t: "task", name, state: "exited", code: null, signal: "SIGTERM" });
  }

  function reset(ws, scope, p) {
    const original = materialize(ws.course, ws.template, ws.body.layers);
    const inScope = (k) => scope === "all" || scope === "everything" || k === p || (scope === "dir" && k.startsWith(`${p}/`));
    const events = [];
    for (const k of [...ws.files.keys()]) {
      if (inScope(k) && !original.has(k)) {
        events.push([ws.files.get(k).type === "dir" ? "unlinkDir" : "unlink", k]);
        ws.files.delete(k);
      }
    }
    for (const [k, f] of original) {
      if (!inScope(k)) continue;
      const cur = ws.files.get(k);
      if (!cur || (f.type === "file" && (cur.type !== "file" || sha(cur.data) !== sha(f.data)))) {
        events.push([cur ? "change" : f.type === "dir" ? "addDir" : "add", k, meta(f)]);
        ws.files.set(k, { ...f, mtimeMs: now() });
      }
    }
    if (events.length) fsEvent(ws, events);
  }

  async function readBody(req, limit = 6 * 1024 * 1024) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw Object.assign(new Error("too large"), { status: 413 });
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const host = (req.headers.host ?? "").toLowerCase();
      const addr = server.address();
      if (host !== `127.0.0.1:${addr.port}` && host !== `localhost:${addr.port}`) return error(res, 403, "forbidden", "Wrong Host.");
      if (req.headers.origin) return error(res, 403, "forbidden", "Browsers can't call the runner.");
      if (req.headers.authorization !== `Bearer ${token}`) return error(res, 401, "unauthorized", "No token.");
      const url = new URL(req.url, "http://x");
      const parts = url.pathname.split("/").filter(Boolean);
      if (url.pathname === "/v1/health") return sendJson(res, 200, { docker: { state: "ready" }, images: {}, recipes: {}, workspaces: { running: 0 } });
      if (url.pathname === "/v1/tickets" && req.method === "POST") {
        const body = JSON.parse((await readBody(req)).toString());
        const ticket = randomBytes(32).toString("base64url");
        tickets.set(ticket, { ...body, expiresAt: now() + 30_000 });
        return sendJson(res, 200, { ticket, expiresAt: now() + 30_000 });
      }
      if (parts[0] === "v1" && parts[1] === "checks" && parts[2]) {
        const result = checks.get(parts[2]);
        return result ? sendJson(res, 200, result) : error(res, 404, "not_found", "No such check.");
      }
      if (parts[0] !== "v1" || parts[1] !== "workspaces" || !/^w[a-z2-7]{10}$/.test(parts[2] ?? "")) return error(res, 404, "not_found", "No such route.");
      const id = parts[2];
      const sub = parts.slice(3).join("/");
      if (req.method === "PUT" && !sub) {
        const body = JSON.parse((await readBody(req)).toString());
        let ws = workspaces.get(id);
        if (!ws) {
          const [course, template] = body.template.split("/");
          const files = materialize(course, template, body.layers);
          ws = {
            id,
            body,
            course,
            template,
            files,
            manifest: new Map([...files].map(([k, f]) => [k, { sha: f.type === "file" ? sha(f.data) : null, mode: f.mode }])),
            status: "files",
            seq: 0,
            log: [],
            events: new Set(),
            terminals: new Map(),
            tasks: new Map(),
            ports: new Map(),
            snapshots: [],
          };
          workspaces.set(id, ws);
        }
        const { tree, removed } = treeOf(ws);
        return sendJson(res, 200, { id, status: ws.status, templateHash: "fake0000hash", updated: [], ports: {}, tree, removed });
      }
      const ws = workspaces.get(id);
      if (!ws) return error(res, 404, "not_found", "No such workspace. Open it first.");
      const p = url.searchParams.get("path") ?? "";
      if (req.method === "GET" && !sub) {
        return sendJson(res, 200, {
          id,
          status: ws.status,
          ports: [...ws.ports.values()],
          tasks: [...ws.tasks.values()].map((t) => ({ name: t.name, state: t.state, sid: t.term.sid })),
          terminals: [...ws.terminals.values()].filter((t) => t.kind === "shell").map((t) => ({ sid: t.sid })),
        });
      }
      if (req.method === "GET" && sub === "tree") return sendJson(res, 200, treeOf(ws));
      if (req.method === "GET" && (sub === "file" || sub === "original")) {
        const source = sub === "file" ? ws.files : materialize(ws.course, ws.template, ws.body.layers);
        const f = source.get(p);
        if (!f || f.type !== "file") return error(res, 404, "not_found", `${p} isn't a file.`);
        if (f.data.subarray(0, 8000).includes(0)) return sendJson(res, 200, { binary: true, size: f.data.length, mime: "application/octet-stream" });
        res.writeHead(200, { "Content-Type": "application/octet-stream", ETag: `"${sha(f.data)}"`, "Cache-Control": "no-store" });
        return res.end(f.data);
      }
      if (req.method === "PUT" && sub === "file") {
        const data = await readBody(req, 1024 * 1024);
        const cur = ws.files.get(p);
        const ifMatch = req.headers["if-match"];
        if (cur?.type === "dir") return error(res, 409, "is_dir", `${p} is a folder.`);
        if (ifMatch && ifMatch !== "*" && (!cur || ifMatch !== `"${sha(cur.data)}"`)) {
          return sendJson(res, 409, { error: "conflict", message: `${p} changed on disk.`, etag: cur ? `"${sha(cur.data)}"` : null });
        }
        writeFile(ws, p, data);
        return sendJson(res, 200, { etag: `"${sha(data)}"` });
      }
      if (req.method === "POST" && sub === "fs") {
        const body = JSON.parse((await readBody(req)).toString());
        if (body.op === "mkdir") {
          if (ws.files.has(body.path)) return error(res, 409, "exists", `${body.path} already exists.`);
          const parts2 = body.path.split("/");
          const events = [];
          for (let i = 1; i <= parts2.length; i++) {
            const d = parts2.slice(0, i).join("/");
            if (!ws.files.has(d)) {
              ws.files.set(d, { type: "dir", mode: 0o755, mtimeMs: now() });
              events.push(["addDir", d, { type: "dir", mode: 0o755, mtimeMs: now() }]);
            }
          }
          fsEvent(ws, events);
          return sendJson(res, 200, {});
        }
        if (body.op === "delete") return removePath(ws, body.path) ? sendJson(res, 200, { undo: `trash-${now()}` }) : error(res, 404, "not_found", "Nothing there.");
        if (body.op === "rename") {
          if (ws.files.has(body.to)) return error(res, 409, "exists", `${body.to} already exists.`);
          return movePath(ws, body.path, body.to) ? sendJson(res, 200, {}) : error(res, 404, "not_found", "Nothing there.");
        }
        if (body.op === "copy") {
          const f = ws.files.get(body.path);
          if (!f || f.type !== "file") return error(res, 404, "not_found", "Nothing there.");
          writeFile(ws, body.to, Buffer.from(f.data));
          return sendJson(res, 200, {});
        }
        if (body.op === "restore") {
          reset(ws, "file", body.path);
          return sendJson(res, 200, {});
        }
        return error(res, 400, "bad_request", "Unknown op.");
      }
      if (req.method === "POST" && sub === "reset") {
        const body = JSON.parse((await readBody(req)).toString());
        const snapshot = body.scope === "all" || body.scope === "everything" ? `auto-${now()}` : null;
        if (snapshot) ws.snapshots.push({ sid: snapshot, label: "Before reset", auto: true, createdAt: now(), files: new Map(ws.files) });
        reset(ws, body.scope, body.path);
        return sendJson(res, 200, { snapshot });
      }
      if (sub === "snapshots" && req.method === "GET") {
        return sendJson(res, 200, { snapshots: ws.snapshots.map((s) => ({ sid: s.sid, label: s.label, auto: s.auto, createdAt: s.createdAt })) });
      }
      if (sub === "snapshots" && req.method === "POST") {
        const body = JSON.parse((await readBody(req)).toString() || "{}");
        const snap = { sid: `sp-${now()}`, label: body.label ?? "Save point", auto: false, createdAt: now(), files: new Map([...ws.files].map(([k, f]) => [k, { ...f }])) };
        ws.snapshots.push(snap);
        return sendJson(res, 200, { sid: snap.sid, label: snap.label, createdAt: snap.createdAt });
      }
      const restore = /^snapshots\/([^/]+)\/restore$/.exec(sub);
      if (restore && req.method === "POST") {
        const snap = ws.snapshots.find((s) => s.sid === restore[1]);
        if (!snap) return error(res, 404, "not_found", "No such save point.");
        const events = [];
        for (const k of [...ws.files.keys()]) if (!snap.files.has(k)) events.push([ws.files.get(k).type === "dir" ? "unlinkDir" : "unlink", k]);
        for (const [k, f] of snap.files) events.push([ws.files.has(k) ? "change" : f.type === "dir" ? "addDir" : "add", k, meta(f)]);
        ws.files = new Map([...snap.files].map(([k, f]) => [k, { ...f }]));
        fsEvent(ws, events);
        return sendJson(res, 200, {});
      }
      if (req.method === "POST" && ["start", "stop", "restart"].includes(sub)) {
        if (sub === "stop") {
          for (const name of ws.tasks.keys()) stopTask(ws, name);
          setStatus(ws, "stopped");
        } else start(ws);
        return sendJson(res, 200, { status: ws.status });
      }
      if (req.method === "POST" && sub === "terminals") {
        start(ws);
        if ([...ws.terminals.values()].filter((t) => t.kind === "shell").length >= 4) return error(res, 409, "too_many_terminals", "A workspace has at most 4 terminals.");
        return sendJson(res, 200, { sid: newTerminal(ws).sid });
      }
      const termDel = /^terminals\/([A-Za-z0-9_-]+)$/.exec(sub);
      if (termDel && req.method === "DELETE") {
        const term = ws.terminals.get(termDel[1]);
        for (const s of term?.sockets ?? []) s.close(1000, "closed");
        ws.terminals.delete(termDel[1]);
        return sendJson(res, 200, {});
      }
      const taskOp = /^tasks\/([a-z][a-z0-9-]*)\/(start|stop|restart)$/.exec(sub);
      if (taskOp && req.method === "POST") {
        if (!ws.body.tasks?.[taskOp[1]]) return error(res, 404, "not_found", "No such task.");
        if (taskOp[2] !== "start") stopTask(ws, taskOp[1]);
        if (taskOp[2] !== "stop") {
          const task = startTask(ws, taskOp[1]);
          return sendJson(res, 200, { sid: task.term.sid });
        }
        return sendJson(res, 200, {});
      }
      if (req.method === "POST" && sub === "http") {
        const body = JSON.parse((await readBody(req)).toString());
        if (!ws.ports.has(body.port)) return error(res, 404, "not_listening", `Nothing is listening on port ${body.port} in this workspace yet.`);
        const started = now();
        const answer = await new Promise((resolve, reject) => {
          const r = http.request({ host: "127.0.0.1", port: body.port, method: body.method, path: body.path, headers: body.headers }, (up) => {
            const chunks = [];
            up.on("data", (c) => chunks.push(c));
            up.on("end", () => resolve({ up, data: Buffer.concat(chunks) }));
          });
          r.on("error", reject);
          if (body.body) r.write(body.body);
          r.end();
        });
        const headers = {};
        for (const [k, v] of Object.entries(answer.up.headers)) headers[k] = Array.isArray(v) ? v.join(", ") : String(v);
        return sendJson(res, 200, {
          status: answer.up.statusCode,
          statusText: answer.up.statusMessage,
          headers,
          cookies: (answer.up.headers["set-cookie"] ?? []).map((c) => ({ name: c.split("=")[0], value: c.split("=")[1]?.split(";")[0] ?? "", raw: c })),
          body: answer.data.toString("utf8"),
          size: answer.data.length,
          timingMs: now() - started,
        });
      }
      if (req.method === "POST" && sub === "check") {
        const body = JSON.parse((await readBody(req)).toString());
        const checkId = `c${randomBytes(4).toString("hex")}`;
        const tests = [
          { id: "typecheck", title: "The project type-checks", kind: "cmd", status: "pass", ms: 40 },
          { id: "tests", title: "The project's own tests pass", kind: "unit", status: "pass", ms: 80 },
        ];
        setTimeout(() => {
          for (const test of tests) emit(ws, { t: "check", checkId, phase: "tests", test });
          const result = { version: 1, checkId, target: body.target, status: "passed", durationMs: 120, tests, infra: null };
          checks.set(checkId, result);
          emit(ws, { t: "check", checkId, phase: "done", result });
        }, 60);
        return sendJson(res, 200, { checkId });
      }
      return error(res, 404, "not_found", `No route ${req.method} ${sub}.`);
    } catch (err) {
      return error(res, err.status ?? 500, "internal", err.message);
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const origin = req.headers.origin ?? "";
    if (origin !== `http://localhost:${appPort}` && origin !== `http://127.0.0.1:${appPort}`) {
      socket.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    const url = new URL(req.url, "http://x");
    const term = /^\/v1\/ws\/term\/([A-Za-z0-9_-]{6,64})$/.exec(url.pathname);
    if (url.pathname !== "/v1/ws/events" && !term) {
      socket.end("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (sock) => {
      sock.once("message", (data) => {
        let hello;
        try {
          hello = JSON.parse(data.toString());
        } catch {
          return sock.close(4400, "Expected hello");
        }
        const binding = tickets.get(hello.ticket);
        tickets.delete(hello.ticket);
        if (!binding || binding.expiresAt < now()) return sock.close(4401, "Ticket refused");
        if ((term ? "term" : "events") !== binding.kind || (term && binding.sid !== term[1])) return sock.close(4403, "Ticket refused");
        const ws = workspaces.get(binding.workspace);
        if (!ws) return sock.close(4404, "No such workspace");
        if (!term) {
          ws.events.add(sock);
          sock.on("close", () => ws.events.delete(sock));
          sock.send(JSON.stringify({ t: "ready", workspace: ws.id, seq: ws.seq }));
          sock.send(JSON.stringify({ t: "docker", state: "up" }));
          sock.send(JSON.stringify({ t: "status", status: ws.status, mem: { usedMb: ws.status === "running" ? 96 : 0, limitMb: 1024 } }));
          const since = Number(hello.since);
          if (Number.isFinite(since)) for (const entry of ws.log) if (entry.seq > since) sock.send(JSON.stringify({ t: "fs", seq: entry.seq, events: entry.events }));
          for (const p of ws.ports.values()) sock.send(JSON.stringify({ t: "port", ...p }));
          for (const t of ws.tasks.values()) sock.send(JSON.stringify({ t: "task", name: t.name, state: t.state, code: null, signal: null }));
          sock.on("message", () => {});
          return;
        }
        const t = ws.terminals.get(term[1]);
        if (!t) return sock.close(4404, "No such terminal");
        t.sockets.add(sock);
        sock.on("close", () => t.sockets.delete(sock));
        sock.send(JSON.stringify({ t: "ready", cwd: "/workspace", shell: "bash" }));
        if (t.scroll) sock.send(JSON.stringify({ t: "replay", data: t.scroll }));
        sock.on("message", (msg, isBinary) => {
          if (isBinary) return t.input(msg.toString("utf8"));
          try {
            const m = JSON.parse(msg.toString());
            if (m.t === "signal" && m.sig === "INT") t.input("\x03");
          } catch {
            /* control frames are JSON */
          }
        });
      });
    });
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    token,
    workspaces,
    async close() {
      for (const ws of workspaces.values()) for (const t of ws.tasks.values()) t.server?.close();
      for (const client of wss.clients) client.terminate();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
