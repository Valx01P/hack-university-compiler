// In-memory stand-ins for every repository, and a fake database whose transactions roll back
// like real ones. They follow the repository interfaces, so services cannot tell them from
// PostgreSQL, and unit and API tests run in milliseconds without a database.
// What they cannot copy (full text stemming, locking, collation) the int tests cover.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/app.ts";
import { now } from "../../src/clock.ts";
import { loadConfig } from "../../src/config.ts";
import type { Db, Tx } from "../../src/db/tx.ts";
import { ConflictError } from "../../src/http/errors.ts";
import { createLogger } from "../../src/logger.ts";
import type { AuditEntry, AuditRepository, NewAuditEntry } from "../../src/modules/audit/audit.repository.ts";
import type { RefreshToken, RefreshTokensRepository } from "../../src/modules/auth/refresh-tokens.repository.ts";
import type { User, UsersRepository } from "../../src/modules/auth/users.repository.ts";
import type { Event, EventsRepository, EventWithVenue } from "../../src/modules/events/events.repository.ts";
import type { FavoritesRepository } from "../../src/modules/favorites/favorites.repository.ts";
import { Readiness } from "../../src/modules/health/health.routes.ts";
import type { Notification, NotificationsRepository } from "../../src/modules/notifications/notifications.repository.ts";
import type { Order, OrderDetail, OrderItem, OrdersRepository } from "../../src/modules/orders/orders.repository.ts";
import type { TicketType, TicketTypesRepository } from "../../src/modules/ticket-types/ticket-types.repository.ts";
import type { Venue, VenuesRepository } from "../../src/modules/venues/venues.repository.ts";
import { createServices, type Repositories } from "../../src/services.ts";
import { demoRows } from "../../scripts/seed-data.ts";

export type FakeStore = {
  users: User[];
  refreshTokens: RefreshToken[];
  venues: Venue[];
  events: Event[];
  ticketTypes: TicketType[];
  orders: Order[];
  orderItems: OrderItem[];
  favorites: Array<{ userId: number; eventId: number; createdAt: Date }>;
  audit: AuditEntry[];
  notifications: Notification[];
};

export type Fakes = {
  store: FakeStore;
  db: Db;
  repositories: Repositories;
  /** Every transaction the fake database ran, in order, so a test can check which tx a hook got. */
  transactions: Tx[];
  /** What each audit insert received: the db or tx, and the entry. */
  auditWrites: Array<{ db: unknown; entry: NewAuditEntry }>;
};

export function emptyStore(): FakeStore {
  return {
    users: [],
    refreshTokens: [],
    venues: [],
    events: [],
    ticketTypes: [],
    orders: [],
    orderItems: [],
    favorites: [],
    audit: [],
    notifications: [],
  };
}

/** The same rows npm run db:seed loads, in memory. */
export function demoStore(): FakeStore {
  const rows = demoRows();
  return { ...emptyStore(), ...rows, users: rows.users };
}

const nextId = (rows: Array<{ id: number }>) => rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;

/** An error shaped like the one pg throws for a unique violation, so services handle it the same way. */
function uniqueViolation(constraint: string): Error {
  return Object.assign(new Error(`duplicate key value violates unique constraint "${constraint}"`), { code: "23505", constraint });
}

