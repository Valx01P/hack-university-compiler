// The demo data every workspace starts with: fixed ids, fixed UTC times, and password hashes
// computed once, so every example, transcript, and check sees the same rows. Hack University
// freezes the clock at 2026-10-01T09:00:00Z (HU_FIXED_TIME), so events before then are over.
//
// Every password is stagepass-demo-2026. Users 1 to 5 have argon2id hashes, and user 6 a bcrypt
// hash from the ticketing system StagePass imported its first customers from.
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import type { Db } from "../src/db/tx.ts";

export const DEMO_PASSWORD = "stagepass-demo-2026";

const at = (iso: string) => new Date(iso);
const hoursAfter = (iso: string, hours: number) => new Date(Date.parse(iso) + hours * 3_600_000);

type Role = (typeof schema.roles)[number];
type Category = (typeof schema.eventCategories)[number];
type EventStatus = (typeof schema.eventStatuses)[number];

export const users: Array<{ id: number; name: string; email: string; role: Role; passwordHash: string }> = [
  { id: 1, name: "Ada Admin", email: "admin@stagepass.test", role: "admin", passwordHash: "$argon2id$v=19$m=19456,p=1,t=2$eB06i1Bc2JxPPwMniP+QRA$ovO5nxBESqOLVtP/TtTKfK2JfL1QJeqX+rbI1wKbqZ8" },
  { id: 2, name: "Olu Ade", email: "olu@stagepass.test", role: "organizer", passwordHash: "$argon2id$v=19$m=19456,p=1,t=2$os8H+3OsKz5SV2ZTkR7uRA$by9+EvYkPCaq+gbv5/c56ZCo1UDpxcNju/UetS/2mEg" },
  { id: 3, name: "Priya Nair", email: "priya@stagepass.test", role: "organizer", passwordHash: "$argon2id$v=19$m=19456,p=1,t=2$/iPbzA8XIBa9J3+LQT8ZjA$jkUHdaXb7kiYuN9rzexbM8+T5WFe3noWN37Iws0cmC4" },
  { id: 4, name: "Cam Lee", email: "cam@stagepass.test", role: "customer", passwordHash: "$argon2id$v=19$m=19456,p=1,t=2$Da9BpeQ7Wvr1CbhchAaK0A$CmIJOHhNaMjGFvLwsZkOAUIELA6MYAQXyYWf0r8g3yA" },
  { id: 5, name: "Dee Romero", email: "dee@stagepass.test", role: "customer", passwordHash: "$argon2id$v=19$m=19456,p=1,t=2$W/lmTBshQa/1VvkdUxWsKA$YdUkefGneeTtRI13qP1NO+JogJBbStN8VUYOBILJXX4" },
  { id: 6, name: "Old Timer", email: "legacy@stagepass.test", role: "customer", passwordHash: "$2b$10$Rq5KuFCdXkNsYAz0Bg.4zu.O1hSgYNRENJ1ls/zNMlRELKpaUtXyi" },
];

export const venues = [
  { id: 1, name: "The Blue Note Room", city: "Austin", address: "1208 E 6th St", capacity: 120 },
  { id: 2, name: "Riverside Hall", city: "Denver", address: "2401 Platte St", capacity: 400 },
  { id: 3, name: "Lantern Theater", city: "Austin", address: "512 Congress Ave", capacity: 250 },
  { id: 4, name: "Warehouse 9", city: "Chicago", address: "900 W Lake St", capacity: 800 },
];

type SeedEvent = {
  id: number;
  title: string;
  slug: string;
  category: Category;
  status: EventStatus;
  venueId: number;
  startsAt: string;
  hours: number;
  description: string;
  cancelledAt?: string;
  posterPath?: string;
};

