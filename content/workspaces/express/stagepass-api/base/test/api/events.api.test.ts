// The events API through HTTP: lists and cursors, the draft lifecycle, posters, and who may
// do what, with the whole app running on in-memory fakes.
import { readFileSync, rmSync } from "node:fs";
import request, { type Response } from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import type { AuthUser } from "../../src/http/auth.ts";
import { makeTestApp } from "../support/fakes.ts";
import { as, bearer } from "../support/tokens.ts";

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

function testApp() {
  const setup = makeTestApp();
  created.push(setup.uploadDir);
  return setup;
}

const PUBLISHED_IN_START_ORDER = [4, 17, 18, 2, 1, 5, 15, 3, 7, 20, 8, 9, 10, 11, 16, 19];

async function walk(app: ReturnType<typeof testApp>["app"], query: string): Promise<number[]> {
  const ids: number[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    const response: Response = await request(app)
      .get(`/v1/events?${query}${cursor === null ? "" : `&cursor=${cursor}`}`)
      .expect(200);
    ids.push(...response.body.data.map((event: { id: number }) => event.id));
    cursor = response.body.nextCursor;
    if (cursor === null) return ids;
  }
  throw new Error("more than 20 pages");
}

describe("GET /v1/events", () => {
  it("walks every published event exactly once, ties included, in start order", async () => {
    const { app } = testApp();
    expect(await walk(app, "limit=3")).toEqual(PUBLISHED_IN_START_ORDER);
  });

  it("walks the same events backwards with sort=-startsAt", async () => {
    const { app } = testApp();
    expect(await walk(app, "limit=4&sort=-startsAt")).toEqual([...PUBLISHED_IN_START_ORDER].reverse());
  });

  it("filters by repeated categories and a city in any case", async () => {
    const { app } = testApp();
    const response = await request(app).get("/v1/events?category=music&category=theater&city=AUSTIN").expect(200);
    expect(response.body.data.map((event: { id: number }) => event.id)).toEqual([4, 1, 5, 15, 7, 10, 16]);
  });

  it("answers 400 for a tampered cursor and for a limit over 50", async () => {
    const { app } = testApp();
    const tampered = await request(app).get("/v1/events?cursor=eyJpZCI6LTF9").expect(400);
    expect(tampered.body.errors).toEqual([{ field: "cursor", message: "Not a cursor this API made" }]);
    await request(app).get("/v1/events?limit=51").expect(400);
  });

  it("shows each event's cheapest ticket", async () => {
    const { app } = testApp();
    const response = await request(app).get("/v1/events?limit=1").expect(200);
    expect(response.body.data[0]).toMatchObject({ id: 4, fromPriceCents: 1800, venue: { city: "Austin" } });
  });
});

describe("the draft lifecycle", () => {
  it("creates a draft with a slug from its title, and the next one with the same title gets -2", async () => {
    const { app } = testApp();
    const body = { venueId: 3, title: " Open Mic Night ", category: "comedy", startsAt: "2026-12-10T02:00:00Z", endsAt: "2026-12-10T04:00:00Z" };
    const first = await request(app).post("/v1/events").set("Authorization", await bearer(as.olu)).send(body).expect(201);
    expect(first.headers.location).toBe(`/v1/events/${first.body.id}`);
    expect(first.body).toMatchObject({ title: "Open Mic Night", slug: "open-mic-night", status: "draft", organizerId: 2 });

    const second = await request(app).post("/v1/events").set("Authorization", await bearer(as.olu)).send(body).expect(201);
    expect(second.body.slug).toBe("open-mic-night-2");
  });

  it("refuses to publish without ticket types, publishes with one, and audits who did it", async () => {
    const { app, fakes } = testApp();
    const olu = await bearer(as.olu);
    const draft = await request(app)
      .post("/v1/events")
      .set("Authorization", olu)
      .send({ venueId: 1, title: "Late Set", category: "music", startsAt: "2026-12-01T03:00:00Z", endsAt: "2026-12-01T05:00:00Z" })
      .expect(201);
    const id = draft.body.id as number;

    const early = await request(app).post(`/v1/events/${id}/publish`).set("Authorization", olu).expect(409);
    expect(early.body.type).toBe("https://stagepass.test/problems/no-ticket-types");

    await request(app).post(`/v1/events/${id}/ticket-types`).set("Authorization", olu).send({ name: "General", priceCents: 1500, capacity: 100 }).expect(201);
    const published = await request(app).post(`/v1/events/${id}/publish`).set("Authorization", olu).expect(200);
    expect(published.body).toMatchObject({ status: "published", publishedAt: "2026-10-01T09:00:00.000Z" });
    expect(fakes.store.audit).toEqual([expect.objectContaining({ action: "event.published", entityId: id, actorId: 2 })]);
  });

  it("keeps a published event's slug when it is renamed", async () => {
    const { app } = testApp();
    const response = await request(app).patch("/v1/events/1").set("Authorization", await bearer(as.olu)).send({ title: "The Blue Note Jam, Vol. 2" }).expect(200);
    expect(response.body).toMatchObject({ title: "The Blue Note Jam, Vol. 2", slug: "the-blue-note-jam" });
  });

  it("cancels an event with its paid orders, and tells each buyer", async () => {
    const { app, fakes } = testApp();
    await request(app).post("/v1/events/16/cancel").set("Authorization", await bearer(as.priya)).expect(200);
    expect(fakes.store.orders.find((order) => order.id === 20)?.status).toBe("cancelled");
    expect(fakes.store.notifications).toEqual([expect.objectContaining({ userId: 5, kind: "event.cancelled" })]);
    expect(fakes.store.ticketTypes.filter((t) => t.eventId === 16).map((t) => t.sold)).toEqual([0, 0]);
  });

  it("deletes drafts only", async () => {
    const { app } = testApp();
    await request(app).delete("/v1/events/1").set("Authorization", await bearer(as.olu)).expect(409);
    await request(app).delete("/v1/events/14").set("Authorization", await bearer(as.olu)).expect(204);
    await request(app).get("/v1/events/14").set("Authorization", await bearer(as.olu)).expect(404);
  });
});

