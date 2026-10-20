// Pagination: every shipment exactly once and in order, the filter sent with every page, and
// pages fetched only as the caller iterates (the mock's call log counts them).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { paginate } from "../src/index.ts";
import { startMock, type TestMock } from "./mock.ts";

let mock: TestMock;
before(async () => {
  mock = await startMock();
});
after(async () => {
  await mock.close();
});

const shipmentCalls = (): number => mock.calls.filter((call) => call.path === "/v1/shipments").length;

test("all() yields every shipment once, in order", async () => {
  const ids = (await Array.fromAsync(mock.client().shipments.all())).map((shipment) => shipment.id);
  assert.equal(ids.length, 12);
  assert.equal(new Set(ids).size, 12);
  assert.equal(ids[0], "SHP-1001");
  assert.equal(ids[11], "SHP-1012");
});

test("the status filter goes with every page", async () => {
  const before = mock.calls.length;
  // Two to a page, so the five in transit take three pages.
  const shipments = await Array.fromAsync(mock.client().shipments.all({ status: "in_transit" }, 2));
  assert.deepEqual(
    shipments.map((shipment) => shipment.id),
    ["SHP-1001", "SHP-1004", "SHP-1006", "SHP-1009", "SHP-1011"],
  );
  const pages = mock.calls.slice(before).filter((call) => call.path === "/v1/shipments");
  assert.equal(pages.length, 3);
  assert.ok(pages.every((call) => call.search.includes("status=in_transit")));
});

test("breaking after the first item fetches one page", async () => {
  const before = shipmentCalls();
  for await (const shipment of mock.client().shipments.all()) {
    assert.equal(shipment.id, "SHP-1001");
    break;
  }
  assert.equal(shipmentCalls() - before, 1);
});

test("paginate keeps the last page, and stops when the cursor is null", async () => {
  const pages = new Map([
    [null, { items: [1, 2], nextCursor: "b" }],
    ["b", { items: [3], nextCursor: null }],
  ]);
  const items = await Array.fromAsync(paginate((cursor) => Promise.resolve(pages.get(cursor) ?? { items: [], nextCursor: null })));
  assert.deepEqual(items, [1, 2, 3]);
});