// Events 1 to 14 are Olu's, 15 to 24 Priya's. 8, 9, 10, and 11 start at the same moment, the
// ties every cursor must handle. Only 1, 3, and 5 mention jazz, the full text search examples.
export const events: SeedEvent[] = [
  { id: 1, title: "The Blue Note Jam", slug: "the-blue-note-jam", category: "music", status: "published", venueId: 1, startsAt: "2026-10-16T01:00:00Z", hours: 3, description: "An open jazz jam with the house trio. Bring your horn, or just your ears." },
  { id: 2, title: "Riverside Comedy Night", slug: "riverside-comedy-night", category: "comedy", status: "published", venueId: 2, startsAt: "2026-10-10T02:00:00Z", hours: 2, description: "Five stand-up comics, one host, and a view of the river." },
  { id: 3, title: "Late Night Jazz Session", slug: "late-night-jazz-session", category: "music", status: "published", venueId: 2, startsAt: "2026-10-24T04:00:00Z", hours: 3, description: "Quiet late sets from the city's best trios, starting at ten.", posterPath: "posters/3f1c9a2e-7b4d-4e8a-9c2f-5d6e7f8a9b0c.png" },
  { id: 4, title: "Songwriters in the Round", slug: "songwriters-in-the-round", category: "music", status: "published", venueId: 1, startsAt: "2026-09-20T01:00:00Z", hours: 2.5, description: "Four songwriters trade songs and the stories behind them." },
  { id: 5, title: "Sunday Jazz Brunch", slug: "sunday-jazz-brunch", category: "music", status: "published", venueId: 1, startsAt: "2026-10-18T16:00:00Z", hours: 3, description: "Live standards and brunch from the Blue Note kitchen." },
  { id: 6, title: "Improv Lab", slug: "improv-lab", category: "comedy", status: "draft", venueId: 3, startsAt: "2026-11-05T01:30:00Z", hours: 1.5, description: "Long-form improv, built from your suggestions." },
  { id: 7, title: "Last Call Quartet", slug: "last-call-quartet", category: "music", status: "published", venueId: 1, startsAt: "2026-11-07T02:00:00Z", hours: 2.5, description: "Four Austin regulars play ballads, blues, and a few surprises." },
  { id: 8, title: "Comedy Cellar Showcase", slug: "comedy-cellar-showcase", category: "comedy", status: "published", venueId: 2, startsAt: "2026-11-14T02:00:00Z", hours: 2, description: "Eight comics, eight minutes each." },
  { id: 9, title: "Blues on the River", slug: "blues-on-the-river", category: "music", status: "published", venueId: 2, startsAt: "2026-11-14T02:00:00Z", hours: 3, description: "Electric blues on the river deck." },
  { id: 10, title: "Shakespeare Unplugged", slug: "shakespeare-unplugged", category: "theater", status: "published", venueId: 3, startsAt: "2026-11-14T02:00:00Z", hours: 2.5, description: "Scenes from the comedies with no set and no microphones." },
  { id: 11, title: "Synth Night", slug: "synth-night", category: "music", status: "published", venueId: 4, startsAt: "2026-11-14T02:00:00Z", hours: 4, description: "Modular synths, a light show, and dancing until late." },
  { id: 12, title: "Folk Revival", slug: "folk-revival", category: "music", status: "draft", venueId: 3, startsAt: "2026-11-21T01:00:00Z", hours: 2.5, description: "Fiddles, banjos, and old songs everyone sings." },
  { id: 13, title: "Stand-up Showcase", slug: "stand-up-showcase", category: "comedy", status: "cancelled", venueId: 1, startsAt: "2026-10-31T01:00:00Z", hours: 2, description: "Halloween stand-up with costumes on both sides of the stage.", cancelledAt: "2026-09-26T10:00:00Z" },
  { id: 14, title: "Austin Story Slam", slug: "austin-story-slam", category: "talk", status: "draft", venueId: 3, startsAt: "2026-12-03T01:00:00Z", hours: 2, description: "Five-minute true stories on the theme of home." },
  { id: 15, title: "Hamlet in the Round", slug: "hamlet-in-the-round", category: "theater", status: "published", venueId: 3, startsAt: "2026-10-23T00:30:00Z", hours: 3, description: "Shakespeare's tragedy, staged with the audience on all four sides.", posterPath: "posters/8d2e4f60-1a3b-4c5d-8e9f-0a1b2c3d4e5f.png" },
  { id: 16, title: "A Doll's House", slug: "a-doll-s-house", category: "theater", status: "published", venueId: 3, startsAt: "2026-11-20T01:00:00Z", hours: 2.5, description: "Ibsen's play in a new translation." },
  { id: 17, title: "The Comedy of Errors", slug: "the-comedy-of-errors", category: "theater", status: "published", venueId: 2, startsAt: "2026-09-26T01:00:00Z", hours: 2.5, description: "Two sets of twins and one very confused city." },
  { id: 18, title: "Designing for Accessibility", slug: "designing-for-accessibility", category: "talk", status: "published", venueId: 4, startsAt: "2026-10-08T23:00:00Z", hours: 2, description: "Practical patterns for interfaces everyone can use." },
  { id: 19, title: "Node in Production", slug: "node-in-production", category: "talk", status: "published", venueId: 4, startsAt: "2026-12-05T00:00:00Z", hours: 2, description: "Running Node services: deploys, observability, and incidents." },
  { id: 20, title: "Postgres at Scale", slug: "postgres-at-scale", category: "talk", status: "published", venueId: 4, startsAt: "2026-11-12T00:00:00Z", hours: 2.5, description: "Indexes, partitioning, and the queries that keep you up at night." },
  { id: 21, title: "Winter Solstice Concert", slug: "winter-solstice-concert", category: "music", status: "draft", venueId: 3, startsAt: "2026-12-21T01:00:00Z", hours: 2, description: "A choir and a string quartet for the longest night." },
  { id: 22, title: "Midnight Cabaret", slug: "midnight-cabaret", category: "theater", status: "cancelled", venueId: 2, startsAt: "2026-10-17T05:00:00Z", hours: 2, description: "Songs and sketches after dark.", cancelledAt: "2026-09-28T09:00:00Z" },
  { id: 23, title: "Data Viz Meetup", slug: "data-viz-meetup", category: "talk", status: "cancelled", venueId: 4, startsAt: "2026-10-14T23:00:00Z", hours: 2, description: "Lightning talks about charts that tell the truth.", cancelledAt: "2026-09-25T09:00:00Z" },
  { id: 24, title: "Last Show of the Year", slug: "last-show-of-the-year", category: "comedy", status: "draft", venueId: 2, startsAt: "2026-12-31T22:00:00Z", hours: 2, description: "Our favorite comics close out the year." },
];

