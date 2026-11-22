import http from "node:http";
import { bearerMatches, hostAllowed, type Tickets } from "./auth.ts";
import { addCourse } from "./components.ts";
import type { Config } from "./config.ts";
import type { DockerWatch, Owner } from "./docker.ts";
import { HttpError, parse, readJson, send, sendError } from "./http-util.ts";
import { IMAGES, isImageName, type ImageName, type Images } from "./images.ts";
import { JobError, type JobPool } from "./jobs.ts";
import type { Log } from "./log.ts";
import { belowFloor } from "./profiles.ts";
import { reap, reconcile } from "./reaper.ts";
import { recipeImage, runRecipe } from "./recipes/index.ts";
import { RunRequest, TicketRequest } from "./schemas.ts";
import { workspaceRoute } from "./workspace-routes.ts";
import type { Workspaces } from "./workspaces.ts";

/**
 * The runner's REST API, for the Next.js server only (architecture §3.2).
 * Every request needs `Authorization: Bearer <token>` and the runner's own
 * Host, and a request that carries an Origin header (a browser) is refused,
 * as is every CORS preflight. runner/README.md documents each route.
 */

export interface ApiDeps {
  config: Config;
  token: string;
  tickets: Tickets;
  watch: DockerWatch;
  images: Images;
  pool: JobPool;
  owner: Owner;
  log: Log;
  startedAt: number;
  version: string;
  /** Resolves once the runner has first looked at Docker. Requests wait for it. */
  ready?: Promise<void>;
  /** The folders on this computer. Without them, their routes answer 501. */
  workspaces?: Workspaces;
}

const JSON_LIMIT = 64 * 1024;
const RUN_LIMIT = 8 * 1024 * 1024;
/** Runs waiting beyond the job slots. A verifier raises HU_JOB_SLOTS instead. */
const MAX_QUEUED = 64;

/** GET /v1/health: Docker, the images, and the jobs. */
export function health(deps: ApiDeps) {
  const facts = deps.watch.facts;
  const images: Record<string, string> = {};
  const recipes: Record<string, { image: string; state: string; versions: Record<string, string> }> = {};
  for (const name of Object.keys(IMAGES) as ImageName[]) {
    images[`hu/${name}`] = deps.images.state(name);
    for (const recipe of IMAGES[name].recipes) {
      recipes[recipe] = { image: deps.images.tag(name), state: deps.images.state(name), versions: deps.images.versionsOf(name) };
    }
  }
  return {
    docker: {
      state: deps.watch.state,
      serverVersion: facts?.serverVersion ?? null,
      apiVersion: facts?.apiVersion ?? null,
      arch: facts?.arch ?? null,
      memTotal: facts?.memTotal ?? null,
      ncpu: facts?.ncpu ?? null,
      belowFloor: facts ? belowFloor(facts.memTotal) : null,
    },
    images,
    recipes,
    jobs: { ...deps.pool.stats, slots: deps.pool.slots },
    runner: { version: deps.version, ns: deps.owner.ns, boot: deps.owner.boot, port: deps.owner.port, uptimeMs: Date.now() - deps.startedAt },
  };
}

/** Docker isn't up: say so the way the app shows it, "Start Docker to run this". */
async function needDocker(deps: ApiDeps) {
  // Docker may have started since the last poll: look again before saying no.
  if (deps.watch.state !== "ready") await deps.watch.check();
  if (deps.watch.state === "ready" || (deps.watch.state === "waking" && (await deps.watch.ready(30_000)))) return;
  throw new HttpError(
    503,
    "docker_unavailable",
    deps.watch.state === "waking" ? "Docker is still waking up. Try again in a moment." : "Start Docker to run this."
  );
}

// The workspace routes, on a runner that has none (its front door's tests).
const NO_WORKSPACES = /^\/v1\/workspaces(\/|$)/;

