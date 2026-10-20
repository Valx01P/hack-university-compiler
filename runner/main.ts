import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Tickets, appOrigins, createToken } from "./auth.ts";
import { Capacity } from "./capacity.ts";
import { Checks } from "./checks/run.ts";
import { loadConfig } from "./config.ts";
import { Databases } from "./db/index.ts";
import { DockerWatch, resolveEndpoint, type Owner } from "./docker.ts";
import { createApiServer, type Services } from "./http.ts";
import { Images } from "./images.ts";
import { JobPool } from "./jobs.ts";
import { Log } from "./log.ts";
import { PortLeases } from "./ports.ts";
import { reap, reconcile, removeOwnJobs } from "./reaper.ts";
import { Workspaces } from "./workspaces.ts";
import { attachWebSockets } from "./ws.ts";

/**
 * hu-runner: the one local service that talks to Docker (architecture §2.6).
 * It listens on 127.0.0.1:3100 for the Next.js server (REST, bearer token) and
 * the browser (WebSockets, single-use tickets), and runs learner code in
 * hardened, throwaway containers.
 *
 *   npm run runner          # on its own, for verifiers and debugging
 *   npm run up              # supervised, beside the app
 *
 * It starts with Docker off: /v1/health says so, runs answer "Start Docker
 * to run this", and everything recovers when Docker comes up.
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
const databases = new Databases({ docker: watch.docker, owner, dataDir: config.dataDir, log });

const services: Services = { piston: false, postgres: "absent", mongo: "absent" };
const leases = new PortLeases(config.wsPorts, { dataDir: config.dataDir });
const capacity: Capacity = new Capacity(
  () => ({
    memTotal: watch.facts?.memTotal ?? null,
    piston: services.piston,
    postgres: services.postgres === "running",
    mongo: services.mongo === "running",
    checkSlot: workspaces.checkSlot(),
  }),
  config.memBudgetMb
);
const workspaces: Workspaces = new Workspaces({ config, watch, images, owner, log, leases, capacity, appOrigins: appOrigins(config.appPort) });
const checks = new Checks({ docker: watch.docker, owner, images, pool, log, capacity, contentDir: config.contentDir });

/** Whenever Docker is (back) up: clear leftovers, and look the images and shared services up. */
async function onDockerReady() {
  try {
    await reconcile(watch.docker, owner, log);
    await images.refresh();
    await refreshServices();
    await workspaces.reconcile();
  } catch (err) {
    log.warn("docker.ready_failed", { error: (err as Error).message });
  }
}

async function refreshServices() {
  const all = await watch.docker.listContainers({ all: true, filters: { name: ["hu-piston"] } });
  const state = (name: string) => {
    const c = all.find((x) => x.Names.includes(`/${name}`));
    return c ? (c.State === "running" ? "running" : "stopped") : "absent";
  };
  services.piston = state("hu-piston") === "running";
  // The database servers under this namespace's names (a verify runner has its
  // own), and their upkeep: idle stops, the size watch, parking.
  await databases.refresh();
  services.postgres = databases.state("postgres");
  services.mongo = databases.state("mongo");
  await databases.tick();
}

// Requests wait for the first look at Docker, so the first /v1/health already
// knows whether it's up and which images exist. A socket needs a ticket from
// POST /v1/tickets first, so it waits too.
let started!: () => void;
const ready = new Promise<void>((resolve) => (started = resolve));
const startedAt = Date.now();
const server = createApiServer({ config, token, tickets, watch, images, pool, owner, log, services, databases, startedAt, version, ready, workspaces, checks });
attachWebSockets(server, {
  port: config.port,
  appPort: config.appPort,
  helloTimeoutMs: config.helloTimeoutMs,
  tickets,
  watch,
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

// Docker, once at startup. From then on, Docker coming back reconciles.
await watch.check();
if (watch.state === "ready") await onDockerReady();
watch.onChange((state) => {
  log.info("docker.state", { state });
  if (state === "ready") void onDockerReady();
  else if (state === "down") workspaces.dockerDown();
});
watch.start(config.pollMs);

// The reaper, and what the health check reports about shared services.
const reaper = setInterval(async () => {
  if (watch.state !== "ready") return;
  try {
    await reap(watch.docker, owner, log);
    await refreshServices();
    await workspaces.sweep();
  } catch (err) {
    log.warn("reaper.failed", { error: (err as Error).message });
  }
}, config.pollMs);
reaper.unref();

started();
log.info("runner.listening", { port: config.port, ns: config.ns, boot: owner.boot, docker: watch.state, endpoint: endpoint.source });
console.log(`hu-runner listening on http://127.0.0.1:${config.port} (Docker ${watch.state === "ready" ? "is ready" : `is ${watch.state}`})`);

// Ctrl+C: stop taking requests, remove this runner's containers, and go.
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info("runner.stopping", { signal });
  server.close();
  server.closeAllConnections();
  watch.stop();
  clearInterval(reaper);
  if (watch.state === "ready") {
    // Running workspaces stop (tasks get TERM, then KILL): at most a few seconds.
    await Promise.race([workspaces.shutdown(), new Promise((r) => setTimeout(r, 8_000))]).catch(() => {});
    await removeOwnJobs(watch.docker, owner, log).catch(() => {});
    await databases.shutdown().catch(() => {});
  }
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