// [id, eventId, name, priceCents, capacity]. `sold` is not listed: the seed works it out from
// the paid orders below, so the two can never disagree.
export const ticketTypes: Array<[number, number, string, number, number]> = [
  [1, 1, "General", 2500, 100], [2, 1, "VIP", 8000, 10],
  [3, 2, "General", 2000, 300], [4, 2, "Front Tables", 4500, 40], [5, 2, "Balcony", 1500, 60],
  [6, 3, "General", 3000, 250], [7, 3, "Bar Seating", 4000, 30], [8, 3, "Lounge", 6000, 20],
  [9, 4, "General", 1800, 90], [10, 4, "Reserved", 3500, 20],
  [11, 5, "Brunch Seat", 5500, 80], [12, 5, "Bar Stool", 3500, 20],
  [13, 8, "General", 2200, 200], [14, 8, "Front Row", 4000, 20],
  [15, 9, "General", 2800, 300], [16, 9, "Riverside Deck", 5000, 50],
  [17, 10, "General", 2400, 200], [18, 10, "Premium", 4800, 40],
  [19, 11, "General", 2000, 600], [20, 11, "Upstairs", 3500, 100],
  [21, 7, "Front Row", 6500, 2], [22, 7, "General", 3000, 90], [23, 7, "Standing", 2000, 20],
  [24, 12, "General", 2000, 150], [25, 12, "Supporter", 4000, 20],
  [26, 13, "General", 1500, 100], [27, 13, "Front Row", 3000, 20],
  [28, 15, "Stalls", 4500, 180], [29, 15, "Balcony", 3000, 60],
  [30, 16, "Stalls", 4000, 180], [31, 16, "Balcony", 2500, 60],
  [32, 17, "General", 3500, 300], [33, 17, "Premium", 6000, 50],
  [34, 18, "General", 2500, 300], [35, 18, "Workshop Pass", 9000, 40],
  [36, 19, "General", 3000, 400], [37, 19, "Workshop Pass", 12000, 40],
  [38, 20, "General", 3000, 500], [39, 20, "Speaker Dinner", 15000, 20], [40, 20, "Student", 1000, 80],
  [41, 22, "General", 2800, 300],
  [42, 23, "General", 0, 200],
];

