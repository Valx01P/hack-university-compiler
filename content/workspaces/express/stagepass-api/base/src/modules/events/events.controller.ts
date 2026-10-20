// The controller for events: validated input in, a service call, status, headers, and view out.
import type { RequestHandler } from "express";
import { currentUser } from "../../http/auth.ts";
import { ValidationError } from "../../http/errors.ts";
import type { Calendar } from "./calendar.ts";
import type { CreateEvent, EventIdParams, ListEventsQuery, UpdateEvent } from "./events.schemas.ts";
import type { EventsService } from "./events.service.ts";
import { toEventJson, toEventSummaryJson } from "./events.view.ts";

export class EventsController {
  readonly #events: EventsService;
  readonly #calendar: Calendar;

  constructor(events: EventsService, calendar: Calendar) {
    this.#events = events;
    this.#calendar = calendar;
  }

  list: RequestHandler = async (_req, res) => {
    const page = await this.#events.list(res.locals.query as ListEventsQuery);
    res.json({ data: page.data.map(toEventSummaryJson), nextCursor: page.nextCursor });
  };

  get: RequestHandler = async (req, res) => {
    const { eventId } = res.locals.params as EventIdParams;
    const event = await this.#events.get(req.user, eventId);
    // The answer depends on who asks (drafts are visible to their owner), so caches must key on it.
    res.vary("Authorization");
    if (event.status === "draft") res.set("Cache-Control", "private, no-store");
    res.json(toEventJson(event));
  };

  create: RequestHandler = async (req, res) => {
    const event = await this.#events.create(currentUser(req), req.body as CreateEvent);
    res.status(201).location(`/v1/events/${event.id}`).json(toEventJson(event));
  };

  update: RequestHandler = async (req, res) => {
    const { eventId } = res.locals.params as EventIdParams;
    res.json(toEventJson(await this.#events.update(currentUser(req), eventId, req.body as UpdateEvent)));
  };

  publish: RequestHandler = async (req, res) => {
    const { eventId } = res.locals.params as EventIdParams;
    res.json(toEventJson(await this.#events.publish(currentUser(req), eventId)));
  };

  cancel: RequestHandler = async (req, res) => {
    const { eventId } = res.locals.params as EventIdParams;
    res.json(toEventJson(await this.#events.cancel(currentUser(req), eventId)));
  };

  remove: RequestHandler = async (req, res) => {
    const { eventId } = res.locals.params as EventIdParams;
    await this.#events.remove(currentUser(req), eventId);
    res.status(204).end();
  };

  uploadPoster: RequestHandler = async (req, res) => {
    const { eventId } = res.locals.params as EventIdParams;
    if (req.file === undefined) {
      throw new ValidationError([{ field: "poster", message: "Attach the image in a form field named poster" }]);
    }
    const event = await this.#events.setPoster(currentUser(req), eventId, req.file);
    res.json(toEventJson(event));
  };

  calendar: RequestHandler = async (req, res) => {
    const { eventId } = res.locals.params as EventIdParams;
    const event = await this.#events.get(null, eventId);
    res.set({ ETag: this.#calendar.etag(event), "Cache-Control": "public, max-age=300" });
    // req.fresh compares If-None-Match with the ETag just set: unchanged events cost no render.
    if (req.fresh) {
      res.status(304).end();
      return;
    }
    res
      .type("text/calendar; charset=utf-8")
      .attachment(`${event.slug}.ics`)
      .send(this.#calendar.render(event, `${req.protocol}://${req.get("host") ?? "localhost"}`));
  };
}
