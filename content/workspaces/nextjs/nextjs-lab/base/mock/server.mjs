// Trailhead's mock services on one port: an inventory system, a reviews service,
// shipping estimates, recommendations, help content, deals, the team, and an image CDN.
// Every route answers after a fixed latency, so loading states and streaming look the
// same on every run. Routes under /__ let checks and learners inject failures, change
// latencies, read the request log, and reset everything.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export const DEFAULT_PORT = 4000;

const dataFile = new URL("./data.json", import.meta.url);

const cdnFolders = {
  products: new URL("../public/images/products/", import.meta.url),
  banners: new URL("../public/images/categories/", import.meta.url),
  brands: new URL("./brands/", import.meta.url),
};

const contentTypes = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const json = (status, body) => ({ status, body });
const notFound = (error) => json(404, { error });
const methodNotAllowed = {
  ...json(405, { error: "The mock services only answer GET and HEAD requests" }),
  headers: { allow: "GET, HEAD" },
};

// Own properties only, so a slug such as "constructor" never matches Object.prototype.
const lookup = (record, key) => (Object.hasOwn(record, key) ? record[key] : undefined);

async function serveFile(folder, file) {
  try {
    const bytes = await readFile(new URL(file, cdnFolders[folder]));
    return {
      status: 200,
      bytes,
      headers: {
        "content-type": contentTypes[extname(file)],
        "cache-control": "public, max-age=31536000, immutable",
      },
    };
  } catch (error) {
    if (error.code === "ENOENT") return notFound(`No such file: /cdn/${folder}/${file}`);
    throw error;
  }
}

export const routes = [
  {
    path: "/inventory/:slug",
    latencyMs: 600,
    match: /^\/inventory\/([^/]+)$/,
    respond: ({ inventory }, slug) => {
      const item = lookup(inventory, slug);
      return item ? json(200, { slug, ...item }) : notFound(`Unknown product: ${slug}`);
    },
  },
  {
    path: "/reviews/:slug/summary",
    latencyMs: 900,
    match: /^\/reviews\/([^/]+)\/summary$/,
    respond: ({ reviews }, slug) => {
      const entry = lookup(reviews, slug);
      return entry ? json(200, entry.summary) : notFound(`No reviews for ${slug}`);
    },
  },
  {
    path: "/reviews/:slug",
    latencyMs: 900,
    match: /^\/reviews\/([^/]+)$/,
    respond: ({ reviews }, slug) => {
      const entry = lookup(reviews, slug);
      if (!entry) return notFound(`No reviews for ${slug}`);
      return json(200, entry.recent.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)));
    },
  },
  {
    path: "/shipping/:slug",
    latencyMs: 300,
    match: /^\/shipping\/([^/]+)$/,
    respond: ({ shipping }, slug) => {
      const days = lookup(shipping, slug);
      return days === undefined ? notFound(`Unknown product: ${slug}`) : json(200, { days });
    },
  },
  {
    path: "/recommendations/:slug",
    latencyMs: 700,
    match: /^\/recommendations\/([^/]+)$/,
    respond: ({ recommendations }, slug) => {
      const related = lookup(recommendations, slug);
      return related ? json(200, { slug, related }) : notFound(`Unknown product: ${slug}`);
    },
  },
  { path: "/faq", latencyMs: 400, match: /^\/faq$/, respond: ({ faq }) => json(200, faq) },
  { path: "/deals", latencyMs: 500, match: /^\/deals$/, respond: ({ deals }) => json(200, deals) },
  { path: "/team", latencyMs: 300, match: /^\/team$/, respond: ({ team }) => json(200, team) },
  {
    path: "/cdn/:folder/:file",
    latencyMs: 0,
    match: /^\/cdn\/(products|banners|brands)\/([a-z0-9-]+\.(?:jpg|png|svg|webp))$/,
    respond: (_data, folder, file) => serveFile(folder, file),
  },
];

export async function loadData() {
  return JSON.parse(await readFile(dataFile, "utf8"));
}

function freshState(data) {
  return { data, latency: new Map(), failures: new Map(), log: [], epoch: performance.now() };
}

// Rules are keyed by an exact path, a prefix ending in "*", or "*" for every path.
// The exact path wins, then the longest prefix.
function findRule(rules, path) {
  if (rules.has(path)) return path;
  let best = null;
  for (const pattern of rules.keys()) {
    const fits = pattern.endsWith("*") && path.startsWith(pattern.slice(0, -1));
    if (fits && (best === null || pattern.length > best.length)) best = pattern;
  }
  return best;
}

function takeFailure(state, path) {
  const rule = findRule(state.failures, path);
  if (rule === null) return null;
  const failure = state.failures.get(rule);
  failure.remaining -= 1;
  if (failure.remaining === 0) state.failures.delete(rule);
  return failure.status;
}

