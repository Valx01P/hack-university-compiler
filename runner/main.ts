import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Tickets, createToken } from "./auth.ts";
import { loadConfig } from "./config.ts";
import { DockerWatch, resolveEndpoint, type Owner } from "./docker.ts";
import { createApiServer, type Services } from "./http.ts";
import { Images } from "./images.ts";
import { JobPool } from "./jobs.ts";
import { Log } from "./log.ts";
import { reap, reconcile, removeOwnJobs } from "./reaper.ts";
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
const services: Services = { piston: false, postgres: "absent", mongo: "absent" };

/** Whenever Docker is (back) up: clear leftovers and look the images up. */
async function onDockerReady() {
  try {
    await reconcile(watch.docker, owner, log);
    await images.refresh();
  } catch (err) {
    log.warn("docker.ready_failed", { error: (err as Error).message });
  }
}

async function refreshServices() {
  const all = await watch.docker.listContainers({ all: true, filters: { name: ["hu-piston", "hu-postgres", "hu-mongo"] } });
  const state = (name: string) => {
    const c = all.find((x) => x.Names.includes(`/${name}`));
    return c ? (c.State === "running" ? "running" : "stopped") : "absent";
  };
  services.piston = state("hu-piston") === "running";
  services.postgres = state("hu-postgres");
  services.mongo = state("hu-mongo");
}

watch.onChange((state) => {
  log.info("docker.state", { state });
  if (state === "ready") void onDockerReady();
});

const startedAt = Date.now();
const server = createApiServer({ config, token, tickets, watch, images, pool, owner, log, services, startedAt, version });
attachWebSockets(server, { port: config.port, appPort: config.appPort, helloTimeoutMs: config.helloTimeoutMs, tickets, watch, log });

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`hu-runner: port ${config.port} is already in use. Is another runner up? Stop it, or set HU_RUNNER_PORT.`);
  } else {
    console.error(`hu-runner: ${err.message}`);
  }
  process.exit(1);
});

await watch.check();
if (watch.state === "ready") await onDockerReady();
watch.start(config.pollMs);

// The reaper, and what the health check reports about shared services.
const reaper = setInterval(async () => {
  if (watch.state !== "ready") return;
  try {
    await reap(watch.docker, owner, log);
    await refreshServices();
  } catch (err) {
    log.warn("reaper.failed", { error: (err as Error).message });
  }
}, config.pollMs);
reaper.unref();
if (watch.state === "ready") await refreshServices().catch(() => {});

server.listen(config.port, "127.0.0.1", () => {
  log.info("runner.listening", { port: config.port, ns: config.ns, boot: owner.boot, docker: watch.state, endpoint: endpoint.source });
  console.log(`hu-runner listening on http://127.0.0.1:${config.port} (Docker ${watch.state === "ready" ? "is ready" : `is ${watch.state}`})`);
});

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
  if (watch.state === "ready") await removeOwnJobs(watch.docker, owner, log).catch(() => {});
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
