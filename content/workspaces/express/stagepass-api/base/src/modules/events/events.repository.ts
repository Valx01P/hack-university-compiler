// Every query on events: the public list with its filters, full text search, sorts, and
// cursor, the lookups, and the organizer's sales. Nothing outside this file builds SQL for events.
import { and, asc, desc, eq, getTableColumns, gte, inArray, lt, ne, type SQL, sql } from "drizzle-orm";
import { events, orderItems, orders, venues } from "../../db/schema.ts";
import type { DbOrTx, Tx } from "../../db/tx.ts";

// Every column except search, the tsvector PostgreSQL maintains for full text search.
const { search: _search, ...eventColumns } = getTableColumns(events);
const venueColumns = { id: venues.id, name: venues.name, city: venues.city, address: venues.address, capacity: venues.capacity };

export type Event = Omit<typeof events.$inferSelect, "search">;
export type EventStatus = Event["status"];
export type EventCategory = Event["category"];
export type EventWithVenue = Event & { venue: { id: number; name: string; city: string; address: string; capacity: number } };

/** What EventsService inserts. The event.beforeCreate hooks fill in the slug. */
export type NewEventDraft = Pick<
  Event,
  "organizerId" | "venueId" | "title" | "description" | "category" | "startsAt" | "endsAt"
> & { slug?: string };

export type EventChanges = Partial<
  Pick<Event, "venueId" | "title" | "slug" | "description" | "category" | "startsAt" | "endsAt" | "posterPath" | "status" | "publishedAt" | "cancelledAt">
>;

export type EventSort = "startsAt" | "-startsAt" | "title" | "-title";

export type EventListQuery = {
  statuses: EventStatus[];
  city?: string | undefined;
  categories?: EventCategory[] | undefined;
  /** Inclusive. */
  from?: Date | undefined;
  /** Exclusive. */
  to?: Date | undefined;
  /** Web search syntax: words, "a phrase", -excluded. */
  q?: string | undefined;
  sort: EventSort;
  /** The last row of the previous page: its sort value (as text) and its id. */
  after?: { key: string; id: number } | undefined;
  /** Rows to return. Callers ask for one more than they show, to learn if a next page exists. */
  limit: number;
};

export type OrganizerEventSales = {
  id: number;
  title: string;
  slug: string;
  status: EventStatus;
  startsAt: Date;
  ticketsSold: number;
  revenueCents: number;
};

export interface EventsRepository {
  list(db: DbOrTx, query: EventListQuery): Promise<EventWithVenue[]>;
  findById(db: DbOrTx, id: number): Promise<EventWithVenue | null>;
  findBySlug(db: DbOrTx, slug: string): Promise<EventWithVenue | null>;
  /** Locks the event row until the transaction ends, so concurrent changes queue up. */
  findByIdForUpdate(tx: Tx, id: number): Promise<Event | null>;
  slugExists(db: DbOrTx, slug: string, exceptId: number | null): Promise<boolean>;
  create(db: DbOrTx, draft: NewEventDraft & { slug: string }): Promise<Event>;
  update(db: DbOrTx, id: number, changes: EventChanges): Promise<Event>;
  delete(db: DbOrTx, id: number): Promise<void>;
  /** The organizer's events with tickets sold and revenue from paid orders, in one query. */
  listForOrganizerWithSales(db: DbOrTx, organizerId: number): Promise<OrganizerEventSales[]>;
}

const sortColumn = { startsAt: events.startsAt, title: events.title } as const;

function sortParts(sort: EventSort): { column: "startsAt" | "title"; descending: boolean } {
  return sort.startsWith("-")
    ? { column: sort.slice(1) as "startsAt" | "title", descending: true }
    : { column: sort as "startsAt" | "title", descending: false };
}

/** (sort column, id) after the cursor's row, in the sort's direction: the keyset condition. */
function afterCursor(sort: EventSort, after: { key: string; id: number }): SQL {
  const { column, descending } = sortParts(sort);
  const key = column === "startsAt" ? sql`${after.key}::timestamptz` : sql`${after.key}`;
  return descending
    ? sql`(${sortColumn[column]}, ${events.id}) < (${key}, ${after.id})`
    : sql`(${sortColumn[column]}, ${events.id}) > (${key}, ${after.id})`;
}

function orderFor(sort: EventSort): SQL[] {
  const { column, descending } = sortParts(sort);
  const direction = descending ? desc : asc;
  // id last, so rows with the same start time (or title) always come in the same order.
  return [direction(sortColumn[column]), direction(events.id)];
}

function withVenue(db: DbOrTx) {
  return db
    .select({ ...eventColumns, venue: venueColumns })
    .from(events)
    .innerJoin(venues, eq(venues.id, events.venueId));
}

export const eventsRepository: EventsRepository = {
  async list(db, query) {
    // Undefined entries are skipped by and(), so each optional filter is one line.
    const conditions = [
      inArray(events.status, query.statuses),
      query.city === undefined ? undefined : eq(sql`lower(${venues.city})`, query.city.toLowerCase()),
      query.categories === undefined ? undefined : inArray(events.category, query.categories),
      query.from === undefined ? undefined : gte(events.startsAt, query.from),
      query.to === undefined ? undefined : lt(events.startsAt, query.to),
      // The GIN index events_search_idx serves this, and websearch_to_tsquery never throws on user input.
      query.q === undefined ? undefined : sql`${events.search} @@ websearch_to_tsquery('english', ${query.q})`,
      query.after === undefined ? undefined : afterCursor(query.sort, query.after),
    ];
    return withVenue(db)
      .where(and(...conditions))
      .orderBy(...orderFor(query.sort))
      .limit(query.limit);
  },

  async findById(db, id) {
    const [event] = await withVenue(db).where(eq(events.id, id));
    return event ?? null;
  },

  async findBySlug(db, slug) {
    const [event] = await withVenue(db).where(eq(events.slug, slug));
    return event ?? null;
  },

  async findByIdForUpdate(tx, id) {
    const [event] = await tx.select(eventColumns).from(events).where(eq(events.id, id)).for("update");
    return event ?? null;
  },

  async slugExists(db, slug, exceptId) {
    const rows = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.slug, slug), exceptId === null ? undefined : ne(events.id, exceptId)))
      .limit(1);
    return rows.length > 0;
  },

  async create(db, draft) {
    const [created] = await db.insert(events).values(draft).returning(eventColumns);
    return created as Event;
  },

  async update(db, id, changes) {
    const [updated] = await db.update(events).set(changes).where(eq(events.id, id)).returning(eventColumns);
    if (updated === undefined) throw new Error(`Event ${id} vanished during an update`);
    return updated;
  },

  async delete(db, id) {
    await db.delete(events).where(eq(events.id, id));
  },

  async listForOrganizerWithSales(db, organizerId) {
    // The paid-only condition sits in the join, so events with no sales still appear (with 0).
    return db
      .select({
        id: events.id,
        title: events.title,
        slug: events.slug,
        status: events.status,
        startsAt: events.startsAt,
        ticketsSold: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`.mapWith(Number),
        revenueCents: sql<number>`coalesce(sum(${orderItems.quantity} * ${orderItems.unitPriceCents}), 0)`.mapWith(Number),
      })
      .from(events)
      .leftJoin(orders, and(eq(orders.eventId, events.id), eq(orders.status, "paid")))
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(eq(events.organizerId, organizerId))
      .groupBy(events.id)
      .orderBy(asc(events.startsAt), asc(events.id));
  },
};
