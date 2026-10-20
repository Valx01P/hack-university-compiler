// HTTP tests: the whole app (router, controllers, services, in-memory repositories) on a free
// port, called with fetch the way a client would. Response bodies are checked with OrderJson,
// the same schema the view promises, so a change in the response's shape fails here.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import * as z from "zod";
import { OrderJson } from "#http/views/order-view.ts";
import { send, startApp, type TestServer } from "../helpers/http.ts";

const OrderPage = z.object({ items: z.array(OrderJson), nextCursor: z.string().nullable() });
const Problem = z.object({ type: z.string(), title: z.string(), status: z.number(), detail: z.string() }).loose();

let server: TestServer;
before(async () => {
  server = await startApp();
});
after(async () => {
  await server.close();
});

describe("reading orders", () => {
  test("GET /orders/:id returns one order", async () => {
    const res = await send(server.baseUrl, "GET", "/orders/ord_0003");
    assert.equal(res.status, 200);
    const order = OrderJson.parse(res.json);
    assert.equal(order.status, "shipped");
    assert.equal(order.total, "37.00");
    assert.equal(order.carrier, "usps");
  });

  test("GET /orders?status=paid lists the paid orders newest first", async () => {
    const res = await send(server.baseUrl, "GET", "/orders?status=paid");
    assert.deepEqual(
      OrderPage.parse(res.json).items.map((order) => order.id),
      ["ord_0009", "ord_0008", "ord_0006"],
    );
  });

  test("a bad status in the query string is a 400 problem", async () => {
    const res = await send(server.baseUrl, "GET", "/orders?status=lost");
    assert.equal(res.status, 400);
    assert.match(res.type ?? "", /^application\/problem\+json/);
    assert.equal(Problem.parse(res.json).status, 400);
  });

  test("an unknown order is a 404 problem", async () => {
    const res = await send(server.baseUrl, "GET", "/orders/ord_9999");
    assert.equal(res.status, 404);
    assert.equal(Problem.parse(res.json).detail, "No order with id ord_9999");
  });

  test("GET /customers/:customerId/orders lists one customer's orders", async () => {
    const res = await send(server.baseUrl, "GET", "/customers/cus_01/orders");
    assert.deepEqual(
      z.object({ items: z.array(OrderJson) }).parse(res.json).items.map((order) => order.id),
      ["ord_0010", "ord_0007", "ord_0003", "ord_0001"],
    );
    assert.equal((await send(server.baseUrl, "GET", "/customers/cus_99/orders")).status, 404);
  });
});

describe("changing orders", () => {
  test("POST /orders creates a pending order with the catalog's prices", async () => {
    const res = await send(server.baseUrl, "POST", "/orders", { customerId: "cus_04", lines: [{ sku: "COF-ETH-250", quantity: 2 }] });
    assert.equal(res.status, 201);
    const order = OrderJson.parse(res.json);
    assert.equal(res.headers.get("location"), `/orders/${order.id}`);
    assert.equal(order.status, "pending");
    assert.equal(order.total, "29.00");
    assert.equal(order.createdAt, "2026-10-01T09:00:00.000Z");
  });

  test("a price in the body is refused, because the server owns prices", async () => {
    const res = await send(server.baseUrl, "POST", "/orders", { customerId: "cus_04", lines: [{ sku: "COF-ETH-250", quantity: 1, unitPriceCents: 1 }] });
    assert.equal(res.status, 422);
  });

  // TODO (lesson 40, part 2): tests for POST /orders/:id/ship: 200 for a paid order (with its
  // tracking number in the body), 409 for a pending order, and 422 without a carrier.

  test("a line of more than 10 is refused by the limitQuantity hook", async () => {
    const res = await send(server.baseUrl, "POST", "/orders", { customerId: "cus_02", lines: [{ sku: "COF-COL-250", quantity: 12 }] });
    assert.equal(res.status, 422);
    assert.match(JSON.stringify(res.json), /lines\[0\]\.quantity/);
  });
});

describe("the router", () => {
  test("a known path with the wrong method is 405 with Allow", async () => {
    const res = await fetch(`${server.baseUrl}/orders/ord_0001`, { method: "DELETE" });
    await res.body?.cancel();
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "GET");
  });

  test("a body that is not JSON is a 400 problem", async () => {
    const res = await fetch(`${server.baseUrl}/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: "{nope" });
    assert.equal(res.status, 400);
    assert.equal(Problem.parse(await res.json()).detail, "The body is not valid JSON");
  });
});
