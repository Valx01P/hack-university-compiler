// What event requests may contain, and the JSON event responses have.
import { z } from "zod";
import { eventCategories, eventStatuses } from "../../db/schema.ts";
import { limitQuery } from "../../http/pagination.ts";
import { idParam, oneOrMany } from "../../http/validate.ts";

export const EventIdParams = z.object({ eventId: idParam });
export type EventIdParams = z.infer<typeof EventIdParams>;

export const Category = z.enum(eventCategories);

const Instant = z.iso.datetime({ offset: true, error: "Expected an ISO time such as 2026-11-14T02:00:00Z" });

/** A date (2026-11-01, midnight UTC) or a full ISO time. */
const DateOrInstant = z.union([z.iso.date(), Instant]).transform((value) => new Date(value));

export const CreateEvent = z
  .strictObject({
    venueId: z.int().positive(),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(5000).default(""),
    category: Category,
    startsAt: Instant.transform((value) => new Date(value)),
    endsAt: Instant.transform((value) => new Date(value)),
  })
  .refine((event) => event.endsAt > event.startsAt, { message: "Must be after startsAt", path: ["endsAt"] });
export type CreateEvent = z.infer<typeof CreateEvent>;

export const UpdateEvent = z
  .strictObject({
    venueId: z.int().positive(),
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(5000),
    category: Category,
    startsAt: Instant.transform((value) => new Date(value)),
    endsAt: Instant.transform((value) => new Date(value)),
  })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, { message: "Send at least one field to change" });
export type UpdateEvent = z.infer<typeof UpdateEvent>;

export const EventSort = z.enum(["startsAt", "-startsAt", "title", "-title"]);

export const ListEventsQuery = z.object({
  city: z.string().trim().min(1).max(60).optional(),
  category: oneOrMany(Category, 4).optional(),
  from: DateOrInstant.optional(),
  to: DateOrInstant.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  sort: EventSort.default("startsAt"),
  cursor: z.string().max(1000).optional(),
  limit: limitQuery(20),
});
export type ListEventsQuery = z.infer<typeof ListEventsQuery>;

const VenueSummary = z.object({ id: z.int(), name: z.string(), city: z.string() });

export const EventSummaryResponse = z.object({
  id: z.int(),
  slug: z.string(),
  title: z.string(),
  category: Category,
  status: z.enum(eventStatuses),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  venue: VenueSummary,
  organizerId: z.int(),
  posterUrl: z.string().nullable(),
  fromPriceCents: z.int().nullable().describe("The cheapest ticket, or null before any ticket type exists"),
});

export const EventResponse = EventSummaryResponse.omit({ fromPriceCents: true }).extend({
  description: z.string(),
  venue: VenueSummary.extend({ address: z.string() }),
  publishedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const EventPageResponse = z.object({
  data: z.array(EventSummaryResponse),
  nextCursor: z.string().nullable(),
});
