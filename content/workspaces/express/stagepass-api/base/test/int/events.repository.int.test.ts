// The events repository's SQL on real PostgreSQL: full text search with stemming, keyset
// pagination across ties, and the organizer's sales in one grouped query.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eventsRepository, type EventListQuery } from "../../src/modules/events/events.repository.ts";
import { ticketTypesRepository } from "../../src/modules/ticket-types/ticket-types.repository.ts";
import { openTestDb, resetTestDb } from "../support/test-db.ts";

const database = openTestDb();
const { db } = database;
afterAll(() => database.pool.end());
beforeEach(() => resetTestDb(database));

const published = (query: Partial<EventListQuery> = {}) =>
  eventsRepository.list(db, { statuses: ["published"], sort: "startsAt", limit: 50, ...query });
const ids = (rows: Array<{ id: number }>) => rows.map((row) => row.id);

describe("full text search", () => {
  it.each([
    ["jazz", [1, 5, 3]],
    ["jazz -brunch", [1, 3]],
    ['"late night"', [3]],
    // Stemming: "nights" finds "Night" in titles and "night" in a description.
    ["nights", [2, 3, 20, 11]],
    ["opera", []],
  ])("q=%s finds %j", async (q, expected) => {
    expect(ids(await published({ q }))).toEqual(expected);
  });

  it("combines with the other filters", async () => {
    expect(ids(await published({ q: "jazz", city: "austin" }))).toEqual([1, 5]);
  });

  it("can use the GIN index events_search_idx", async () => {
    const plan = await db.transaction(async (tx) => {
      // 24 rows is too few for the planner to want the index, so take the alternative away.
      await tx.execute("SET LOCAL enable_seqscan = off");
      return tx.execute(
        "EXPLAIN (FORMAT JSON) SELECT id FROM events WHERE search @@ websearch_to_tsquery('english', 'jazz')",
      );
    });
    expect(JSON.stringify(plan.rows)).toContain("events_search_idx");
  });
});

describe("keyset pagination", () => {
  it("visits every published event once, in (starts_at, id) order, across the four tied starts", async () => {
    const seen: number[] = [];
    let after: EventListQuery["after"];
    for (;;) {
      const rows = await published({ limit: 3, after });
      if (rows.length === 0) break;
      seen.push(...ids(rows));
      const last = rows[rows.length - 1];
      if (last === undefined) break;
      after = { key: last.startsAt.toISOString(), id: last.id };
    }
    expect(seen).toEqual([4, 17, 18, 2, 1, 5, 15, 3, 7, 20, 8, 9, 10, 11, 16, 19]);
  });

  it("sorts by title, with id after the title", async () => {
    const firstTwo = await published({ sort: "title", limit: 2 });
    expect(firstTwo.map((event) => event.title)).toEqual(["A Doll's House", "Blues on the River"]);
    const next = await published({ sort: "title", limit: 1, after: { key: "Blues on the River", id: 9 } });
    expect(next.map((event) => event.title)).toEqual(["Comedy Cellar Showcase"]);
  });
});

describe("sales and prices", () => {
  it("adds up paid orders per event in one query, with 0 for events without sales", async () => {
    const sales = await eventsRepository.listForOrganizerWithSales(db, 2);
    const byId = new Map(sales.map((event) => [event.id, event]));
    expect(byId.get(1)).toMatchObject({ ticketsSold: 15, revenueCents: 92_500 });
    // Event 13 was cancelled with its orders, and event 6 is a draft: nothing paid for either.
    expect(byId.get(13)).toMatchObject({ ticketsSold: 0, revenueCents: 0 });
    expect(byId.get(6)).toMatchObject({ ticketsSold: 0, revenueCents: 0 });
    expect(ids(sales)).toEqual([4, 2, 1, 5, 3, 13, 6, 7, 8, 9, 10, 11, 12, 14]);
  });

  it("finds the cheapest ticket of many events at once", async () => {
    expect(await ticketTypesRepository.lowestPrices(db, [1, 6, 7])).toEqual(
      new Map([
        [1, 2500],
        [7, 2000],
      ]),
    );
  });

  it("reserves a seat only while one is left", async () => {
    const reserved = await db.transaction((tx) => ticketTypesRepository.reserve(tx, 21, 1));
    expect(reserved?.sold).toBe(2);
    expect(await db.transaction((tx) => ticketTypesRepository.reserve(tx, 21, 1))).toBeNull();
  });
});