export function makeFakes(store: FakeStore = demoStore()): Fakes {
  const transactions: Tx[] = [];
  const auditWrites: Fakes["auditWrites"] = [];

  const db = {
    // Like BEGIN ... COMMIT: if fn throws, every change it made is undone.
    async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      const tx = { fakeTransaction: transactions.length + 1 } as unknown as Tx;
      transactions.push(tx);
      const snapshot = structuredClone(store);
      try {
        return await fn(tx);
      } catch (err) {
        Object.assign(store, snapshot);
        throw err;
      }
    },
  } as unknown as Db;

  const withVenue = (event: Event): EventWithVenue => {
    const venue = store.venues.find((v) => v.id === event.venueId);
    if (venue === undefined) throw new Error(`Fake event ${event.id} has no venue ${event.venueId}`);
    return { ...event, venue: { id: venue.id, name: venue.name, city: venue.city, address: venue.address, capacity: venue.capacity } };
  };

  const paidItems = () => {
    const paid = new Set(store.orders.filter((o) => o.status === "paid").map((o) => o.id));
    return store.orderItems.filter((item) => paid.has(item.orderId));
  };

  const users: UsersRepository = {
    async findById(_db, id) {
      return store.users.find((u) => u.id === id) ?? null;
    },
    async findByEmail(_db, email) {
      return store.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
    },
    async create(_db, user) {
      if (store.users.some((u) => u.email.toLowerCase() === user.email.toLowerCase())) {
        throw new ConflictError("email-taken", "An account with this email already exists");
      }
      const created = { ...user, email: user.email.toLowerCase(), id: nextId(store.users), createdAt: now(), updatedAt: now() };
      store.users.push(created);
      return created;
    },
    async updatePasswordHash(_db, id, passwordHash) {
      const user = store.users.find((u) => u.id === id);
      if (user !== undefined) Object.assign(user, { passwordHash, updatedAt: now() });
    },
  };

  const refreshTokens: RefreshTokensRepository = {
    async create(_db, token) {
      const created = { ...token, id: nextId(store.refreshTokens), revokedAt: null, replacedById: null, createdAt: now() };
      store.refreshTokens.push(created);
      return created;
    },
    async findByHash(_db, tokenHash) {
      return store.refreshTokens.find((t) => t.tokenHash === tokenHash) ?? null;
    },
    async findByHashForUpdate(_tx, tokenHash) {
      return store.refreshTokens.find((t) => t.tokenHash === tokenHash) ?? null;
    },
    async markRotated(_tx, id, change) {
      const token = store.refreshTokens.find((t) => t.id === id);
      if (token !== undefined) Object.assign(token, change);
    },
    async revokeFamily(_db, familyId, revokedAt) {
      const live = store.refreshTokens.filter((t) => t.familyId === familyId && t.revokedAt === null);
      for (const token of live) token.revokedAt = revokedAt;
      return live.length;
    },
  };

  const venues: VenuesRepository = {
    async list() {
      return [...store.venues].sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name) || a.id - b.id);
    },
    async findById(_db, id) {
      return store.venues.find((v) => v.id === id) ?? null;
    },
    async create(_db, venue) {
      if (store.venues.some((v) => v.name === venue.name && v.city === venue.city)) {
        throw new ConflictError("venue-exists", "A venue with this name already exists in this city");
      }
      const created = { ...venue, id: nextId(store.venues), createdAt: now(), updatedAt: now() };
      store.venues.push(created);
      return created;
    },
    async update(_db, id, changes) {
      const venue = store.venues.find((v) => v.id === id);
      if (venue === undefined) return null;
      Object.assign(venue, changes, { updatedAt: now() });
      return { ...venue };
    },
  };

  // An approximation of websearch_to_tsquery: every word must appear (a minus excludes it,
  // quotes keep a phrase together). No stemming: the int tests check the real thing.
  const matchesSearch = (event: Event, q: string) => {
    const text = `${event.title} ${event.description}`.toLowerCase();
    const terms = q.toLowerCase().match(/-?"[^"]+"|-?\S+/g) ?? [];
    return terms.every((term) => {
      const excluded = term.startsWith("-");
      const found = text.includes(term.replace(/^-/, "").replaceAll('"', ""));
      return excluded ? !found : found;
    });
  };

  const events: EventsRepository = {
    async list(_db, query) {
      const byStart = query.sort.endsWith("startsAt");
      const descending = query.sort.startsWith("-");
      const keyOf = (e: Event) => (byStart ? e.startsAt.toISOString() : e.title);
      const compare = (a: Event, b: Event) => {
        const order = keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : a.id - b.id;
        return descending ? -order : order;
      };
      const after = query.after;
      const afterKey = after === undefined ? "" : byStart ? new Date(after.key).toISOString() : after.key;
      return store.events
        .map(withVenue)
        .filter((e) => query.statuses.includes(e.status))
        .filter((e) => query.city === undefined || e.venue.city.toLowerCase() === query.city.toLowerCase())
        .filter((e) => query.categories === undefined || query.categories.includes(e.category))
        .filter((e) => query.from === undefined || e.startsAt >= query.from)
        .filter((e) => query.to === undefined || e.startsAt < query.to)
        .filter((e) => query.q === undefined || matchesSearch(e, query.q))
        .filter((e) => {
          if (after === undefined) return true;
          const order = keyOf(e) < afterKey ? -1 : keyOf(e) > afterKey ? 1 : e.id - after.id;
          return descending ? order < 0 : order > 0;
        })
        .sort(compare)
        .slice(0, query.limit);
    },
    async findById(_db, id) {
      const event = store.events.find((e) => e.id === id);
      return event === undefined ? null : withVenue(event);
    },
    async findBySlug(_db, slug) {
      const event = store.events.find((e) => e.slug === slug);
      return event === undefined ? null : withVenue(event);
    },
    async findByIdForUpdate(_tx, id) {
      const event = store.events.find((e) => e.id === id);
      return event === undefined ? null : { ...event };
    },
    async slugExists(_db, slug, exceptId) {
      return store.events.some((e) => e.slug === slug && e.id !== exceptId);
    },
    async create(_db, draft) {
      if (store.events.some((e) => e.slug === draft.slug)) throw uniqueViolation("events_slug_unique");
      const created: Event = {
        posterPath: null,
        publishedAt: null,
        cancelledAt: null,
        status: "draft",
        ...draft,
        id: nextId(store.events),
        createdAt: now(),
        updatedAt: now(),
      };
      store.events.push(created);
      return { ...created };
    },
    async update(_db, id, changes) {
      const event = store.events.find((e) => e.id === id);
      if (event === undefined) throw new Error(`Event ${id} vanished during an update`);
      Object.assign(event, changes, { updatedAt: now() });
      return { ...event };
    },
    async delete(_db, id) {
      store.events = store.events.filter((e) => e.id !== id);
      store.ticketTypes = store.ticketTypes.filter((t) => t.eventId !== id);
      store.favorites = store.favorites.filter((f) => f.eventId !== id);
    },
    async listForOrganizerWithSales(_db, organizerId) {
      const items = paidItems();
      const orderEvent = new Map(store.orders.map((o) => [o.id, o.eventId]));
      return store.events
        .filter((e) => e.organizerId === organizerId)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id - b.id)
        .map((e) => {
          const mine = items.filter((item) => orderEvent.get(item.orderId) === e.id);
          return {
            id: e.id,
            title: e.title,
            slug: e.slug,
            status: e.status,
            startsAt: e.startsAt,
            ticketsSold: mine.reduce((sum, item) => sum + item.quantity, 0),
            revenueCents: mine.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0),
          };
        });
    },
  };

  const ticketTypes: TicketTypesRepository = {
    async listForEvent(_db, eventId) {
      return store.ticketTypes
        .filter((t) => t.eventId === eventId)
        .sort((a, b) => a.priceCents - b.priceCents || a.id - b.id)
        .map((t) => ({ ...t }));
    },
    async listForSale(_db, ids) {
      return store.ticketTypes
        .filter((t) => ids.includes(t.id))
        .sort((a, b) => a.id - b.id)
        .map((t) => {
          const event = store.events.find((e) => e.id === t.eventId);
          if (event === undefined) throw new Error(`Fake ticket type ${t.id} has no event`);
          return { ...t, event: { id: event.id, title: event.title, status: event.status, startsAt: event.startsAt } };
        });
    },
    async create(_db, ticketType) {
      if (store.ticketTypes.some((t) => t.eventId === ticketType.eventId && t.name === ticketType.name)) {
        throw new ConflictError("ticket-type-exists", `This event already has a ticket type named "${ticketType.name}"`);
      }
      const created = { ...ticketType, id: nextId(store.ticketTypes), sold: 0, createdAt: now(), updatedAt: now() };
      store.ticketTypes.push(created);
      return { ...created };
    },
    async totalCapacity(_db, eventId) {
      return store.ticketTypes.filter((t) => t.eventId === eventId).reduce((sum, t) => sum + t.capacity, 0);
    },
    async lowestPrices(_db, eventIds) {
      const lowest = new Map<number, number>();
      for (const t of store.ticketTypes) {
        if (!eventIds.includes(t.eventId)) continue;
        lowest.set(t.eventId, Math.min(lowest.get(t.eventId) ?? Number.POSITIVE_INFINITY, t.priceCents));
      }
      return lowest;
    },
    async reserve(_tx, id, quantity) {
      const ticketType = store.ticketTypes.find((t) => t.id === id);
      if (ticketType === undefined || ticketType.sold + quantity > ticketType.capacity) return null;
      ticketType.sold += quantity;
      ticketType.updatedAt = now();
      return { ...ticketType };
    },
    async release(_tx, id, quantity) {
      const ticketType = store.ticketTypes.find((t) => t.id === id);
      if (ticketType !== undefined) ticketType.sold -= quantity;
    },
    async resetSoldForEvent(_tx, eventId) {
      for (const t of store.ticketTypes) if (t.eventId === eventId) t.sold = 0;
    },
    async listSoldOutForOrganizer(_db, organizerId) {
      const mine = new Set(store.events.filter((e) => e.organizerId === organizerId).map((e) => e.id));
      return store.ticketTypes
        .filter((t) => mine.has(t.eventId) && t.sold >= t.capacity)
        .sort((a, b) => a.eventId - b.eventId || a.id - b.id)
        .map((t) => ({ id: t.id, eventId: t.eventId, name: t.name }));
    },
  };

  const detail = (order: Order): OrderDetail => {
    const event = store.events.find((e) => e.id === order.eventId);
    if (event === undefined) throw new Error(`Fake order ${order.id} has no event`);
    const items = store.orderItems
      .filter((item) => item.orderId === order.id)
      .sort((a, b) => a.ticketTypeId - b.ticketTypeId)
      .map((item) => ({ ...item, ticketTypeName: store.ticketTypes.find((t) => t.id === item.ticketTypeId)?.name ?? "?" }));
    return { ...order, event: { id: event.id, title: event.title, slug: event.slug, startsAt: event.startsAt }, items };
  };

  const orders: OrdersRepository = {
    async findByIdempotencyKey(_db, customerId, key) {
      const order = store.orders.find((o) => o.customerId === customerId && o.idempotencyKey === key);
      return order === undefined ? null : detail(order);
    },
    async create(_tx, order, items) {
      if (store.orders.some((o) => o.customerId === order.customerId && o.idempotencyKey === order.idempotencyKey)) {
        throw uniqueViolation("orders_customer_id_idempotency_key_unique");
      }
      const created: Order = { ...order, id: nextId(store.orders), status: "paid", cancelledAt: null, createdAt: now(), updatedAt: now() };
      store.orders.push(created);
      const createdItems = items.map((item) => {
        const row = { ...item, id: nextId(store.orderItems), orderId: created.id };
        store.orderItems.push(row);
        return row;
      });
      return { order: { ...created }, items: createdItems };
    },
    async findById(_db, id) {
      const order = store.orders.find((o) => o.id === id);
      return order === undefined ? null : detail(order);
    },
    async findForCustomer(_db, customerId, orderId) {
      const order = store.orders.find((o) => o.id === orderId && o.customerId === customerId);
      return order === undefined ? null : detail(order);
    },
    async lockById(_tx, id) {
      const order = store.orders.find((o) => o.id === id);
      return order === undefined ? null : { ...order };
    },
    async itemsOf(_db, orderId) {
      return store.orderItems.filter((item) => item.orderId === orderId).sort((a, b) => a.ticketTypeId - b.ticketTypeId);
    },
    async listForCustomer(_db, customerId, { after, limit }) {
      const newestFirst = (a: Order, b: Order) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id;
      return store.orders
        .filter((o) => o.customerId === customerId)
        .filter((o) => after === undefined || newestFirst(o, { ...o, createdAt: after.createdAt, id: after.id }) > 0)
        .sort(newestFirst)
        .slice(0, limit)
        .map((o) => {
          const event = store.events.find((e) => e.id === o.eventId);
          const items = store.orderItems.filter((item) => item.orderId === o.id);
          return {
            id: o.id,
            status: o.status,
            eventId: o.eventId,
            totalCents: o.totalCents,
            createdAt: o.createdAt,
            paidAt: o.paidAt,
            cancelledAt: o.cancelledAt,
            eventTitle: event?.title ?? "?",
            eventStartsAt: event?.startsAt ?? new Date(0),
            ticketCount: items.reduce((sum, item) => sum + item.quantity, 0),
          };
        });
    },
    async markCancelled(_tx, id, at) {
      const order = store.orders.find((o) => o.id === id);
      if (order === undefined) throw new Error(`Order ${id} vanished during an update`);
      Object.assign(order, { status: "cancelled", cancelledAt: at, updatedAt: now() });
      return { ...order };
    },
    async cancelPaidForEvent(_tx, eventId, at) {
      const cancelled = store.orders.filter((o) => o.eventId === eventId && o.status === "paid");
      for (const order of cancelled) Object.assign(order, { status: "cancelled", cancelledAt: at, updatedAt: now() });
      return cancelled.map((o) => ({ ...o }));
    },
  };

  const favorites: FavoritesRepository = {
    async add(_db, userId, eventId) {
      if (!store.favorites.some((f) => f.userId === userId && f.eventId === eventId)) {
        store.favorites.push({ userId, eventId, createdAt: now() });
      }
    },
    async remove(_db, userId, eventId) {
      const before = store.favorites.length;
      store.favorites = store.favorites.filter((f) => !(f.userId === userId && f.eventId === eventId));
      return store.favorites.length < before;
    },
    async listEvents(_db, userId) {
      return store.favorites
        .filter((f) => f.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.eventId - a.eventId)
        .map((f) => {
          const event = store.events.find((e) => e.id === f.eventId);
          if (event === undefined) throw new Error(`Fake favorite of a missing event ${f.eventId}`);
          return { ...withVenue(event), favoritedAt: f.createdAt };
        });
    },
  };

  const audit: AuditRepository = {
    async insert(db, entry) {
      auditWrites.push({ db, entry });
      store.audit.push({ ...entry, id: nextId(store.audit), createdAt: now() });
    },
    async listForEntity(_db, entity, entityId) {
      return store.audit.filter((a) => a.entity === entity && a.entityId === entityId);
    },
  };

  const notifications: NotificationsRepository = {
    async insertMany(_db, rows) {
      for (const row of rows) store.notifications.push({ ...row, id: nextId(store.notifications), readAt: null, createdAt: now() });
      return rows.length;
    },
    async listForUser(_db, userId, limit) {
      return store.notifications.filter((n) => n.userId === userId).slice(-limit).reverse();
    },
  };

  return {
    store,
    db,
    transactions,
    auditWrites,
    repositories: { users, refreshTokens, venues, events, ticketTypes, orders, favorites, audit, notifications },
  };
}

/**
 * The whole app on fakes: the real routes, middleware, services, and hooks, with in-memory
 * repositories underneath. Uploads go to a fresh temporary folder.
 */
export function makeTestApp(options: { fakes?: Fakes; env?: Record<string, string> } = {}) {
  const fakes = options.fakes ?? makeFakes();
  const uploadDir = mkdtempSync(join(tmpdir(), "stagepass-test-"));
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://fake:fake@localhost:5432/unused",
    UPLOAD_DIR: uploadDir,
    LOG_LEVEL: "silent",
    ...options.env,
  });
  const logger = createLogger(config);
  const { services, hooks, tokens, posters } = createServices({ db: fakes.db, repositories: fakes.repositories, config, logger });
  const readiness = new Readiness();
  const app = createApp({ config, logger, services, tokens, posters, readiness, checkDatabase: async () => {} });
  return { app, fakes, services, hooks, readiness, uploadDir };
}
