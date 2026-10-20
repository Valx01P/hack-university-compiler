// Favorites: events a user wants to keep an eye on. Only events the user can see may be favorited.
import type { Db } from "../../db/tx.ts";
import type { AuthUser } from "../../http/auth.ts";
import { NotFoundError } from "../../http/errors.ts";
import { canViewEvent } from "../events/events.policy.ts";
import type { EventsRepository, EventWithVenue } from "../events/events.repository.ts";
import type { TicketTypesRepository } from "../ticket-types/ticket-types.repository.ts";
import type { FavoritesRepository } from "./favorites.repository.ts";

export type FavoritesServiceDeps = {
  db: Db;
  favorites: FavoritesRepository;
  events: EventsRepository;
  ticketTypes: TicketTypesRepository;
};

export class FavoritesService {
  readonly #deps: FavoritesServiceDeps;

  constructor(deps: FavoritesServiceDeps) {
    this.#deps = deps;
  }

  async list(user: AuthUser): Promise<Array<EventWithVenue & { fromPriceCents: number | null }>> {
    const { db, favorites, ticketTypes } = this.#deps;
    const events = await favorites.listEvents(db, user.id);
    const prices = await ticketTypes.lowestPrices(db, events.map((event) => event.id));
    return events.map((event) => ({ ...event, fromPriceCents: prices.get(event.id) ?? null }));
  }

  /** Idempotent: favoriting an event twice leaves one favorite. */
  async add(user: AuthUser, eventId: number): Promise<void> {
    const { db, favorites, events } = this.#deps;
    const event = await events.findById(db, eventId);
    if (event === null || !canViewEvent(user, event)) throw new NotFoundError(`No event with id ${eventId}`);
    await favorites.add(db, user.id, eventId);
  }

  /** Idempotent too: removing a favorite that is not there is not an error. */
  async remove(user: AuthUser, eventId: number): Promise<void> {
    await this.#deps.favorites.remove(this.#deps.db, user.id, eventId);
  }
}