type SeedOrder = {
  id: number;
  customerId: number;
  eventId: number;
  createdAt: string;
  items: Array<[ticketTypeId: number, quantity: number]>;
  cancelledAt?: string;
};

// 30 orders by Cam (4) and Dee (5): 24 paid and 6 cancelled, 41 items. Orders 6 and 7 were
// placed at the same second, so "newest first" needs the id to break the tie. Event 1's VIP
// sells out (4 + 6 of 10), and event 7's Front Row has one seat left (1 of 2).
export const orders: SeedOrder[] = [
  { id: 1, customerId: 4, eventId: 4, createdAt: "2026-09-01T15:00:00Z", items: [[9, 2]] },
  { id: 2, customerId: 4, eventId: 17, createdAt: "2026-09-02T17:20:00Z", items: [[32, 2], [33, 1]] },
  { id: 3, customerId: 5, eventId: 17, createdAt: "2026-09-04T10:00:00Z", items: [[32, 4]] },
  { id: 4, customerId: 4, eventId: 1, createdAt: "2026-09-05T19:05:00Z", items: [[1, 2], [2, 4]] },
  { id: 5, customerId: 5, eventId: 1, createdAt: "2026-09-06T20:00:00Z", items: [[2, 6]] },
  { id: 6, customerId: 4, eventId: 2, createdAt: "2026-09-08T12:00:00Z", items: [[4, 2]] },
  { id: 7, customerId: 4, eventId: 15, createdAt: "2026-09-08T12:00:00Z", items: [[28, 2]] },
  { id: 8, customerId: 5, eventId: 2, createdAt: "2026-09-09T13:15:00Z", items: [[3, 4], [5, 2]] },
  { id: 9, customerId: 4, eventId: 13, createdAt: "2026-09-10T20:45:00Z", items: [[26, 3]], cancelledAt: "2026-09-26T10:00:00Z" },
  { id: 10, customerId: 5, eventId: 23, createdAt: "2026-09-11T18:00:00Z", items: [[42, 1]], cancelledAt: "2026-09-25T09:00:00Z" },
  { id: 11, customerId: 4, eventId: 3, createdAt: "2026-09-12T09:30:00Z", items: [[6, 2], [7, 2]] },
  { id: 12, customerId: 5, eventId: 3, createdAt: "2026-09-13T15:45:00Z", items: [[6, 2]] },
  { id: 13, customerId: 4, eventId: 5, createdAt: "2026-09-14T16:10:00Z", items: [[11, 2], [12, 1]] },
  { id: 14, customerId: 5, eventId: 15, createdAt: "2026-09-15T10:30:00Z", items: [[28, 1], [29, 2]] },
  { id: 15, customerId: 4, eventId: 18, createdAt: "2026-09-16T11:00:00Z", items: [[34, 1], [35, 1]] },
  { id: 16, customerId: 5, eventId: 5, createdAt: "2026-09-17T19:00:00Z", items: [[12, 2]], cancelledAt: "2026-09-18T09:00:00Z" },
  { id: 17, customerId: 4, eventId: 8, createdAt: "2026-09-18T21:00:00Z", items: [[13, 4]] },
  { id: 18, customerId: 5, eventId: 11, createdAt: "2026-09-19T12:20:00Z", items: [[19, 3], [20, 1]] },
  { id: 19, customerId: 4, eventId: 20, createdAt: "2026-09-20T10:15:00Z", items: [[38, 1], [39, 1]] },
  { id: 20, customerId: 5, eventId: 16, createdAt: "2026-09-21T17:00:00Z", items: [[30, 2]] },
  { id: 21, customerId: 4, eventId: 22, createdAt: "2026-09-22T14:40:00Z", items: [[41, 2]], cancelledAt: "2026-09-28T09:00:00Z" },
  { id: 22, customerId: 5, eventId: 13, createdAt: "2026-09-23T09:00:00Z", items: [[27, 2]], cancelledAt: "2026-09-26T10:00:00Z" },
  { id: 23, customerId: 4, eventId: 10, createdAt: "2026-09-24T18:00:00Z", items: [[17, 2]] },
  { id: 24, customerId: 5, eventId: 9, createdAt: "2026-09-25T20:30:00Z", items: [[15, 2], [16, 1]] },
  { id: 25, customerId: 4, eventId: 7, createdAt: "2026-09-26T13:30:00Z", items: [[21, 1], [22, 1]] },
  { id: 26, customerId: 5, eventId: 20, createdAt: "2026-09-27T15:00:00Z", items: [[40, 1]] },
  { id: 27, customerId: 4, eventId: 9, createdAt: "2026-09-28T19:50:00Z", items: [[15, 2]], cancelledAt: "2026-09-29T08:00:00Z" },
  { id: 28, customerId: 5, eventId: 1, createdAt: "2026-09-29T11:10:00Z", items: [[1, 3]] },
  { id: 29, customerId: 4, eventId: 19, createdAt: "2026-09-30T08:00:00Z", items: [[36, 2]] },
  { id: 30, customerId: 5, eventId: 8, createdAt: "2026-09-30T16:00:00Z", items: [[14, 2]] },
];

