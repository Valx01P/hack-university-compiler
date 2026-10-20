// The rules for events: who sees and changes what (events.policy.ts), the draft, published,
// cancelled lifecycle, and the writes that must happen together, in one transaction with the
// hooks. Repositories do the queries, and no HTTP object ever reaches this file.
import type { Logger } from "pino";
import { z } from "zod";
import { now } from "../../clock.ts";
import { type Db, type Tx, withTx } from "../../db/tx.ts";
import type { HookRegistry } from "../../hooks/registry.ts";
import type { AuthUser } from "../../http/auth.ts";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableError,
  UnsupportedMediaTypeError,
  ValidationError,
} from "../../http/errors.ts";
import { decodeCursor, type Page, toPage } from "../../http/pagination.ts";
import type { NotificationsRepository } from "../notifications/notifications.repository.ts";
import type { OrdersRepository } from "../orders/orders.repository.ts";
import type { TicketTypesRepository } from "../ticket-types/ticket-types.repository.ts";
import type { VenuesRepository } from "../venues/venues.repository.ts";
import type { CreateEvent, ListEventsQuery, UpdateEvent } from "./events.schemas.ts";
import { canEditEvent, canViewEvent } from "./events.policy.ts";
import type { Event, EventSort, EventWithVenue, EventsRepository } from "./events.repository.ts";
import { type PosterStorage, sniffImageType } from "./posters.ts";

export type EventListItem = EventWithVenue & { fromPriceCents: number | null };

export type EventsServiceDeps = {
  db: Db;
  events: EventsRepository;
  venues: VenuesRepository;
  ticketTypes: TicketTypesRepository;
  orders: OrdersRepository;
  notifications: NotificationsRepository;
  hooks: HookRegistry;
  posters: PosterStorage;
  logger: Logger;
};

const ACCEPTED_POSTER_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" };

function sortKey(event: Event, sort: EventSort): string {
  return sort.endsWith("startsAt") ? event.startsAt.toISOString() : event.title;
}

export class EventsService {
  readonly #deps: EventsServiceDeps;

  constructor(deps: EventsServiceDeps) {
    this.#deps = deps;
  }

  /** Published events, filtered, sorted, and one page at a time. Two queries whatever the page size. */
  async list(query: ListEventsQuery): Promise<Page<EventListItem>> {
    const { db, events, ticketTypes } = this.#deps;
    const after =
      query.cursor === undefined
        ? undefined
        : decodeCursor(query.cursor, {
            sort: query.sort,
            key: query.sort.endsWith("startsAt") ? z.iso.datetime() : z.string().min(1),
          });
    const rows = await events.list(db, {
      statuses: ["published"],
      city: query.city,
      categories: query.category,
      from: query.from,
      to: query.to,
      q: query.q,
      sort: query.sort,
      after,
      limit: query.limit + 1,
    });
    const page = toPage(rows, query.limit, (event) => ({ sort: query.sort, key: sortKey(event, query.sort), id: event.id }));
    const prices = await ticketTypes.lowestPrices(db, page.data.map((event) => event.id));
    return {
      data: page.data.map((event) => ({ ...event, fromPriceCents: prices.get(event.id) ?? null })),
      nextCursor: page.nextCursor,
    };
  }

  /** Upcoming published events for the public HTML page, soonest first. */
  async listUpcoming(limit = 50): Promise<EventListItem[]> {
    const { db, events, ticketTypes } = this.#deps;
    const rows = await events.list(db, { statuses: ["published"], from: now(), sort: "startsAt", limit });
    const prices = await ticketTypes.lowestPrices(db, rows.map((event) => event.id));
    return rows.map((event) => ({ ...event, fromPriceCents: prices.get(event.id) ?? null }));
  }

