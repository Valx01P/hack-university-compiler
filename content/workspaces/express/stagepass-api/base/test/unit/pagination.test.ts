// Cursors: opaque to clients, strict when they come back.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ValidationError } from "../../src/http/errors.ts";
import { decodeCursor, encodeCursor, toPage } from "../../src/http/pagination.ts";

const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

describe("cursors", () => {
  it("round-trips the sort, the last row's key, and its id", () => {
    const cursor = { sort: "startsAt", key: "2026-11-14T02:00:00.000Z", id: 9 };
    expect(decodeCursor(encodeCursor(cursor), { sort: "startsAt", key: z.iso.datetime() })).toEqual(cursor);
  });

  it("is URL-safe text", () => {
    expect(encodeCursor({ sort: "title", key: "A Doll's House?&=", id: 16 })).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ["not base64 JSON", "not a cursor"],
    ["JSON of the wrong shape", encoded({ startsAt: "2026-11-14T02:00:00Z" })],
    ["a negative id", encoded({ sort: "startsAt", key: "2026-11-14T02:00:00.000Z", id: -1 })],
    ["a zero id", encoded({ sort: "startsAt", key: "2026-11-14T02:00:00.000Z", id: 0 })],
    ["a fractional id", encoded({ sort: "startsAt", key: "2026-11-14T02:00:00.000Z", id: 1.5 })],
    ["extra fields", encoded({ sort: "startsAt", key: "2026-11-14T02:00:00.000Z", id: 1, admin: true })],
    ["a key that is not a time", encoded({ sort: "startsAt", key: "yesterday", id: 1 })],
    ["another sort's cursor", encoded({ sort: "title", key: "Synth Night", id: 11 })],
  ])("rejects %s with a 400 for the cursor field", (_case, raw) => {
    let caught: unknown;
    try {
      decodeCursor(raw, { sort: "startsAt", key: z.iso.datetime() });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).errors[0]?.field).toBe("cursor");
  });
});

describe("toPage", () => {
  const rows = [1, 2, 3, 4].map((id) => ({ id, key: `k${id}` }));
  const cursorOf = (row: { id: number; key: string }) => ({ sort: "title", key: row.key, id: row.id });

  it("shows limit rows and points the cursor after the last one shown", () => {
    const page = toPage(rows, 3, cursorOf);
    expect(page.data.map((row) => row.id)).toEqual([1, 2, 3]);
    expect(decodeCursor(page.nextCursor ?? "", { sort: "title" })).toEqual({ sort: "title", key: "k3", id: 3 });
  });

  it("has no next page when the extra row is missing", () => {
    expect(toPage(rows, 4, cursorOf)).toEqual({ data: rows, nextCursor: null });
  });
});