export const favorites: Array<{ userId: number; eventId: number; createdAt: string }> = [
  { userId: 4, eventId: 3, createdAt: "2026-09-05T09:00:00Z" },
  { userId: 4, eventId: 9, createdAt: "2026-09-12T09:00:00Z" },
  { userId: 4, eventId: 16, createdAt: "2026-09-19T09:00:00Z" },
  { userId: 4, eventId: 20, createdAt: "2026-09-26T09:00:00Z" },
];

export type DemoRows = {
  users: Array<typeof schema.users.$inferSelect>;
  venues: Array<typeof schema.venues.$inferSelect>;
  events: Array<Omit<typeof schema.events.$inferSelect, "search">>;
  ticketTypes: Array<typeof schema.ticketTypes.$inferSelect>;
  orders: Array<typeof schema.orders.$inferSelect>;
  orderItems: Array<typeof schema.orderItems.$inferSelect>;
  favorites: Array<typeof schema.favorites.$inferSelect>;
};

/**
 * The rows above as they are stored: timestamps filled in, `sold` worked out from the paid
 * orders, totals from the items. seedDatabase inserts these, and the tests' in-memory fakes
 * load the very same rows.
 */
export function demoRows(): DemoRows {
  const priceOf = new Map(ticketTypes.map(([id, , , priceCents]) => [id, priceCents]));
  const eventOf = new Map(ticketTypes.map(([id, eventId]) => [id, eventId]));
  const sold = new Map<number, number>();
  for (const order of orders) {
    for (const [ticketTypeId, quantity] of order.items) {
      if (eventOf.get(ticketTypeId) !== order.eventId) {
        throw new Error(`Seed order ${order.id} has ticket type ${ticketTypeId} from another event`);
      }
      if (order.cancelledAt === undefined) sold.set(ticketTypeId, (sold.get(ticketTypeId) ?? 0) + quantity);
    }
  }

  let itemId = 0;
  return {
    users: users.map((user) => {
      const createdAt = hoursAfter("2026-08-01T12:00:00Z", (user.id - 1) * 24);
      return { ...user, createdAt, updatedAt: createdAt };
    }),
    venues: venues.map((venue) => ({ ...venue, createdAt: at("2026-08-05T09:00:00Z"), updatedAt: at("2026-08-05T09:00:00Z") })),
    events: events.map((event) => {
      const createdAt = hoursAfter("2026-08-10T15:00:00Z", event.id - 1);
      const publishedAt = event.status === "draft" ? null : hoursAfter("2026-08-25T15:00:00Z", event.id - 1);
      const cancelledAt = event.cancelledAt === undefined ? null : at(event.cancelledAt);
      return {
        id: event.id,
        organizerId: event.id <= 14 ? 2 : 3,
        venueId: event.venueId,
        slug: event.slug,
        title: event.title,
        description: event.description,
        category: event.category,
        status: event.status,
        startsAt: at(event.startsAt),
        endsAt: hoursAfter(event.startsAt, event.hours),
        posterPath: event.posterPath ?? null,
        publishedAt,
        cancelledAt,
        createdAt,
        updatedAt: cancelledAt ?? publishedAt ?? createdAt,
      };
    }),
    ticketTypes: ticketTypes.map(([id, eventId, name, priceCents, capacity]) => {
      const createdAt = hoursAfter("2026-08-20T10:00:00Z", id - 1);
      return { id, eventId, name, priceCents, capacity, sold: sold.get(id) ?? 0, createdAt, updatedAt: createdAt };
    }),
    orders: orders.map((order) => ({
      id: order.id,
      customerId: order.customerId,
      eventId: order.eventId,
      status: order.cancelledAt === undefined ? ("paid" as const) : ("cancelled" as const),
      totalCents: order.items.reduce((sum, [ticketTypeId, quantity]) => sum + quantity * (priceOf.get(ticketTypeId) ?? 0), 0),
      idempotencyKey: `seed-order-${String(order.id).padStart(4, "0")}`,
      paidAt: at(order.createdAt),
      cancelledAt: order.cancelledAt === undefined ? null : at(order.cancelledAt),
      createdAt: at(order.createdAt),
      updatedAt: at(order.cancelledAt ?? order.createdAt),
    })),
    orderItems: orders.flatMap((order) =>
      order.items.map(([ticketTypeId, quantity]) => ({
        id: (itemId += 1),
        orderId: order.id,
        ticketTypeId,
        quantity,
        unitPriceCents: priceOf.get(ticketTypeId) ?? 0,
      })),
    ),
    favorites: favorites.map((favorite) => ({ ...favorite, createdAt: at(favorite.createdAt) })),
  };
}