  /** One event, if this caller may see it. A draft someone else owns is a 404, not a 403. */
  async get(user: AuthUser | null | undefined, eventId: number): Promise<EventWithVenue> {
    const event = await this.#deps.events.findById(this.#deps.db, eventId);
    if (event === null || !canViewEvent(user, event)) throw new NotFoundError(`No event with id ${eventId}`);
    return event;
  }

  /** The event behind a public page: published or cancelled, never a draft. */
  async getPublicBySlug(slug: string): Promise<EventWithVenue | null> {
    const event = await this.#deps.events.findBySlug(this.#deps.db, slug);
    return event === null || event.status === "draft" ? null : event;
  }

  async create(user: AuthUser, input: CreateEvent): Promise<EventWithVenue> {
    const { db, events, venues, hooks } = this.#deps;
    if (input.startsAt <= now()) {
      throw new UnprocessableError([{ field: "startsAt", message: "Must be in the future" }]);
    }
    const venue = await venues.findById(db, input.venueId);
    if (venue === null) throw new UnprocessableError([{ field: "venueId", message: `No venue with id ${input.venueId}` }]);

    const created = await withTx(db, async (tx) => {
      // Hooks registered for event.beforeCreate fill in the slug and tidy the title.
      const { draft } = await hooks.run("event.beforeCreate", { draft: { ...input, organizerId: user.id }, actor: user }, tx);
      if (draft.slug === undefined) throw new Error("No event.beforeCreate hook set a slug");
      return events.create(tx, { ...draft, slug: draft.slug });
    });
    return { ...created, venue: { id: venue.id, name: venue.name, city: venue.city, address: venue.address, capacity: venue.capacity } };
  }

  async update(user: AuthUser, eventId: number, input: UpdateEvent): Promise<EventWithVenue> {
    const { db, events, venues, hooks } = this.#deps;
    await withTx(db, async (tx) => {
      const event = await this.#lockEditable(tx, user, eventId);
      if (event.status === "cancelled") throw new ConflictError("event-cancelled", "A cancelled event cannot change");
      if (input.venueId !== undefined && (await venues.findById(tx, input.venueId)) === null) {
        throw new UnprocessableError([{ field: "venueId", message: `No venue with id ${input.venueId}` }]);
      }
      const startsAt = input.startsAt ?? event.startsAt;
      if ((input.endsAt ?? event.endsAt) <= startsAt) {
        throw new ValidationError([{ field: "endsAt", message: "Must be after startsAt" }]);
      }
      const { changes } = await hooks.run("event.beforeUpdate", { event, changes: input, actor: user }, tx);
      await events.update(tx, eventId, changes);
    });
    return this.get(user, eventId);
  }

  /** Puts a draft on sale. It needs a future start time and at least one ticket type. */
  async publish(user: AuthUser, eventId: number): Promise<EventWithVenue> {
    const { db, events, ticketTypes, hooks } = this.#deps;
    await withTx(db, async (tx) => {
      const event = await this.#lockEditable(tx, user, eventId);
      if (event.status !== "draft") {
        throw new ConflictError("event-not-draft", `Only a draft can be published, and this event is ${event.status}`);
      }
      if (event.startsAt <= now()) throw new ConflictError("event-in-past", "This event has already started");
      if ((await ticketTypes.listForEvent(tx, eventId)).length === 0) {
        throw new ConflictError("no-ticket-types", "Add at least one ticket type before publishing");
      }
      const published = await events.update(tx, eventId, { status: "published", publishedAt: now() });
      await hooks.run("event.published", { event: published, actor: user }, tx);
    });
    return this.get(user, eventId);
  }

