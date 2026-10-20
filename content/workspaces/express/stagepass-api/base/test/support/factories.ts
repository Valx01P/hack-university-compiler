// Factories: complete rows with sensible defaults, so a test states only what it is about,
// such as makeEvent({ status: "draft" }). Ids start at 1000 to stay clear of the demo rows.
import type { User } from "../../src/modules/auth/users.repository.ts";
import type { Event } from "../../src/modules/events/events.repository.ts";
import type { TicketType } from "../../src/modules/ticket-types/ticket-types.repository.ts";
import type { Venue } from "../../src/modules/venues/venues.repository.ts";

/** The frozen moment every test runs at (test/support/setup.ts). */
export const NOW = new Date("2026-10-01T09:00:00Z");

let nextId = 1000;
const id = () => (nextId += 1);

export function makeUser(overrides: Partial<User> = {}): User {
  const userId = overrides.id ?? id();
  return {
    id: userId,
    email: `user${userId}@stagepass.test`,
    name: `User ${userId}`,
    role: "customer",
    passwordHash: "$argon2id$v=19$m=19456,p=1,t=2$not-a-real-salt$not-a-real-hash",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeVenue(overrides: Partial<Venue> = {}): Venue {
  const venueId = overrides.id ?? id();
  return {
    id: venueId,
    name: `Venue ${venueId}`,
    city: "Austin",
    address: "1 Main St",
    capacity: 200,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** A published event a month from now, owned by Olu (2) at venue 1, unless overridden. */
export function makeEvent(overrides: Partial<Event> = {}): Event {
  const eventId = overrides.id ?? id();
  const startsAt = overrides.startsAt ?? new Date("2026-11-01T02:00:00Z");
  return {
    id: eventId,
    organizerId: 2,
    venueId: 1,
    slug: `event-${eventId}`,
    title: `Event ${eventId}`,
    description: "",
    category: "music",
    status: "published",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 2 * 3_600_000),
    posterPath: null,
    publishedAt: NOW,
    cancelledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeTicketType(overrides: Partial<TicketType> & Pick<TicketType, "eventId">): TicketType {
  return {
    id: overrides.id ?? id(),
    name: "General",
    priceCents: 2500,
    capacity: 100,
    sold: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
