// Routes for /v1/events. Reading is public (drafts excepted), and organizers and admins write.
import { Router } from "express";
import { z } from "zod";
import { type AuthGuards, requireRole } from "../../http/auth.ts";
import { cacheControl } from "../../http/cache-control.ts";
import type { RouteDoc } from "../../http/openapi.ts";
import { validate } from "../../http/validate.ts";
import type { EventsController } from "./events.controller.ts";
import { CreateEvent, EventIdParams, EventPageResponse, EventResponse, ListEventsQuery, UpdateEvent } from "./events.schemas.ts";
import { posterUpload } from "./posters.ts";

export function eventsRoutes({ controller, auth }: { controller: EventsController; auth: AuthGuards }): Router {
  const router = Router();
  const organizer = [auth.required, requireRole("organizer", "admin")];
  const byId = validate({ params: EventIdParams });

  router.get("/", cacheControl("public, max-age=60"), validate({ query: ListEventsQuery }), controller.list);
  router.post("/", ...organizer, validate({ body: CreateEvent }), controller.create);
  router.get("/:eventId", auth.optional, cacheControl("public, max-age=60"), byId, controller.get);
  router.patch("/:eventId", ...organizer, validate({ params: EventIdParams, body: UpdateEvent }), controller.update);
  router.delete("/:eventId", ...organizer, byId, controller.remove);
  router.post("/:eventId/publish", ...organizer, byId, controller.publish);
  router.post("/:eventId/cancel", ...organizer, byId, controller.cancel);
  // Authentication runs before multer, so anonymous uploads are refused before any bytes are buffered.
  router.put("/:eventId/poster", ...organizer, byId, posterUpload, controller.uploadPoster);
  router.get("/:eventId/calendar.ics", byId, controller.calendar);
  return router;
}

const organizerOnly = { auth: "required", roles: ["organizer", "admin"] } as const;

export const eventsDocs: RouteDoc[] = [
  {
    method: "get",
    path: "/v1/events",
    summary: "Published events: filters, full text search, sorts, and cursor pages",
    tag: "events",
    query: ListEventsQuery,
    responses: { 200: { description: "One page of events", schema: EventPageResponse }, 400: { description: "Bad query or cursor" } },
  },
  {
    method: "post",
    path: "/v1/events",
    summary: "Create a draft event",
    tag: "events",
    ...organizerOnly,
    body: { schema: CreateEvent },
    responses: {
      201: { description: "The new draft", schema: EventResponse },
      400: { description: "Invalid fields" },
      422: { description: "Unknown venue or a start time in the past" },
    },
  },
  {
    method: "get",
    path: "/v1/events/{eventId}",
    summary: "One event. Drafts only for their organizer and admins",
    tag: "events",
    auth: "optional",
    params: EventIdParams,
    responses: { 200: { description: "The event", schema: EventResponse }, 404: { description: "No such event" } },
  },
  {
    method: "patch",
    path: "/v1/events/{eventId}",
    summary: "Change an event",
    tag: "events",
    ...organizerOnly,
    params: EventIdParams,
    body: { schema: UpdateEvent },
    responses: {
      200: { description: "The changed event", schema: EventResponse },
      403: { description: "Not your event" },
      409: { description: "The event is cancelled" },
    },
  },
  {
    method: "delete",
    path: "/v1/events/{eventId}",
    summary: "Delete a draft",
    tag: "events",
    ...organizerOnly,
    params: EventIdParams,
    responses: { 204: { description: "Deleted" }, 409: { description: "Not a draft" } },
  },
  {
    method: "post",
    path: "/v1/events/{eventId}/publish",
    summary: "Put a draft on sale",
    tag: "events",
    ...organizerOnly,
    params: EventIdParams,
    responses: { 200: { description: "The published event", schema: EventResponse }, 409: { description: "Not publishable" } },
  },
  {
    method: "post",
    path: "/v1/events/{eventId}/cancel",
    summary: "Cancel an event and its paid orders",
    tag: "events",
    ...organizerOnly,
    params: EventIdParams,
    responses: { 200: { description: "The cancelled event", schema: EventResponse }, 409: { description: "Already cancelled" } },
  },
  {
    method: "put",
    path: "/v1/events/{eventId}/poster",
    summary: "Upload the poster (PNG, JPEG, or WebP, at most 2 MB)",
    tag: "events",
    ...organizerOnly,
    params: EventIdParams,
    body: { schema: z.object({ poster: z.string().describe("The image file") }), contentType: "multipart/form-data" },
    responses: {
      200: { description: "The event with its new posterUrl", schema: EventResponse },
      413: { description: "Larger than 2 MB" },
      415: { description: "Not a PNG, JPEG, or WebP image" },
    },
  },
  {
    method: "get",
    path: "/v1/events/{eventId}/calendar.ics",
    summary: "The event as an iCalendar file",
    tag: "events",
    params: EventIdParams,
    responses: {
      200: { description: "text/calendar", schema: z.string(), contentType: "text/calendar" },
      304: { description: "Not modified since the ETag the client has" },
    },
  },
];