  /**
   * Cancels a draft or a published event. Its paid orders are cancelled in the same transaction,
   * and each customer who bought tickets gets a notification.
   */
  async cancel(user: AuthUser, eventId: number): Promise<EventWithVenue> {
    const { db, events, ticketTypes, orders, notifications, hooks } = this.#deps;
    await withTx(db, async (tx) => {
      const event = await this.#lockEditable(tx, user, eventId);
      if (event.status === "cancelled") throw new ConflictError("event-cancelled", "This event is already cancelled");
      const at = now();
      const cancelledOrders = await orders.cancelPaidForEvent(tx, eventId, at);
      await ticketTypes.resetSoldForEvent(tx, eventId);
      const customers = [...new Set(cancelledOrders.map((order) => order.customerId))];
      await notifications.insertMany(
        tx,
        customers.map((userId) => ({
          userId,
          kind: "event.cancelled",
          payload: {
            eventId,
            title: event.title,
            orderIds: cancelledOrders.filter((order) => order.customerId === userId).map((order) => order.id),
          },
        })),
      );
      const cancelled = await events.update(tx, eventId, { status: "cancelled", cancelledAt: at });
      await hooks.run(
        "event.cancelled",
        { event: cancelled, previousStatus: event.status, cancelledOrderIds: cancelledOrders.map((order) => order.id), actor: user },
        tx,
      );
    });
    return this.get(user, eventId);
  }

  /** Deletes a draft. Anything published has a history (orders, links), so it is cancelled instead. */
  async remove(user: AuthUser, eventId: number): Promise<void> {
    const { db, events, posters } = this.#deps;
    const posterPath = await withTx(db, async (tx) => {
      const event = await this.#lockEditable(tx, user, eventId);
      if (event.status !== "draft") {
        throw new ConflictError("event-not-draft", "Only drafts can be deleted: cancel a published event instead");
      }
      await events.delete(tx, eventId);
      return event.posterPath;
    });
    if (posterPath !== null) await this.#removePosterFile(posterPath);
  }

  /**
   * Stores a new poster. The bytes decide the type, whatever the client claims. The old file is
   * deleted only after the new path is committed, so a failure never leaves the event without one.
   */
  async setPoster(user: AuthUser, eventId: number, file: { buffer: Buffer; mimetype: string }): Promise<EventWithVenue> {
    const { db, events, posters } = this.#deps;
    // Check permissions before writing anything to disk.
    const current = await this.get(user, eventId);
    if (!canEditEvent(user, current)) throw new ForbiddenError("Only the event's organizer or an admin can change its poster");

    const sniffed = sniffImageType(file.buffer);
    if (sniffed === null) throw new UnsupportedMediaTypeError("A poster must be a PNG, JPEG, or WebP image");
    if (ACCEPTED_POSTER_TYPES[file.mimetype] !== sniffed) {
      throw new UnsupportedMediaTypeError(`The file is ${sniffed}, but it was sent as ${file.mimetype}`);
    }

    const key = await posters.save(file.buffer, sniffed);
    let previous: string | null;
    try {
      previous = await withTx(db, async (tx) => {
        const event = await this.#lockEditable(tx, user, eventId);
        if (event.status === "cancelled") throw new ConflictError("event-cancelled", "A cancelled event cannot change");
        await events.update(tx, eventId, { posterPath: key });
        return event.posterPath;
      });
    } catch (err) {
      await this.#removePosterFile(key);
      throw err;
    }
    if (previous !== null) await this.#removePosterFile(previous);
    return this.get(user, eventId);
  }

  /** Locks the event for the rest of the transaction, after checking this user may change it. */
  async #lockEditable(tx: Tx, user: AuthUser, eventId: number): Promise<Event> {
    const event = await this.#deps.events.findByIdForUpdate(tx, eventId);
    if (event === null || !canViewEvent(user, event)) throw new NotFoundError(`No event with id ${eventId}`);
    if (!canEditEvent(user, event)) throw new ForbiddenError("Only the event's organizer or an admin can change it");
    return event;
  }

  async #removePosterFile(key: string): Promise<void> {
    try {
      await this.#deps.posters.remove(key);
    } catch (err) {
      // The database is already right, so a file that could not be deleted is logged, not fatal.
      this.#deps.logger.warn({ err, key }, "could not delete a poster file");
    }
  }
}