function readInteger(params, name, { fallback, min, max }) {
  const raw = params.get(name);
  if (raw === null || raw === "") {
    if (fallback === undefined) throw new RangeError(`${name} is required`);
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

function readPattern(params, { required }) {
  const path = params.get("path") ?? "";
  if (path === "" || path === "*") {
    if (required) throw new RangeError("path is required, for example path=/faq or path=/inventory/*");
    return "*";
  }
  if (!path.startsWith("/")) throw new RangeError("path must start with /");
  return path;
}

function describe(state) {
  return {
    service: "Trailhead mock services",
    routes: routes.map(({ path, latencyMs }) => ({ method: "GET", path, latencyMs })),
    controls: [
      "POST /__fail?path=/faq&times=1&status=500",
      "POST /__latency?path=/faq&ms=2000",
      "GET /__log",
      "POST /__reset",
    ],
    overrides: {
      latency: Object.fromEntries(state.latency),
      failures: Object.fromEntries(state.failures),
    },
  };
}

async function control(request, url, state) {
  const params = url.searchParams;
  switch (`${request.method} ${url.pathname}`) {
    case "POST /__fail": {
      const path = readPattern(params, { required: true });
      const times = readInteger(params, "times", { fallback: 1, min: 1, max: 1000 });
      const status = readInteger(params, "status", { fallback: 500, min: 400, max: 599 });
      state.failures.set(path, { remaining: times, status });
      return json(200, { path, times, status });
    }
    case "POST /__latency": {
      const path = readPattern(params, { required: false });
      const ms = readInteger(params, "ms", { min: 0, max: 60000 });
      state.latency.set(path, ms);
      return json(200, { path, ms });
    }
    case "GET /__log":
      return {
        status: 200,
        bytes: Buffer.from(state.log.map((entry) => `${JSON.stringify(entry)}\n`).join("")),
        headers: { "content-type": "application/x-ndjson; charset=utf-8" },
      };
    case "POST /__reset":
      Object.assign(state, freshState(await loadData()));
      return json(200, { reset: true });
    default:
      if (["/__fail", "/__latency", "/__log", "/__reset"].includes(url.pathname)) {
        return json(405, { error: `${request.method} is not supported on ${url.pathname}` });
      }
      return notFound(`Unknown control route: ${url.pathname}`);
  }
}

async function serve(url, state) {
  const path = url.pathname;
  const route = routes.find((candidate) => candidate.match.test(path));
  const rule = findRule(state.latency, path);
  const latencyMs = rule === null ? (route?.latencyMs ?? 0) : state.latency.get(rule);
  if (latencyMs > 0) await sleep(latencyMs);

  const failedWith = takeFailure(state, path);
  if (failedWith !== null) return { ...json(failedWith, { error: `Injected failure for ${path}` }), latencyMs };
  if (!route) return { ...notFound(`No route for ${path}`), latencyMs };

  const params = route.match.exec(path).slice(1).map(decodeURIComponent);
  return { ...(await route.respond(state.data, ...params)), latencyMs };
}

function send(request, response, result) {
  const bytes = result.bytes ?? Buffer.from(`${JSON.stringify(result.body, null, 2)}\n`);
  response.writeHead(result.status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...result.headers,
    "content-length": bytes.length,
  });
  response.end(request.method === "HEAD" ? undefined : bytes);
}

export async function createMockServer({ log = console.log } = {}) {
  const state = freshState(await loadData());
  const elapsed = () => Math.round((performance.now() - state.epoch) * 10) / 10;

  async function handle(request, response) {
    const url = new URL(request.url ?? "/", "http://mock.local");
    const start = elapsed();
    let result;
    try {
      if (url.pathname.startsWith("/__")) result = await control(request, url, state);
      else if (request.method !== "GET" && request.method !== "HEAD") result = methodNotAllowed;
      else if (url.pathname === "/") result = json(200, describe(state));
      else result = await serve(url, state);
    } catch (error) {
      if (error instanceof RangeError) result = json(400, { error: error.message });
      else if (error instanceof URIError) result = json(400, { error: "Malformed path" });
      else throw error;
    }
    send(request, response, result);

    const isService = url.pathname !== "/" && !url.pathname.startsWith("/__");
    if (isService) {
      state.log.push({ method: request.method, path: url.pathname, status: result.status, start, end: elapsed() });
    }
    const timing = result.latencyMs === undefined ? "" : ` (${result.latencyMs} ms)`;
    log(`${request.method} ${url.pathname}${url.search} -> ${result.status}${timing}`);
  }

  return createServer((request, response) => {
    handle(request, response).catch((error) => {
      log(`Mock service error: ${error.stack ?? error}`);
      if (!response.headersSent) send(request, response, json(500, { error: "Mock service error" }));
      else response.destroy();
    });
  });
}

if (import.meta.main) {
  const port = Number(process.env.MOCK_PORT ?? DEFAULT_PORT);
  const server = await createMockServer();
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use. Is the mock already running? (npm run mock)`);
      process.exit(1);
    }
    throw error;
  });
  server.listen(port, () => {
    console.log(`Mock services ready on http://localhost:${port} (GET / lists every route)`);
  });
  const stop = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