const TABLES = ["users", "refresh_tokens", "venues", "events", "ticket_types", "orders", "order_items", "audit_log", "notifications", "favorites"];

/** Empties every table and loads demoRows(), in one transaction. */
export async function seedDatabase(db: Db): Promise<Record<keyof DemoRows, number>> {
  const rows = demoRows();
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`));
    await tx.insert(schema.users).values(rows.users);
    await tx.insert(schema.venues).values(rows.venues);
    await tx.insert(schema.events).values(rows.events);
    await tx.insert(schema.ticketTypes).values(rows.ticketTypes);
    await tx.insert(schema.orders).values(rows.orders);
    await tx.insert(schema.orderItems).values(rows.orderItems);
    await tx.insert(schema.favorites).values(rows.favorites);
    // Rows went in with explicit ids, so each identity sequence must continue after the highest one.
    for (const table of ["users", "venues", "events", "ticket_types", "orders", "order_items"]) {
      await tx.execute(sql.raw(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM ${table}))`));
    }
  });
  return {
    users: rows.users.length,
    venues: rows.venues.length,
    events: rows.events.length,
    ticketTypes: rows.ticketTypes.length,
    orders: rows.orders.length,
    orderItems: rows.orderItems.length,
    favorites: rows.favorites.length,
  };
}
