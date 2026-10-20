// paginate on its own, with pages from a Map instead of the mock.
import assert from "node:assert/strict";
import { test } from "node:test";
import { paginate } from "../src/index.ts";

test("paginate keeps the last page, and stops when the cursor is null", async () => {
  const pages = new Map([
    [null, { items: [1, 2], nextCursor: "b" }],
    ["b", { items: [3], nextCursor: null }],
  ]);
  const items = await Array.fromAsync(paginate((cursor) => Promise.resolve(pages.get(cursor) ?? { items: [], nextCursor: null })));
  assert.deepEqual(items, [1, 2, 3]);
});
