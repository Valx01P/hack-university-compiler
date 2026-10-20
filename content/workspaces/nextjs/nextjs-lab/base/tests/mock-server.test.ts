import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { createMockServer } from "../mock/server.mjs";

type LogEntry = { method: string; path: string; status: number; start: number; end: number };

let server: Server;
let base = "";

const get = (path: string) => fetch(`${base}${path}`);
const post = (path: string) => fetch(`${base}${path}`, { method: "POST" });
const getJson = async <T>(path: string) => (await (await get(path)).json()) as T;

async function readLog(): Promise<LogEntry[]> {
  const text = await (await get("/__log")).text();
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as LogEntry);
}

before(async () => {
  server = await createMockServer({ log: () => {} });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

// Each test starts from data.json with every latency at 0, so the suite stays fast.
beforeEach(async () => {
  await post("/__reset");
  await post("/__latency?ms=0");
});

test("the index lists every route with its documented latency", async () => {
  const index = await getJson<{ routes: { path: string; latencyMs: number }[] }>("/");
  assert.deepEqual(
    index.routes.map((route) => `${route.path} ${route.latencyMs}`),
    [
      "/inventory/:slug 600",
      "/reviews/:slug/summary 900",
      "/reviews/:slug 900",
      "/shipping/:slug 300",
      "/recommendations/:slug 700",
      "/faq 400",
      "/deals 500",
      "/team 300",
      "/cdn/:folder/:file 0",
    ],
  );
});

test("inventory answers with stock and warehouse, and 404 for unknown slugs", async () => {
  assert.deepEqual(await getJson("/inventory/ridge-2p-tent"), {
    slug: "ridge-2p-tent",
    stock: 14,
    warehouse: "Portland",
  });
  assert.equal((await get("/inventory/no-such-product")).status, 404);
  assert.equal((await get("/inventory/constructor")).status, 404);
});

test("reviews have a summary and a newest-first list", async () => {
  assert.deepEqual(await getJson("/reviews/ridge-2p-tent/summary"), { average: 4.6, count: 27 });
  const reviews = await getJson<{ createdAt: string }[]>("/reviews/ridge-2p-tent");
  const dates = reviews.map((review) => review.createdAt);
  assert.equal(dates.length, 4);
  assert.deepEqual(dates, dates.toSorted().toReversed());
});

test("a product nobody has reviewed is a 404 on both review routes", async () => {
  assert.equal((await get("/reviews/camp-kettle-1l")).status, 404);
  assert.equal((await get("/reviews/camp-kettle-1l/summary")).status, 404);
});

test("shipping, recommendations, help, deals, and team", async () => {
  assert.deepEqual(await getJson("/shipping/ridge-2p-tent"), { days: 3 });
  assert.deepEqual(await getJson("/shipping/titan-pot-set"), { days: 5 });
  assert.deepEqual(await getJson("/recommendations/ridge-2p-tent"), {
    slug: "ridge-2p-tent",
    related: ["alpine-1p-tent", "trail-pack-45", "ember-stove"],
  });
  assert.equal((await getJson<unknown[]>("/faq")).length, 5);
  assert.equal((await getJson<unknown[]>("/deals")).length, 3);
  assert.equal((await getJson<unknown[]>("/team")).length, 3);
});

test("the CDN serves product photos, banners, and brand logos", async () => {
  const photo = await get("/cdn/products/ridge-2p-tent.webp");
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get("content-type"), "image/webp");
  assert.ok((await photo.arrayBuffer()).byteLength > 1000);
  assert.equal((await get("/cdn/banners/tents.webp")).headers.get("content-type"), "image/webp");
  assert.equal((await get("/cdn/brands/cairn-works.png")).headers.get("content-type"), "image/png");
  assert.equal((await get("/cdn/brands/no-such-brand.png")).status, 404);
  assert.equal((await get("/cdn/private/x.png")).status, 404);
});

test("__fail makes the next N calls to a path fail with the given status", async () => {
  const armed = await (await post("/__fail?path=/inventory/ember-stove&times=2&status=503")).json();
  assert.deepEqual(armed, { path: "/inventory/ember-stove", times: 2, status: 503 });
  assert.equal((await get("/inventory/ember-stove")).status, 503);
  assert.equal((await get("/inventory/ember-stove")).status, 503);
  assert.equal((await get("/inventory/ember-stove")).status, 200);
});

test("__fail defaults to one 500, and a trailing * matches every path under a prefix", async () => {
  await post("/__fail?path=/faq");
  assert.equal((await get("/faq")).status, 500);
  assert.equal((await get("/faq")).status, 200);
  await post("/__fail?path=/inventory/*");
  assert.equal((await get("/inventory/titan-pot-set")).status, 500);
  assert.equal((await get("/inventory/titan-pot-set")).status, 200);
});

test("control routes reject bad input and the wrong method", async () => {
  assert.equal((await post("/__fail")).status, 400);
  assert.equal((await post("/__fail?path=/faq&status=200")).status, 400);
  assert.equal((await post("/__latency?path=/faq&ms=soon")).status, 400);
  assert.equal((await get("/__fail?path=/faq")).status, 405);
  assert.equal((await post("/faq")).status, 405);
});

test("__log records service calls only", async () => {
  await get("/");
  await get("/team");
  await post("/__latency?path=/team&ms=0");
  const log = await readLog();
  assert.deepEqual(
    log.map(({ method, path, status }) => ({ method, path, status })),
    [{ method: "GET", path: "/team", status: 200 }],
  );
});

test("__log shows that parallel calls overlap and sequential calls do not", async () => {
  await post("/__latency?path=/faq&ms=150");
  await post("/__latency?path=/deals&ms=150");
  await Promise.all([get("/faq"), get("/deals")]);
  const [a, b] = await readLog();
  assert.ok(a.start < b.end && b.start < a.end, "the two calls were in flight at the same time");

  await post("/__reset");
  await post("/__latency?ms=0");
  await post("/__latency?path=/faq&ms=50");
  await post("/__latency?path=/deals&ms=50");
  await get("/faq");
  await get("/deals");
  const [first, second] = await readLog();
  assert.equal(first.path, "/faq");
  assert.ok(second.start >= first.end, "the second call started after the first ended");
});

test("__reset clears latencies, failures, and the log", async () => {
  await post("/__fail?path=/cdn/products/ridge-2p-tent.webp&times=5");
  await get("/cdn/products/ridge-2p-tent.webp");
  await post("/__reset");
  const index = await getJson<{ overrides: { latency: object; failures: object } }>("/");
  assert.deepEqual(index.overrides, { latency: {}, failures: {} });
  assert.deepEqual(await readLog(), []);
  assert.equal((await get("/cdn/products/ridge-2p-tent.webp")).status, 200);
});
