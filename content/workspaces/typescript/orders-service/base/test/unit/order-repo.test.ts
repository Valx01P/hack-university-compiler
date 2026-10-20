// One contract, two implementations: the same tests run against the SQLite repository and the
// in-memory one, both loaded with the demo data, so a service cannot tell them apart.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { customerId } from "../helpers/builders.ts";
import { orderIdFor } from "#domain/ids.ts";
import type { Order } from "#domain/order.ts";
import { sqliteRepositories } from "#repositories/sqlite/repositories.ts";
import type { Repositories } from "#repositories/types.ts";
import { demoDatabase, demoMemoryRepositories } from "../helpers/demo.ts";

const ids = (orders: readonly Order[]): string[] => orders.map((order) => order.id);

for (const [name, make] of [
  ["sqlite", () => sqliteRepositories(demoDatabase())],
  ["memory", demoMemoryRepositories],
] as const) {
  describe(`${name} OrderRepository`, () => {
    test("findByStatus pages the paid orders, newest first", () => {
      const { orders }: Repositories = make();
      const first = orders.findByStatus("paid", { limit: 2, cursor: null });
      assert.deepEqual(ids(first.items), ["ord_0009", "ord_0008"]);
      assert.ok(first.nextCursor);
      const second = orders.findByStatus("paid", { limit: 2, cursor: first.nextCursor });
      assert.deepEqual(ids(second.items), ["ord_0006"]);
      assert.equal(second.nextCursor, null);
    });

    test("findAll walks all 12 orders once, page by page", () => {
      const { orders }: Repositories = make();
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page = orders.findAll({ limit: 5, cursor });
        seen.push(...ids(page.items));
        cursor = page.nextCursor;
      } while (cursor !== null);
      assert.equal(seen.length, 12);
      assert.equal(new Set(seen).size, 12);
      assert.equal(seen[0], "ord_0012");
    });

    test("listByCustomer is newest first", () => {
      const { orders }: Repositories = make();
      assert.deepEqual(ids(orders.listByCustomer(customerId("cus_01"))), ["ord_0010", "ord_0007", "ord_0003", "ord_0001"]);
      assert.deepEqual(ids(orders.listByCustomer(customerId("cus_04"))), []);
    });

    test("create takes the next id, and update saves a new state", () => {
      const { orders }: Repositories = make();
      const pending = orders.findById(orderIdFor(10));
      assert.ok(pending);
      const created = orders.create({ customerId: pending.customerId, lines: pending.lines, note: null, createdAt: new Date("2026-10-01T09:00:00.000Z") });
      assert.equal(created.id, "ord_0013");
      assert.deepEqual(orders.findById(created.id), created);
      orders.update({ ...created, status: "paid", paidAt: new Date("2026-10-01T09:05:00.000Z"), paymentRef: "pay_0013" });
      assert.equal(orders.findById(created.id)?.status, "paid");
    });
  });
}
