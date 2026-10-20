// The rules for ticket types: who sees them (the event's visibility decides), who adds them
// (its organizer or an admin), and that an event never offers more seats than its venue has.
import type { Db } from "../../db/tx.ts";
import type { AuthUser } from "../../http/auth.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "../../http/errors.ts";
import { canEditEvent, canViewEvent } from "../events/events.policy.ts";
import type { EventsRepository } from "../events/events.repository.ts";
import type { CreateTicketType } from "./ticket-types.schemas.ts";
import type { TicketType, TicketTypesRepository } from "./ticket-types.repository.ts";

export type TicketTypesServiceDeps = { db: Db; events: EventsRepository; ticketTypes: TicketTypesRepository };

export class TicketTypesService {
  readonly #deps: TicketTypesServiceDeps;

  constructor(deps: TicketTypesServiceDeps) {
    this.#deps = deps;
  }

  /** A draft's ticket types are as private as the draft: anyone else gets a 404. */
  async listForEvent(user: AuthUser | null | undefined, eventId: number): Promise<TicketType[]> {
    const { db, events, ticketTypes } = this.#deps;
    const event = await events.findById(db, eventId);
    if (event === null) throw new NotFoundError(`No event with id ${eventId}`);
    return ticketTypes.listForEvent(db, eventId);
  }

  async create(user: AuthUser, eventId: number, input: CreateTicketType): Promise<TicketType> {
    const { db, events, ticketTypes } = this.#deps;
    const event = await events.findById(db, eventId);
    if (event === null || !canViewEvent(user, event)) throw new NotFoundError(`No event with id ${eventId}`);
    if (!canEditEvent(user, event)) throw new ForbiddenError("Only the event's organizer or an admin can add ticket types");
    if (event.status === "cancelled") throw new ConflictError("event-cancelled", "A cancelled event cannot change");

    const offered = await ticketTypes.totalCapacity(db, eventId);
    if (offered + input.capacity > event.venue.capacity) {
      throw new ConflictError(
        "venue-capacity-exceeded",
        `${event.venue.name} holds ${event.venue.capacity}, and this event already offers ${offered} seats`,
        { venueCapacity: event.venue.capacity, offered },
      );
    }
    return ticketTypes.create(db, { eventId, ...input });
  }
}
