// Server-rendered pages, the "V" of classic MVC: the controller gathers data, shapes it into
// plain strings for the template, and res.render() fills views/*.ejs. Templates stay free of
// logic, and every value goes through <%= %>, which escapes HTML.
import type { RequestHandler } from "express";
import type { EventListItem, EventsService } from "../events/events.service.ts";
import type { EventWithVenue } from "../events/events.repository.ts";
import { posterUrl } from "../events/posters.ts";
import type { TicketType } from "../ticket-types/ticket-types.repository.ts";
import type { TicketTypesService } from "../ticket-types/ticket-types.service.ts";

const PLACEHOLDER = "/static/img/poster-placeholder.webp";
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatPrice(cents: number): string {
  return money.format(cents / 100);
}

function eventCard(event: EventListItem) {
  return {
    slug: event.slug,
    title: event.title,
    category: event.category,
    date: dateFormat.format(event.startsAt),
    place: `${event.venue.name}, ${event.venue.city}`,
    poster: posterUrl(event.posterPath) ?? PLACEHOLDER,
    from: event.fromPriceCents === null ? null : formatPrice(event.fromPriceCents),
  };
}

function eventPage(event: EventWithVenue, ticketTypes: TicketType[]) {
  return {
    title: event.title,
    description: event.description,
    category: event.category,
    cancelled: event.status === "cancelled",
    date: dateFormat.format(event.startsAt),
    venue: event.venue.name,
    address: `${event.venue.address}, ${event.venue.city}`,
    poster: posterUrl(event.posterPath) ?? PLACEHOLDER,
    calendarUrl: `/v1/events/${event.id}/calendar.ics`,
    tickets: ticketTypes.map((ticketType) => ({
      name: ticketType.name,
      price: formatPrice(ticketType.priceCents),
      soldOut: ticketType.sold >= ticketType.capacity,
    })),
  };
}

export class PagesController {
  readonly #events: EventsService;
  readonly #ticketTypes: TicketTypesService;

  constructor(events: EventsService, ticketTypes: TicketTypesService) {
    this.#events = events;
    this.#ticketTypes = ticketTypes;
  }

  home: RequestHandler = async (_req, res) => {
    const events = await this.#events.listUpcoming();
    res.set("Cache-Control", "public, max-age=60");
    res.render("events", { title: "Upcoming events", events: events.map(eventCard) });
  };

  event: RequestHandler = async (req, res) => {
    const slug = String(req.params.slug);
    const event = /^[a-z0-9-]{1,100}$/.test(slug) ? await this.#events.getPublicBySlug(slug) : null;
    if (event === null) {
      res.status(404).render("not-found", { title: "Event not found" });
      return;
    }
    const ticketTypes = await this.#ticketTypes.listForEvent(null, event.id);
    res.set("Cache-Control", "public, max-age=300");
    res.render("event", { title: event.title, event: eventPage(event, ticketTypes) });
  };
}
