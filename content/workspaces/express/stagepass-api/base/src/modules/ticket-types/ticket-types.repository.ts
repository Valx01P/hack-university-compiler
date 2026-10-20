// Every query on ticket_types, including the two that move `sold`. reserve() is an atomic
// conditional update: it adds to sold only if the result still fits the capacity, in one
// statement, so two buyers can never both take the last seat.
import { and, asc, eq, inArray, min, sql, sum } from "drizzle-orm";
import { events, ticketTypes } from "../../db/schema.ts";
import { type DbOrTx, pgConstraint, pgErrorCode, type Tx } from "../../db/tx.ts";
import { ConflictError } from "../../http/errors.ts";
import type { EventStatus } from "../events/events.repository.ts";

export type TicketType = typeof ticketTypes.$inferSelect;
export type NewTicketType = Pick<TicketType, "eventId" | "name" | "priceCents" | "capacity">;
/** A ticket type with what checkout needs to know about its event. */
export type TicketTypeForSale = TicketType & {
  event: { id: number; title: string; status: EventStatus; startsAt: Date };
};

export interface TicketTypesRepository {
  listForEvent(db: DbOrTx, eventId: number): Promise<TicketType[]>;
  listForSale(db: DbOrTx, ids: number[]): Promise<TicketTypeForSale[]>;
  /** Throws ConflictError when the event already has a ticket type with this name. */
  create(db: DbOrTx, ticketType: NewTicketType): Promise<TicketType>;
  totalCapacity(db: DbOrTx, eventId: number): Promise<number>;
  /** The cheapest price of each event that has ticket types, in one query for a whole page. */
  lowestPrices(db: DbOrTx, eventIds: number[]): Promise<Map<number, number>>;
  /** Adds quantity to sold if it fits. Null means sold out (nothing changed). */
  reserve(tx: Tx, id: number, quantity: number): Promise<TicketType | null>;
  /** Gives quantity back, when an order is cancelled. */
  release(tx: Tx, id: number, quantity: number): Promise<void>;
  /** A cancelled event sells nothing, so its counts go back to zero with its orders. */
  resetSoldForEvent(tx: Tx, eventId: number): Promise<void>;
  listSoldOutForOrganizer(db: DbOrTx, organizerId: number): Promise<Array<{ id: number; eventId: number; name: string }>>;
}

export const ticketTypesRepository: TicketTypesRepository = {
  async listForEvent(db, eventId) {
    return db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId)).orderBy(asc(ticketTypes.priceCents), asc(ticketTypes.id));
  },

  async listForSale(db, ids) {
    if (ids.length === 0) return [];
    return db
      .select({
        id: ticketTypes.id,
        eventId: ticketTypes.eventId,
        name: ticketTypes.name,
        priceCents: ticketTypes.priceCents,
        capacity: ticketTypes.capacity,
        sold: ticketTypes.sold,
        createdAt: ticketTypes.createdAt,
        updatedAt: ticketTypes.updatedAt,
        event: { id: events.id, title: events.title, status: events.status, startsAt: events.startsAt },
      })
      .from(ticketTypes)
      .innerJoin(events, eq(events.id, ticketTypes.eventId))
      .where(inArray(ticketTypes.id, ids))
      .orderBy(asc(ticketTypes.id));
  },

  async create(db, ticketType) {
    try {
      const [created] = await db.insert(ticketTypes).values(ticketType).returning();
      return created as TicketType;
    } catch (err) {
      if (pgErrorCode(err) === "23505" && pgConstraint(err) === "ticket_types_event_id_name_unique") {
        throw new ConflictError("ticket-type-exists", `This event already has a ticket type named "${ticketType.name}"`);
      }
      throw err;
    }
  },

  async totalCapacity(db, eventId) {
    const [row] = await db
      .select({ total: sum(ticketTypes.capacity).mapWith(Number) })
      .from(ticketTypes)
      .where(eq(ticketTypes.eventId, eventId));
    return row?.total ?? 0;
  },

  async lowestPrices(db, eventIds) {
    if (eventIds.length === 0) return new Map();
    const rows = await db
      .select({ eventId: ticketTypes.eventId, lowest: min(ticketTypes.priceCents) })
      .from(ticketTypes)
      .where(inArray(ticketTypes.eventId, eventIds))
      .groupBy(ticketTypes.eventId);
    return new Map(rows.flatMap((row) => (row.lowest === null ? [] : [[row.eventId, row.lowest] as const])));
  },

  async reserve(tx, id, quantity) {
    // The WHERE re-checks capacity at the moment of the write, under the row lock UPDATE takes.
    const [updated] = await tx
      .update(ticketTypes)
      .set({ sold: sql`${ticketTypes.sold} + ${quantity}` })
      .where(and(eq(ticketTypes.id, id), sql`${ticketTypes.sold} + ${quantity} <= ${ticketTypes.capacity}`))
      .returning();
    return updated ?? null;
  },

  async release(tx, id, quantity) {
    await tx
      .update(ticketTypes)
      .set({ sold: sql`${ticketTypes.sold} - ${quantity}` })
      .where(eq(ticketTypes.id, id));
  },

  async resetSoldForEvent(tx, eventId) {
    await tx.update(ticketTypes).set({ sold: 0 }).where(eq(ticketTypes.eventId, eventId));
  },

  async listSoldOutForOrganizer(db, organizerId) {
    return db
      .select({ id: ticketTypes.id, eventId: ticketTypes.eventId, name: ticketTypes.name })
      .from(ticketTypes)
      .innerJoin(events, eq(events.id, ticketTypes.eventId))
      .where(and(eq(events.organizerId, organizerId), sql`${ticketTypes.sold} >= ${ticketTypes.capacity}`))
      .orderBy(asc(ticketTypes.eventId), asc(ticketTypes.id));
  },
};
