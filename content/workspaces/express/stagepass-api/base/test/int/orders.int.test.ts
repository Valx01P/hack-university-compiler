// Checkout against real PostgreSQL, where concurrency is real: many buyers at once never
// oversell, opposite carts never deadlock into errors, and a retried key never buys twice.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.ts";
import { SoldOutError } from "../../src/http/errors.ts";
import { createLogger } from "../../src/logger.ts";
import { createServices, pgRepositories } from "../../src/services.ts";
import { as } from "../support/tokens.ts";
import { openTestDb, resetTestDb, testDatabaseUrl } from "../support/test-db.ts";

const database = openTestDb();
afterAll(() => database.pool.end());
beforeEach(() => resetTestDb(database));

/** The real services on the test database. raceDelayMs widens the gap between read and write. */
function services(raceDelayMs = 0) {
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: testDatabaseUrl(),
    HU_RACE_DELAY_MS: String(raceDelayMs),
    LOG_LEVEL: "silent",
    UPLOAD_DIR: mkdtempSync(join(tmpdir(), "stagepass-int-")),
  });
  return createServices({ db: database.db, repositories: pgRepositories, config, logger: createLogger(config) }).services;
}

async function ticketType(id: number) {
  const { rows } = await database.pool.query<{ sold: number; capacity: number; paid: number }>(
    `SELECT t.sold, t.capacity,
            coalesce((SELECT sum(i.quantity) FROM order_items i JOIN orders o ON o.id = i.order_id
                      WHERE i.ticket_type_id = t.id AND o.status = 'paid'), 0)::int AS paid
       FROM ticket_types t WHERE t.id = $1`,
    [id],
  );
  return rows[0];
}

describe("checkout under concurrency", () => {
  it("sells the last Front Row seat exactly once to 20 simultaneous buyers", async () => {
    const { checkout } = services(50);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => checkout.checkout(as.cam, { items: [{ ticketTypeId: 21, quantity: 1 }] }, `race-${i}-0000`)),
    );

    const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(failures).toHaveLength(19);
    expect(failures.every((reason) => reason instanceof SoldOutError)).toBe(true);
    expect(await ticketType(21)).toEqual({ sold: 2, capacity: 2, paid: 2 });
  });

  it("never deadlocks into errors when carts list the same types in opposite orders", async () => {
    const { checkout } = services(20);
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, (_, i) => {
        const items = [{ ticketTypeId: 22, quantity: 1 }, { ticketTypeId: 23, quantity: 1 }];
        return checkout.checkout(as.dee, { items: i % 2 === 0 ? items : items.reverse() }, `opposite-${i}-0000`);
      }),
    );

    const unexpected = results.filter((result) => result.status === "rejected" && !(result.reason instanceof SoldOutError));
    expect(unexpected).toEqual([]);
    // Standing (23) holds 20, so 20 carts succeed and 10 find it sold out.
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(20);
    expect(await ticketType(23)).toEqual({ sold: 20, capacity: 20, paid: 20 });
    expect(await ticketType(22)).toEqual({ sold: 21, capacity: 90, paid: 21 });
  });

  it("creates one order when the same Idempotency-Key arrives five times at once", async () => {
    const { checkout } = services(20);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => checkout.checkout(as.cam, { items: [{ ticketTypeId: 22, quantity: 2 }] }, "same-key-0001")),
    );

    expect(new Set(results.map((result) => result.order.id)).size).toBe(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect((await ticketType(22))?.sold).toBe(3);
  });
});

describe("transactions", () => {
  it("leaves no trace of a checkout that fails halfway", async () => {
    const { checkout } = services();
    const attempt = checkout.checkout(as.cam, { items: [{ ticketTypeId: 1, quantity: 2 }, { ticketTypeId: 2, quantity: 1 }] }, "half-order-0001");
    await expect(attempt).rejects.toBeInstanceOf(SoldOutError);

    expect((await ticketType(1))?.sold).toBe(5);
    const { rows } = await database.pool.query("SELECT count(*)::int AS n FROM orders WHERE idempotency_key = 'half-order-0001'");
    expect(rows[0].n).toBe(0);
    const audit = await database.db.execute(sql`SELECT count(*)::int AS n FROM audit_log`);
    expect(audit.rows[0]?.n).toBe(0);
  });

  it("gives seats back on cancel and writes the audit row in the same transaction", async () => {
    const { orders } = services();
    await orders.cancel(as.cam, 29);

    expect(await ticketType(36)).toEqual({ sold: 0, capacity: 400, paid: 0 });
    const { rows } = await database.pool.query("SELECT action, actor_id, entity_id, data FROM audit_log");
    expect(rows).toEqual([{ action: "order.cancelled", actor_id: 4, entity_id: 29, data: { from: "paid", to: "cancelled" } }]);
  });

  it("records who published an event", async () => {
    const { events } = services();
    await events.publish(as.olu, 12);
    const { rows } = await database.pool.query("SELECT action, actor_id, entity, entity_id FROM audit_log");
    expect(rows).toEqual([{ action: "event.published", actor_id: 2, entity: "event", entity_id: 12 }]);
  });
});