async function route(deps: ApiDeps, req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const method = req.method ?? "GET";
  const path = url.pathname;

  if (path === "/v1/health") {
    if (method !== "GET") throw new HttpError(405, "method_not_allowed", "Use GET.");
    return send(res, 200, health(deps));
  }

  if (path === "/v1/run") {
    if (method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    const body = parse(RunRequest, await readJson(req, RUN_LIMIT));
    await needDocker(deps);
    if (deps.pool.stats.queued >= MAX_QUEUED) throw new HttpError(503, "busy", "The sandbox is busy. Try again in a moment.");
    const image = recipeImage(body.recipe);
    if (deps.images.state(image) !== "ready") await deps.images.refresh();
    if (deps.images.state(image) !== "ready") throw imageMissing(body.recipe, deps.images.state(image));
    const aborted = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) aborted.abort();
    });
    try {
      const recipeDeps = { docker: deps.watch.docker, owner: deps.owner, images: deps.images, pool: deps.pool, log: deps.log };
      return send(res, 200, await runRecipe(recipeDeps, body, aborted.signal));
    } catch (err) {
      if (err instanceof JobError) {
        if (err.code === "image_missing") throw imageMissing(body.recipe, "missing");
        if (err.code === "docker_unavailable") throw new HttpError(503, err.code, "Docker stopped. Start Docker to run this.");
        if (err.code === "cancelled") throw new HttpError(499, err.code, err.message);
        throw new HttpError(500, err.code, err.message);
      }
      throw err;
    }
  }

  if (path === "/v1/tickets") {
    if (method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    const body = parse(TicketRequest, await readJson(req, JSON_LIMIT));
    if (deps.workspaces) {
      const ws = deps.workspaces.get(body.workspace);
      if (!ws) throw new HttpError(404, "not_found", "No such workspace. Open it first.");
      if (body.kind === "term" && !ws.session(body.sid!)) throw new HttpError(404, "not_found", "No such terminal.");
    }
    return send(res, 200, deps.tickets.issue(body));
  }

  if (path.startsWith("/v1/admin/")) {
    // Scripts only: Next never forwards these.
    if (req.headers["x-hu-admin"] !== "1") throw new HttpError(403, "forbidden", "Admin routes need X-HU-Admin: 1.");
    await needDocker(deps);
    if (path === "/v1/admin/reconcile" && method === "POST") {
      return send(res, 200, await reconcile(deps.watch.docker, deps.owner, deps.log));
    }
    if (path === "/v1/admin/gc" && method === "POST") {
      const reaped = await reap(deps.watch.docker, deps.owner, deps.log);
      const pruned: string[] = [];
      for (const name of Object.keys(IMAGES) as ImageName[]) pruned.push(...(await deps.images.prune(name)));
      return send(res, 200, { removed: reaped.removed, prunedImages: pruned });
    }
    if (path === "/v1/admin/images" && method === "GET") {
      await deps.images.refresh();
      return send(res, 200, Object.fromEntries((Object.keys(IMAGES) as ImageName[]).map((n) => [n, { tag: deps.images.tag(n), state: deps.images.state(n) }])));
    }
    if (path === "/v1/admin/images" && method === "POST") {
      const body = (await readJson(req, JSON_LIMIT)) as { names?: unknown };
      const names = Array.isArray(body?.names) ? body.names : Object.keys(IMAGES);
      for (const name of names) if (typeof name !== "string" || !isImageName(name)) throw new HttpError(400, "bad_request", `No image named ${String(name)}.`);
      for (const name of names as ImageName[]) {
        deps.images.build(name).catch((err: Error) => deps.log.error("image.build_failed", { image: name, error: err.message }));
      }
      return send(res, 202, { building: names });
    }
    throw new HttpError(404, "not_found", "No such admin route.");
  }

  if (deps.workspaces && (await workspaceRoute(deps.workspaces, req, res, url))) return;
  if (NO_WORKSPACES.test(path)) throw new HttpError(501, "not_implemented", "This runner has no workspaces.");
  throw new HttpError(404, "not_found", "No such route.");
}

/** The run's course (its recipe) isn't installed, or its image is building. */
function imageMissing(course: string, state: string): HttpError {
  return new HttpError(
    503,
    "image_missing",
    state === "building"
      ? `The ${course} sandbox is being built. Try again in a minute.`
      : `The ${course} sandbox isn't installed yet. In a terminal, run ${addCourse(course)}, then try again.`
  );
}

export function createApiServer(deps: ApiDeps): http.Server {
  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    try {
      // DNS rebinding: a page on evil.example resolved to 127.0.0.1 sends its own Host.
      if (!hostAllowed(req.headers.host, deps.config.port)) throw new HttpError(403, "forbidden", "Wrong Host.");
      // Only servers call the runner. A browser always sends Origin on these requests.
      if (req.headers.origin !== undefined) throw new HttpError(403, "forbidden", "Browsers can't call the runner's API.");
      if (req.method === "OPTIONS") throw new HttpError(403, "forbidden", "No CORS here.");
      if (!bearerMatches(req.headers.authorization, deps.token)) throw new HttpError(401, "unauthorized", "Missing or wrong runner token.");
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      await deps.ready;
      await route(deps, req, res, url);
    } catch (err) {
      if (res.headersSent) {
        res.destroy();
      } else if (err instanceof HttpError) {
        sendError(res, err);
      } else {
        deps.log.error("http.error", { url: req.url, error: (err as Error).message });
        sendError(res, new HttpError(500, "internal", "The runner hit an unexpected error."));
      }
    } finally {
      if (req.url !== "/v1/health") deps.log.info("http", { method: req.method, url: req.url?.split("?")[0], status: res.statusCode, ms: Date.now() - started });
    }
  });
  server.keepAliveTimeout = 5_000;
  return server;
}
