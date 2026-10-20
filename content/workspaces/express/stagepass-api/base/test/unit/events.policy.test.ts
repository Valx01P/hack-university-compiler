// Who may see and change an event, as a table: role, ownership, and status to the answer.
import { describe, expect, it } from "vitest";
import type { AuthUser } from "../../src/http/auth.ts";
import { canEditEvent, canViewEvent } from "../../src/modules/events/events.policy.ts";
import { as } from "../support/tokens.ts";

// Olu (2) owns these events.
const draft = { status: "draft", organizerId: 2 } as const;
const published = { status: "published", organizerId: 2 } as const;
const cancelled = { status: "cancelled", organizerId: 2 } as const;

describe("canViewEvent", () => {
  it.each<[string, AuthUser | null, typeof draft | typeof published | typeof cancelled, boolean]>([
    ["anyone, a published event", null, published, true],
    ["anyone, a cancelled event", null, cancelled, true],
    ["anyone, a draft", null, draft, false],
    ["a customer, a draft", as.cam, draft, false],
    ["another organizer, a draft", as.priya, draft, false],
    ["its organizer, a draft", as.olu, draft, true],
    ["an admin, a draft", as.admin, draft, true],
  ])("%s: %s", (_case, user, event, expected) => {
    expect(canViewEvent(user, event)).toBe(expected);
  });
});

describe("canEditEvent", () => {
  it.each<[string, AuthUser, boolean]>([
    ["its organizer", as.olu, true],
    ["an admin", as.admin, true],
    ["another organizer", as.priya, false],
    ["a customer", as.cam, false],
  ])("%s: %s", (_case, user, expected) => {
    expect(canEditEvent(user, published)).toBe(expected);
    expect(canEditEvent(user, draft)).toBe(expected);
  });

  it("does not let a customer edit even with a matching id", () => {
    expect(canEditEvent({ id: 2, role: "customer" }, published)).toBe(false);
  });
});
