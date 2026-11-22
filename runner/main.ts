import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Tickets, createToken } from "./auth.ts";
import { loadConfig } from "./config.ts";
import { DockerWatch, resolveEndpoint, type Owner } from "./docker.ts";
import { loadTmuxConfig } from "./host-tmux.ts";
import { createApiServer } from "./http.ts";
import { Images } from "./images.ts";
import { JobPool } from "./jobs.ts";
import { Log } from "./log.ts";
import { reap, reconcile, removeOwnJobs } from "./reaper.ts";
import { Workspaces } from "./workspaces.ts";
import { attachWebSockets } from "./ws.ts";

/**
 * hu-runner: the one local service that talks to Docker (architecture §2.6).
 * It listens on 127.0.0.1:3100 for the Next.js server (REST, bearer token) and
 * the browser (WebSockets, single-use tickets), runs TypeScript and Bash in
 * hardened, throwaway containers, and keeps the compiler's folders and the
 * playground on this computer, with their terminals.
 *
 *   npm run runner          # on its own, for verifiers and debugging
 *   npm run up              # supervised, beside the app
 *
 * It starts with Docker off: /v1/health says so, runs answer "Start Docker
 * to run this", and everything recovers when Docker comes up. The folders
 * and their terminals never need Docker.
 */

const config = loadConfig();
const log = new Log(config.dataDir);
const version = JSON.parse(readFileSync(path.join(import.meta.dirname, "package.json"), "utf8")).version as string;

// The token: from npm run up (fresh every run), else the one on disk, else a new one.
const tokenFile = path.join(config.dataDir, "runner-token");
let token = process.env.HU_RUNNER_TOKEN?.trim() ?? "";
if (!token && existsSync(tokenFile)) token = readFileSync(tokenFile, "utf8").trim();
if (!token) {
  token = createToken();
  writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
}

const owner: Owner = { ns: config.ns, boot: randomBytes(6).toString("hex"), port: config.port };
const endpoint = resolveEndpoint();
const watch = new DockerWatch(endpoint);
const images = new Images(config.root, watch.docker, endpoint.dockerHost);
const pool = new JobPool(config.jobSlots);
const tickets = new Tickets(config.ticketTtlMs);
const workspaces = new Workspaces({ config, owner, log });

/** Whenever Docker is (back) up: clear leftovers, and look the images up. */
async function onDockerReady() {
  try {
    await reconcile(watch.docker, owner, log);
    await images.refresh();
    await workspaces.reconcile(watch.docker);
  } catch (err) {
    log.warn("docker.ready_failed", { error: (err as Error).message });
  }
}

// Requests wait for the first look at Docker, so the first /v1/health already
// knows whether it's up and which images exist. A socket needs a ticket from
// POST /v1/tickets first, so it waits too.
let started!: () => void;
const ready = new Promise<void>((resolve) => (started = resolve));
const startedAt = Date.now();
const server = createApiServer({ config, token, tickets, watch, images, pool, owner, log, startedAt, version, ready, workspaces });
attachWebSockets(server, {
  port: config.port,
  appPort: config.appPort,
  helloTimeoutMs: config.helloTimeoutMs,
  tickets,
  log,
  workspaces,
  termGraceMs: config.termGraceMs,
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`hu-runner: port ${config.port} is already in use. Is another runner up? Stop it, or set HU_RUNNER_PORT.`);
  } else {
    console.error(`hu-runner: ${err.message}`);
  }
  process.exit(1);
});

// The port first. A second runner started on a port that's taken (npm run
// runner beside npm run up) exits above, before it touches Docker, so it
// never reconciles away the jobs of the runner that holds the port.
await new Promise<void>((resolve) => server.listen(config.port, "127.0.0.1", resolve));
// tmux's server from before, given this runner's tmux.conf before any
// terminal attaches (they wait for ready).
const tmuxConfig = loadTmuxConfig();

// Docker, once at startup. From then on, Docker coming back reconciles.
await watch.check();
if (watch.state === "ready") await onDockerReady();
watch.onChange((state) => {
  log.info("docker.state", { state });
  if (state === "ready") void onDockerReady();
});
watch.start(config.pollMs);

// The reaper, and old trash in the folders.
const reaper = setInterval(async () => {
  workspaces.sweep();
  if (watch.state !== "ready") return;
  try {
    await reap(watch.docker, owner, log);
  } catch (err) {
    log.warn("reaper.failed", { error: (err as Error).message });
  }
}, config.pollMs);
reaper.unref();

await tmuxConfig;
started();
log.info("runner.listening", { port: config.port, ns: config.ns, boot: owner.boot, docker: watch.state, endpoint: endpoint.source });
console.log(`hu-runner listening on http://127.0.0.1:${config.port} (Docker ${watch.state === "ready" ? "is ready" : `is ${watch.state}`})`);

// Ctrl+C: stop taking requests, let go of the shells (tmux keeps them),
// remove this runner's containers, and go.
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info("runner.stopping", { signal });
  server.close();
  server.closeAllConnections();
  watch.stop();
  clearInterval(reaper);
  await Promise.race([workspaces.shutdown(), new Promise((r) => setTimeout(r, 8_000))]).catch(() => {});
  if (watch.state === "ready") await removeOwnJobs(watch.docker, owner, log).catch(() => {});
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
// On Windows a signal can't ask for this (it's TerminateProcess), so npm run
// up's supervisor asks over the IPC channel instead (scripts/lib/servers.mjs).
process.on("message", (message) => {
  if (message === "shutdown") void shutdown("shutdown");
});
