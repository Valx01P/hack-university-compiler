// Buying, listing, and cancelling orders through HTTP, including who may see which order.
import request, { type Response } from "supertest";
import { describe, expect, it } from "vitest";
import { makeTestApp } from "../support/fakes.ts";
import { as, bearer } from "../support/tokens.ts";

const CAMS_ORDERS_NEWEST_FIRST = [29, 27, 25, 23, 21, 19, 17, 15, 13, 11, 9, 7, 6, 4, 2, 1];

describe("POST /v1/orders", () => {
  it("creates a paid order and answers 201 with its Location", async () => {
    const { app, fakes } = makeTestApp();
    const response = await request(app)
      .post("/v1/orders")
      .set("Authorization", await bearer(as.cam))
      .set("Idempotency-Key", "api-test-0001")
      .send({ items: [{ ticketTypeId: 22, quantity: 2 }, { ticketTypeId: 21, quantity: 1 }] })
      .expect(201);
    expect(response.headers.location).toBe(`/v1/orders/${response.body.id}`);
    expect(response.body).toMatchObject({ status: "paid", totalCents: 2 * 3000 + 6500, event: { id: 7 } });
    expect(fakes.store.ticketTypes.find((t) => t.id === 21)?.sold).toBe(2);
    expect(fakes.store.audit).toEqual([expect.objectContaining({ action: "order.paid", entityId: response.body.id, actorId: 4 })]);
  });

  it("returns the same order for a retried key, marked Idempotent-Replayed", async () => {
    const { app } = makeTestApp();
    const cam = await bearer(as.cam);
    const send = () =>
      request(app)
        .post("/v1/orders")
        .set("Authorization", cam)
        .set("Idempotency-Key", "api-test-0002")
        .send({ items: [{ ticketTypeId: 22, quantity: 1 }] });
    const first = await send().expect(201);
    const retry = await send().expect(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
  });

  it.each([
    ["no key", undefined],
    ["a key that is too short", "short"],
    ["a key with spaces", "has spaces in it"],
  ])("answers 400 for %s", async (_case, key) => {
    const { app } = makeTestApp();
    let test = request(app).post("/v1/orders").set("Authorization", await bearer(as.cam));
    if (key !== undefined) test = test.set("Idempotency-Key", key);
    const response = await test.send({ items: [{ ticketTypeId: 22, quantity: 1 }] }).expect(400);
    expect(response.body.errors[0].field).toBe("Idempotency-Key");
  });

  it("answers 409 sold-out for the last seat taken, and lets only customers buy", async () => {
    const { app } = makeTestApp();
    const [cam, olu] = await Promise.all([bearer(as.cam), bearer(as.olu)]);
    const buy = (authorization: string, key: string) =>
      request(app).post("/v1/orders").set("Authorization", authorization).set("Idempotency-Key", key).send({ items: [{ ticketTypeId: 21, quantity: 1 }] });
    await buy(cam, "api-test-0003").expect(201);
    const soldOut = await buy(cam, "api-test-0004").expect(409);
    expect(soldOut.body).toMatchObject({ type: "https://stagepass.test/problems/sold-out", ticketTypeId: 21 });
    await buy(olu, "api-test-0005").expect(403);
  });
});

describe("GET /v1/orders", () => {
  it("walks the customer's own orders newest first, each exactly once", async () => {
    const { app } = makeTestApp();
    const cam = await bearer(as.cam);
    const ids: number[] = [];
    let cursor: string | null = null;
    do {
      const response: Response = await request(app)
        .get(`/v1/orders?limit=4${cursor === null ? "" : `&cursor=${cursor}`}`)
        .set("Authorization", cam)
        .expect(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      ids.push(...response.body.data.map((order: { id: number }) => order.id));
      cursor = response.body.nextCursor;
    } while (cursor !== null);
    expect(ids).toEqual(CAMS_ORDERS_NEWEST_FIRST);
  });

  it("answers 400 for a tampered cursor and a limit over 50", async () => {
    const { app } = makeTestApp();
    const cam = await bearer(as.cam);
    await request(app).get("/v1/orders?cursor=AAAA").set("Authorization", cam).expect(400);
    await request(app).get("/v1/orders?limit=51").set("Authorization", cam).expect(400);
  });
});

describe("GET /v1/orders/:orderId", () => {
  it.each<[keyof typeof as, number]>([
    ["cam", 200],
    ["dee", 404],
    ["olu", 404],
    ["admin", 200],
  ])("Cam's order 4 as %s: %i", async (who, status) => {
    const { app } = makeTestApp();
    await request(app).get("/v1/orders/4").set("Authorization", await bearer(as[who])).expect(status);
  });

  it("answers 400 for an id that is not a number", async () => {
    const { app } = makeTestApp();
    await request(app).get("/v1/orders/abc").set("Authorization", await bearer(as.cam)).expect(400);
  });
});

describe("POST /v1/orders/:orderId/cancel", () => {
  it("cancels a paid order, gives the seats back, and refuses a second cancel", async () => {
    const { app, fakes } = makeTestApp();
    const cam = await bearer(as.cam);
    const response = await request(app).post("/v1/orders/29/cancel").set("Authorization", cam).expect(200);
    expect(response.body).toMatchObject({ status: "cancelled", cancelledAt: "2026-10-01T09:00:00.000Z" });
    expect(fakes.store.ticketTypes.find((t) => t.id === 36)?.sold).toBe(0);
    expect(fakes.store.audit.map((entry) => entry.action)).toEqual(["order.cancelled"]);

    const again = await request(app).post("/v1/orders/29/cancel").set("Authorization", cam).expect(409);
    expect(again.body.type).toBe("https://stagepass.test/problems/order-cancelled");
  });

  it("refuses orders for events that already started, and hides other customers' orders", async () => {
    const { app } = makeTestApp();
    await request(app).post("/v1/orders/1/cancel").set("Authorization", await bearer(as.cam)).expect(409);
    await request(app).post("/v1/orders/29/cancel").set("Authorization", await bearer(as.dee)).expect(404);
  });
});
