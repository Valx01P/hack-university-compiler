// TtlCache: entries expire, and the least recently used one goes first when it is full.
import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "../../src/cache.ts";

describe("TtlCache", () => {
  it("returns a value until its time to live has passed", () => {
    const cache = new TtlCache<number, string>({ ttlMs: 60_000, maxEntries: 10 });
    cache.set(1, "Riverside Hall");
    vi.setSystemTime(new Date("2026-10-01T09:00:59.999Z"));
    expect(cache.get(1)).toBe("Riverside Hall");
    vi.setSystemTime(new Date("2026-10-01T09:01:00Z"));
    expect(cache.get(1)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("drops the least recently used entry when full", () => {
    const cache = new TtlCache<number, string>({ ttlMs: 60_000, maxEntries: 2 });
    cache.set(1, "one");
    cache.set(2, "two");
    cache.get(1);
    cache.set(3, "three");
    expect([cache.get(1), cache.get(2), cache.get(3)]).toEqual(["one", undefined, "three"]);
  });

  it("forgets an entry on delete, so the next read goes to the source", () => {
    const cache = new TtlCache<number, string>({ ttlMs: 60_000, maxEntries: 2 });
    cache.set(1, "old name");
    expect(cache.delete(1)).toBe(true);
    expect(cache.get(1)).toBeUndefined();
  });
});
