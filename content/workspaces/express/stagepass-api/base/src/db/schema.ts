// Every table, in TypeScript: the data half of the model. drizzle-kit compares this file with
// the last snapshot in drizzle/meta to write each SQL migration, and the repositories import
// the tables to build queries. Columns are snake_case in SQL and camelCase here.
//
// Timestamps come from the app's clock ($defaultFn and $onUpdate call now()), not from the
// database, so a frozen clock (HU_FIXED_TIME) gives repeatable rows.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { now } from "../clock.ts";

export const roles = ["admin", "organizer", "customer"] as const;
export const eventCategories = ["music", "comedy", "theater", "talk"] as const;
export const eventStatuses = ["draft", "published", "cancelled"] as const;
export const orderStatuses = ["paid", "cancelled"] as const;

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => timestamptz("created_at").notNull().$defaultFn(() => now());
const updatedAt = () =>
  timestamptz("updated_at")
    .notNull()
    .$defaultFn(() => now())
    .$onUpdate(() => now());

// PostgreSQL's full text type, which Drizzle has no built-in column for.
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const users = pgTable(
  "users",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: roles }).notNull().default("customer"),
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Unique ignoring case, so Ada@x.test and ada@x.test cannot both sign up.
    uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`),
    check("users_role_check", sql`${t.role} in ('admin', 'organizer', 'customer')`),
  ],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Only a SHA-256 of the token is stored, so a leaked table hands out no live tokens.
    tokenHash: text("token_hash").notNull().unique(),
    // Every token rotated from one login shares a family, so reuse can revoke them all.
    familyId: uuid("family_id").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    revokedAt: timestamptz("revoked_at"),
    replacedById: integer("replaced_by_id").references((): AnyPgColumn => refreshTokens.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("refresh_tokens_family_idx").on(t.familyId), index("refresh_tokens_user_idx").on(t.userId)],
);

export const venues = pgTable(
  "venues",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    address: text("address").notNull(),
    capacity: integer("capacity").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("venues_name_city_unique").on(t.name, t.city),
    check("venues_capacity_check", sql`${t.capacity} > 0`),
  ],
);

export const events = pgTable(
  "events",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    organizerId: integer("organizer_id")
      .notNull()
      .references(() => users.id),
    venueId: integer("venue_id")
      .notNull()
      .references(() => venues.id),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    category: text("category", { enum: eventCategories }).notNull(),
    status: text("status", { enum: eventStatuses }).notNull().default("draft"),
    startsAt: timestamptz("starts_at").notNull(),
    endsAt: timestamptz("ends_at").notNull(),
    // A storage key under UPLOAD_DIR, such as posters/<uuid>.png. Never a client's file name.
    posterPath: text("poster_path"),
    publishedAt: timestamptz("published_at"),
    cancelledAt: timestamptz("cancelled_at"),
    // Kept up to date by PostgreSQL itself: title words weigh more (A) than description words (B).
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', "title"), 'A') || setweight(to_tsvector('english', "description"), 'B')`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("events_category_check", sql`${t.category} in ('music', 'comedy', 'theater', 'talk')`),
    check("events_status_check", sql`${t.status} in ('draft', 'published', 'cancelled')`),
    check("events_ends_after_starts_check", sql`${t.endsAt} > ${t.startsAt}`),
    // Serves the public list: published events in start order, with id as the tiebreaker.
    index("events_status_starts_at_idx").on(t.status, t.startsAt, t.id),
    index("events_organizer_idx").on(t.organizerId),
    index("events_venue_idx").on(t.venueId),
    index("events_search_idx").using("gin", t.search),
  ],
);

export const ticketTypes = pgTable(
  "ticket_types",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull(),
    capacity: integer("capacity").notNull(),
    sold: integer("sold").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("ticket_types_event_id_name_unique").on(t.eventId, t.name),
    check("ticket_types_price_check", sql`${t.priceCents} >= 0`),
    check("ticket_types_capacity_check", sql`${t.capacity} > 0`),
    check("ticket_types_sold_check", sql`${t.sold} >= 0`),
    // The last line of defense against overselling, whatever the code above it does.
    check("ticket_types_sold_within_capacity_check", sql`${t.sold} <= ${t.capacity}`),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => users.id),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id),
    status: text("status", { enum: orderStatuses }).notNull().default("paid"),
    totalCents: integer("total_cents").notNull(),
    // The client's Idempotency-Key: a retried checkout finds its first order instead of buying twice.
    idempotencyKey: text("idempotency_key").notNull(),
    paidAt: timestamptz("paid_at").notNull(),
    cancelledAt: timestamptz("cancelled_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("orders_customer_id_idempotency_key_unique").on(t.customerId, t.idempotencyKey),
    check("orders_status_check", sql`${t.status} in ('paid', 'cancelled')`),
    check("orders_total_check", sql`${t.totalCents} >= 0`),
    index("orders_event_idx").on(t.eventId),
    // Matches "my orders, newest first" (ORDER BY created_at DESC, id DESC), so the list reads
    // the index in order and stops early. DESC sorts nulls first in PostgreSQL, so the index must too.
    index("orders_customer_idx").on(t.customerId, t.createdAt.desc().nullsFirst(), t.id.desc().nullsFirst()),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    ticketTypeId: integer("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id),
    quantity: integer("quantity").notNull(),
    // The price when the order was paid, so later price changes never rewrite history.
    unitPriceCents: integer("unit_price_cents").notNull(),
  },
  (t) => [
    unique("order_items_order_id_ticket_type_id_unique").on(t.orderId, t.ticketTypeId),
    index("order_items_ticket_type_idx").on(t.ticketTypeId),
    check("order_items_quantity_check", sql`${t.quantity} between 1 and 10`),
    check("order_items_unit_price_check", sql`${t.unitPriceCents} >= 0`),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: integer("entity_id").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamptz("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const favorites = pgTable(
  "favorites",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.eventId] })],
);