// Authorization bugs hide in combinations, so they are tested as a table:
// who, doing what, to which event, and the status they must get.
describe("who may do what", () => {
  type Who = keyof typeof as | "anonymous";
  const user = (who: Who): AuthUser | null => (who === "anonymous" ? null : as[who]);
  // Resolve the token first: a supertest request is a thenable, and awaiting it sends it.
  const authHeader = async (who: Who): Promise<Record<string, string>> => {
    const caller = user(who);
    return caller === null ? {} : { Authorization: await bearer(caller) };
  };

  it.each<[Who, number]>([
    ["anonymous", 401],
    ["cam", 403],
    ["priya", 403],
    ["olu", 200],
    ["admin", 200],
  ])("PATCH Olu's published event as %s: %i", async (who, status) => {
    const { app } = testApp();
    await request(app).patch("/v1/events/1").set(await authHeader(who)).send({ description: "Doors at 7." }).expect(status);
  });

  it.each<[Who, number]>([
    ["anonymous", 404],
    ["cam", 404],
    ["priya", 404],
    ["olu", 200],
    ["admin", 200],
  ])("GET a draft's ticket types as %s: %i", async (who, status) => {
    const { app } = testApp();
    await request(app).get("/v1/events/12/ticket-types").set(await authHeader(who)).expect(status);
  });

  it.each<[Who, number]>([
    ["anonymous", 401],
    ["cam", 403],
    ["priya", 403],
    ["olu", 201],
    ["admin", 201],
  ])("POST a ticket type to Olu's event as %s: %i", async (who, status) => {
    const { app } = testApp();
    await request(app).post("/v1/events/7/ticket-types").set(await authHeader(who)).send({ name: "Balcony", priceCents: 1000, capacity: 5 }).expect(status);
  });

  it.each<[Who, number]>([
    ["anonymous", 404],
    ["cam", 404],
    ["priya", 404],
    ["olu", 200],
    ["admin", 200],
  ])("GET Olu's draft as %s: %i", async (who, status) => {
    const { app } = testApp();
    await request(app).get("/v1/events/6").set(await authHeader(who)).expect(status);
  });
});

describe("posters", () => {
  const png = readFileSync(new URL("../fixtures/poster.png", import.meta.url));

  it("stores a PNG under a new name, serves it with nosniff, and replaces the old one", async () => {
    const { app } = testApp();
    const olu = await bearer(as.olu);
    const first = await request(app).put("/v1/events/1/poster").set("Authorization", olu).attach("poster", png, { filename: "../../src/server.ts", contentType: "image/png" }).expect(200);
    expect(first.body.posterUrl).toMatch(/^\/uploads\/posters\/[0-9a-f-]{36}\.png$/);

    const served = await request(app).get(first.body.posterUrl).expect(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(served.headers["x-content-type-options"]).toBe("nosniff");

    const second = await request(app).put("/v1/events/1/poster").set("Authorization", olu).attach("poster", png, { filename: "poster.png", contentType: "image/png" }).expect(200);
    expect(second.body.posterUrl).not.toBe(first.body.posterUrl);
    await request(app).get(first.body.posterUrl).expect(404);
  });

  it("refuses HTML that claims to be a PNG", async () => {
    const { app } = testApp();
    await request(app)
      .put("/v1/events/1/poster")
      .set("Authorization", await bearer(as.olu))
      .attach("poster", Buffer.from("<html><script>alert(1)</script></html>"), { filename: "cute.png", contentType: "image/png" })
      .expect(415);
  });

  it("refuses files over 2 MB", async () => {
    const { app } = testApp();
    const big = Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]);
    await request(app).put("/v1/events/1/poster").set("Authorization", await bearer(as.olu)).attach("poster", big, { filename: "big.png", contentType: "image/png" }).expect(413);
  });

  it("refuses another organizer", async () => {
    const { app } = testApp();
    await request(app).put("/v1/events/1/poster").set("Authorization", await bearer(as.priya)).attach("poster", png, { filename: "poster.png", contentType: "image/png" }).expect(403);
  });
});

describe("the calendar file", () => {
  it("answers 304 to a client that already has this version", async () => {
    const { app } = testApp();
    const first = await request(app).get("/v1/events/1/calendar.ics").expect(200);
    expect(first.headers["content-type"]).toMatch(/^text\/calendar/);
    expect(first.text).toContain("SUMMARY:The Blue Note Jam\r\n");
    await request(app).get("/v1/events/1/calendar.ics").set("If-None-Match", first.headers.etag ?? "").expect(304);
  });
});
