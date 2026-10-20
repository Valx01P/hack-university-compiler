// HTTP tests for the product routes and the daily report, on SQLite in memory this time, so
// the SQL behind them runs too.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as z from "zod";
import { ProductJson } from "#http/views/product-view.ts";
import { send, startApp, type TestServer } from "../helpers/http.ts";

let server: TestServer;
before(async () => {
  server = await startApp("sqlite");
});
after(async () => {
  await server.close();
});

test("GET /products lists the catalog", async () => {
  const res = await send(server.baseUrl, "GET", "/products");
  const { items } = z.object({ items: z.array(ProductJson) }).parse(res.json);
  assert.equal(items.length, 8);
  assert.deepEqual(items.find((product) => product.sku === "GEA-GRD-01"), { sku: "GEA-GRD-01", name: "Burr Grinder", price: "129.00", stock: 3, inStock: true });
});

test("GET /products/:sku/availability says whether it can be ordered", async () => {
  assert.deepEqual((await send(server.baseUrl, "GET", "/products/COF-ETH-250/availability")).json, { sku: "COF-ETH-250", inStock: true, stock: 40 });
  assert.deepEqual((await send(server.baseUrl, "GET", "/products/GEA-FLT-100/availability")).json, { sku: "GEA-FLT-100", inStock: false, stock: 0 });
  assert.equal((await send(server.baseUrl, "GET", "/products/NOP-NOP-00/availability")).status, 404);
});

test("GET /reports/daily totals one day's orders by status", async () => {
  const res = await send(server.baseUrl, "GET", "/reports/daily?date=2026-09-30");
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, {
    date: "2026-09-30",
    orders: 4,
    byStatus: {
      pending: { orders: 3, total: "97.00" },
      paid: { orders: 1, total: "38.50" },
      shipped: { orders: 0, total: "0.00" },
      delivered: { orders: 0, total: "0.00" },
      cancelled: { orders: 0, total: "0.00" },
    },
    revenue: "38.50",
  });
  assert.equal((await send(server.baseUrl, "GET", "/reports/daily?date=yesterday")).status, 400);
});
