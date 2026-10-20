// The view: the JSON clients get for an event. Dates become ISO strings, the poster's storage
// key becomes a URL, and internal columns (the search vector) never leave the server.
import type { z } from "zod";
import type { EventListItem } from "./events.service.ts";
import type { EventResponse, EventSummaryResponse } from "./events.schemas.ts";
import type { EventWithVenue } from "./events.repository.ts";
import { posterUrl } from "./posters.ts";

export function toEventSummaryJson(event: EventListItem): z.infer<typeof EventSummaryResponse> {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    category: event.category,
    status: event.status,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    venue: { id: event.venue.id, name: event.venue.name, city: event.venue.city },
    organizerId: event.organizerId,
    posterUrl: posterUrl(event.posterPath),
    fromPriceCents: event.fromPriceCents,
  };
}

export function toEventJson(event: EventWithVenue): z.infer<typeof EventResponse> {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    category: event.category,
    status: event.status,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    venue: { id: event.venue.id, name: event.venue.name, city: event.venue.city, address: event.venue.address },
    organizerId: event.organizerId,
    posterUrl: posterUrl(event.posterPath),
    publishedAt: event.publishedAt?.toISOString() ?? null,
    cancelledAt: event.cancelledAt?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}
