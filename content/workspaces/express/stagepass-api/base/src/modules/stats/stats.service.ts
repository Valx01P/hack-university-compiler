// Sales numbers for organizers: per event, tickets sold and revenue from paid orders, and which
// ticket types are sold out. Two grouped queries, however many events the organizer has.
import type { Db } from "../../db/tx.ts";
import type { AuthUser } from "../../http/auth.ts";
import type { EventsRepository, OrganizerEventSales } from "../events/events.repository.ts";
import type { TicketTypesRepository } from "../ticket-types/ticket-types.repository.ts";

export type OrganizerStats = {
  totals: { events: number; ticketsSold: number; revenueCents: number };
  events: Array<OrganizerEventSales & { soldOutTicketTypes: string[] }>;
};

export class StatsService {
  readonly #db: Db;
  readonly #events: EventsRepository;
  readonly #ticketTypes: TicketTypesRepository;

  constructor(deps: { db: Db; events: EventsRepository; ticketTypes: TicketTypesRepository }) {
    this.#db = deps.db;
    this.#events = deps.events;
    this.#ticketTypes = deps.ticketTypes;
  }

  /** The organizer's events with their sales, soonest first. */
  organizerEvents(user: AuthUser): Promise<OrganizerEventSales[]> {
    return this.#events.listForOrganizerWithSales(this.#db, user.id);
  }

  async organizerStats(user: AuthUser): Promise<OrganizerStats> {
    const [events, soldOut] = await Promise.all([
      this.#events.listForOrganizerWithSales(this.#db, user.id),
      this.#ticketTypes.listSoldOutForOrganizer(this.#db, user.id),
    ]);
    const soldOutNames = new Map<number, string[]>();
    for (const ticketType of soldOut) {
      soldOutNames.set(ticketType.eventId, [...(soldOutNames.get(ticketType.eventId) ?? []), ticketType.name]);
    }
    return {
      totals: {
        events: events.length,
        ticketsSold: events.reduce((sum, event) => sum + event.ticketsSold, 0),
        revenueCents: events.reduce((sum, event) => sum + event.revenueCents, 0),
      },
      events: events.map((event) => ({ ...event, soldOutTicketTypes: soldOutNames.get(event.id) ?? [] })),
    };
  }
}
