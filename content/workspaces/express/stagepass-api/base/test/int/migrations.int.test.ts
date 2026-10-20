// The migrations, applied: every file recorded once, and the rules that live in the database
// (constraints, the generated search column, the email trigger) doing their job.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pgConstraint, pgErrorCode } from "../../src/db/tx.ts";
import { openTestDb, resetTestDb } from "../support/test-db.ts";

const database = openTestDb();
const { pool } = database;
afterAll(() => pool.end());
beforeEach(() => resetTestDb(database));

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")) as {
  entries: Array<{ tag: string; when: number }>;
};

async function failure(query: string, values: unknown[] = []): Promise<{ code?: string; constraint?: string }> {
  try {
    await pool.query(query, values);
  } catch (err) {
    return { code: pgErrorCode(err), constraint: pgConstraint(err) };
  }
  throw new Error(`Expected this to fail: ${query}`);
}

describe("the migration history", () => {
  it("records every file in drizzle/ once, with the hash of what ran", async () => {
    const { rows } = await pool.query<{ hash: string; created_at: string }>(
      "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at",
    );
    const expected = journal.entries.map((entry) => ({
      hash: createHash("sha256").update(readFileSync(`${migrationsFolder}/${entry.tag}.sql`, "utf8")).digest("hex"),
      created_at: String(entry.when),
    }));
    expect(rows).toEqual(expected);
  });

  it("applies nothing the second time", async () => {
    await migrate(database.db, { migrationsFolder });
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations");
    expect(rows[0].n).toBe(journal.entries.length);
  });
});

describe("rules in the database", () => {
  it("lowercases emails on insert and on update (0008, a trigger)", async () => {
    await pool.query(
      "INSERT INTO users (email, name, role, password_hash, created_at, updated_at) VALUES ('Mixed@Example.TEST', 'Mixed', 'customer', 'x', now(), now())",
    );
    await pool.query("UPDATE users SET email = 'Cam.Lee@StagePass.TEST' WHERE id = 4");
    const { rows } = await pool.query("SELECT email FROM users WHERE name = 'Mixed' OR id = 4 ORDER BY id");
    expect(rows.map((row) => row.email)).toEqual(["cam.lee@stagepass.test", "mixed@example.test"]);
  });

  it("refuses to sell more than capacity, whatever the code above does", async () => {
    expect(await failure("UPDATE ticket_types SET sold = capacity + 1 WHERE id = 21")).toEqual({
      code: "23514",
      constraint: "ticket_types_sold_within_capacity_check",
    });
  });

  it("refuses a second account with the same email in another case", async () => {
    expect(
      await failure(
        "INSERT INTO users (email, name, role, password_hash, created_at, updated_at) VALUES ('CAM@stagepass.test', 'Copy', 'customer', 'x', now(), now())",
      ),
    ).toEqual({ code: "23505", constraint: "users_email_lower_idx" });
  });

  it("keeps slugs unique (0007)", async () => {
    expect(await failure("UPDATE events SET slug = 'the-blue-note-jam' WHERE id = 2")).toEqual({
      code: "23505",
      constraint: "events_slug_unique",
    });
  });

  it("keeps the search column up to date by itself (0005, a generated column)", async () => {
    await pool.query("UPDATE events SET description = 'Now with a theremin solo.' WHERE id = 7");
    const { rows } = await pool.query("SELECT id FROM events WHERE search @@ websearch_to_tsquery('english', 'theremin')");
    expect(rows).toEqual([{ id: 7 }]);
  });

  it("indexes my orders in the order the list reads them (0009)", async () => {
    const { rows } = await pool.query("SELECT indexdef FROM pg_indexes WHERE indexname = 'orders_customer_idx'");
    expect(rows[0]?.indexdef).toContain("(customer_id, created_at DESC, id DESC)");
  });
});
