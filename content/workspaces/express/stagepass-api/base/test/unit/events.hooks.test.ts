// The pre-database hooks for events: slugs from titles, unique, and stable once published.
import { describe, expect, it } from "vitest";
import type { Tx } from "../../src/db/tx.ts";
import { HookRegistry } from "../../src/hooks/registry.ts";
import { registerEventHooks, slugify, uniqueSlug } from "../../src/modules/events/events.hooks.ts";
import { makeEvent } from "../support/factories.ts";
import { as } from "../support/tokens.ts";

const tx = { fakeTransaction: 1 } as unknown as Tx;

/** A repository that knows a fixed set of slugs, and records which tx asked. */
function slugsTaken(...taken: string[]) {
  const askedWith: unknown[] = [];
  return {
    askedWith,
    events: {
      async slugExists(db: unknown, slug: string) {
        askedWith.push(db);
        return taken.includes(slug);
      },
    },
  };
}

describe("slugify", () => {
  it.each([
    ["The Blue Note Jam", "the-blue-note-jam"],
    ["  Hamlet in the Round!  ", "hamlet-in-the-round"],
    ["A Doll's House", "a-doll-s-house"],
    ["Café Tacvba", "cafe-tacvba"],
    ["2026: A Year in Review", "2026-a-year-in-review"],
    ["!!!", "event"],
  ])("%s becomes %s", (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });
});

describe("uniqueSlug", () => {
  it("adds -2, -3 until the slug is free", async () => {
    const { events } = slugsTaken("open-mic-night", "open-mic-night-2");
    expect(await uniqueSlug(tx, events, "open-mic-night", null)).toBe("open-mic-night-3");
  });

  it("keeps a slug that is free", async () => {
    const { events } = slugsTaken();
    expect(await uniqueSlug(tx, events, "synth-night", null)).toBe("synth-night");
  });
});

describe("event hooks", () => {
  function registry(...taken: string[]) {
    const repository = slugsTaken(...taken);
    const hooks = new HookRegistry();
    registerEventHooks(hooks, { events: repository.events });
    return { hooks, askedWith: repository.askedWith };
  }

  const draft = {
    organizerId: 2,
    venueId: 1,
    title: "  Open Mic Night ",
    description: "",
    category: "comedy" as const,
    startsAt: new Date("2026-12-10T02:00:00Z"),
    endsAt: new Date("2026-12-10T04:00:00Z"),
  };

  it("before create: trims the title and sets a unique slug, using the caller's transaction", async () => {
    const { hooks, askedWith } = registry("open-mic-night");
    const { draft: ready } = await hooks.run("event.beforeCreate", { draft, actor: as.olu }, tx);
    expect(ready).toMatchObject({ title: "Open Mic Night", slug: "open-mic-night-2" });
    expect(askedWith.every((db) => db === tx)).toBe(true);
  });

  it("before update: a draft's slug follows its new title", async () => {
    const { hooks } = registry();
    const event = makeEvent({ id: 30, status: "draft", slug: "old-title" });
    const { changes } = await hooks.run("event.beforeUpdate", { event, changes: { title: " New Title " }, actor: as.olu }, tx);
    expect(changes).toEqual({ title: "New Title", slug: "new-title" });
  });

  it("before update: a published event keeps its slug, because its link is out there", async () => {
    const { hooks } = registry();
    const event = makeEvent({ id: 31, status: "published", slug: "old-title" });
    const { changes } = await hooks.run("event.beforeUpdate", { event, changes: { title: "New Title" }, actor: as.olu }, tx);
    expect(changes).toEqual({ title: "New Title" });
  });

  it("before update: changes without a title pass through untouched", async () => {
    const { hooks } = registry();
    const event = makeEvent({ id: 32, status: "draft" });
    const changes = { description: "Doors at 7" };
    const result = await hooks.run("event.beforeUpdate", { event, changes, actor: as.olu }, tx);
    expect(result.changes).toBe(changes);
  });
});
