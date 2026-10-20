// The playground's API: a small Express 5 app with a list of items to practice fetching, forms,
// and mutations against (/v1/items), and /v1/echo, which answers with the request it received.
// Like every API in the course, it serves /v1 with GET /healthz outside it, answers errors as RFC
// 9457 problems, logs each request ("GET /v1/items 200 3ms"), and accepts the teaching headers:
// X-HU-Delay: <ms> answers late, X-HU-Fail: <status> answers with that error (or ?_delay=, ?_fail=).
import express, { type NextFunction, type Request, type Response } from "express";
import { now, readStore, resetStore, writeStore, type Item } from "./store.ts";

const PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "0.0.0.0";

class Problem extends Error {
  readonly status: number;
  readonly errors: Record<string, string> | undefined;

  constructor(status: number, detail: string, errors?: Record<string, string>) {
    super(detail);
    this.status = status;
    this.errors = errors;
  }
}

const TITLES: Record<number, string> = { 400: "Bad Request", 404: "Not Found", 422: "Unprocessable Content", 500: "Internal Server Error" };

function sendProblem(res: Response, problem: Problem): void {
  const body = { type: "about:blank", title: TITLES[problem.status] ?? "Error", status: problem.status, detail: problem.message, ...(problem.errors && { errors: problem.errors }) };
  res.status(problem.status).type("application/problem+json").send(JSON.stringify(body));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------- request log and teaching controls

interface LogEntry {
  seq: number;
  method: string;
  path: string;
  status: number;
  ms: number;
}
const log: LogEntry[] = [];
let seq = 0;

function requestLog(req: Request, res: Response, next: NextFunction): void {
  const started = performance.now();
  res.on("finish", () => {
    const entry = { seq: ++seq, method: req.method, path: req.originalUrl, status: res.statusCode, ms: Math.round(performance.now() - started) };
    log.push(entry);
    if (log.length > 500) log.shift();
    if (req.path !== "/healthz") console.log(`${entry.method} ${entry.path} ${entry.status} ${entry.ms}ms`);
  });
  next();
}

async function chaos(req: Request, res: Response, next: NextFunction): Promise<void> {
  const query = new URL(req.originalUrl, "http://localhost").searchParams;
  const delay = Number(req.get("X-HU-Delay") ?? query.get("_delay") ?? 0);
  const failWith = Number(req.get("X-HU-Fail") ?? query.get("_fail") ?? 0);
  if (Number.isFinite(delay) && delay > 0) await sleep(Math.min(delay, 30_000));
  if (Number.isInteger(failWith) && failWith >= 400 && failWith <= 599) return sendProblem(res, new Problem(failWith, `failed on purpose (X-HU-Fail: ${failWith})`));
  next();
}

// ---------------------------------------------------------------- items

function parseId(raw: unknown): number {
  if (typeof raw === "string" && /^[1-9]\d{0,15}$/.test(raw)) return Number(raw);
  throw new Problem(400, "the id must be a positive whole number", { id: "must be a positive whole number" });
}

/** The body's title and done, checked: a title of 1 to 120 characters, and done true or false. */
function readItemInput(body: unknown, { partial }: { partial: boolean }): Partial<Pick<Item, "title" | "done">> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw new Problem(400, "the body must be a JSON object");
  const { title, done, ...unknown } = body as Record<string, unknown>;
  const errors: Record<string, string> = {};
  for (const key of Object.keys(unknown)) errors[key] = "is not a known field";
  if (title === undefined && !partial) errors.title = "is required";
  if (title !== undefined && (typeof title !== "string" || title.trim().length < 1 || title.trim().length > 120)) errors.title = "must be 1 to 120 characters";
  if (done !== undefined && typeof done !== "boolean") errors.done = "must be true or false";
  if (Object.keys(errors).length > 0) throw new Problem(422, "the item is not valid", errors);
  return { ...(typeof title === "string" && { title: title.trim() }), ...(typeof done === "boolean" && { done }) };
}

const items = express.Router();

items.get("/items", (req, res) => {
  const query = new URL(req.originalUrl, "http://localhost").searchParams;
  const q = query.get("q")?.toLowerCase();
  const done = query.get("done");
  let rows = readStore().items;
  if (q) rows = rows.filter((item) => item.title.toLowerCase().includes(q));
  if (done === "true" || done === "false") rows = rows.filter((item) => String(item.done) === done);
  res.json(rows);
});

items.post("/items", (req, res) => {
  const input = readItemInput(req.body, { partial: false });
  const store = readStore();
  const stamp = now();
  const item: Item = { id: store.next_id, title: input.title!, done: input.done ?? false, created_at: stamp, updated_at: stamp };
  store.items.push(item);
  store.next_id += 1;
  writeStore(store);
  res.status(201).location(`/v1/items/${item.id}`).json(item);
});

items.get("/items/:id", (req, res) => {
  const id = parseId(req.params.id);
  const item = readStore().items.find((row) => row.id === id);
  if (!item) throw new Problem(404, `item ${id} not found`);
  res.json(item);
});

items.patch("/items/:id", (req, res) => {
  const id = parseId(req.params.id);
  const input = readItemInput(req.body, { partial: true });
  const store = readStore();
  const item = store.items.find((row) => row.id === id);
  if (!item) throw new Problem(404, `item ${id} not found`);
  Object.assign(item, input, { updated_at: now() });
  writeStore(store);
  res.json(item);
});

items.delete("/items/:id", (req, res) => {
  const id = parseId(req.params.id);
  const store = readStore();
  if (!store.items.some((row) => row.id === id)) throw new Problem(404, `item ${id} not found`);
  store.items = store.items.filter((row) => row.id !== id);
  writeStore(store);
  res.status(204).end();
});

/** Answers with what arrived, to see exactly what a fetch call sent. */
items.all("/echo", (req, res) => {
  res.json({
    method: req.method,
    path: req.path,
    query: Object.fromEntries(new URL(req.originalUrl, "http://localhost").searchParams),
    headers: { "content-type": req.get("Content-Type") ?? null, accept: req.get("Accept") ?? null, cookie: req.get("Cookie") ?? null },
    body: req.body ?? null,
  });
});

// ---------------------------------------------------------------- the app

const app = express();
app.disable("x-powered-by");
app.use(requestLog);
app.use(express.json({ limit: "100kb" }));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// Hooks for Hack University's checks, outside /v1.
app.get("/_hu/log", (_req, res) => {
  res.json({ items: log });
});
app.post("/_hu/reset", (_req, res) => {
  resetStore();
  log.length = 0;
  res.status(204).end();
});
app.get("/_hu/state", (_req, res) => {
  res.json(readStore());
});

app.use("/v1", chaos, items);

app.use((req, _res, next) => {
  next(new Problem(404, `no route for ${req.method} ${req.path}`));
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof Problem) return sendProblem(res, error);
  if ((error as { type?: string }).type === "entity.parse.failed") return sendProblem(res, new Problem(400, "the body is not valid JSON"));
  console.error(error);
  sendProblem(res, new Problem(500, "something went wrong in the API"));
});

app.listen(PORT, HOST, (error?: Error) => {
  if (error) throw error;
  console.log(`Playground API on http://localhost:${PORT} (data in api/data/db.json)`);
});
