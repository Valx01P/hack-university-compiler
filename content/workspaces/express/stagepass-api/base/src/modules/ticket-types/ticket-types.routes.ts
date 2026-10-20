// Routes for /v1/events/:eventId/ticket-types. mergeParams lets this router read :eventId,
// which belongs to the path it is mounted on.
import { Router } from "express";
import { z } from "zod";
import { type AuthGuards, requireRole } from "../../http/auth.ts";
import type { RouteDoc } from "../../http/openapi.ts";
import { validate } from "../../http/validate.ts";
import { EventIdParams } from "../events/events.schemas.ts";
import type { TicketTypesController } from "./ticket-types.controller.ts";
import { CreateTicketType, TicketTypeResponse } from "./ticket-types.schemas.ts";

export function ticketTypesRoutes({ controller, auth }: { controller: TicketTypesController; auth: AuthGuards }): Router {
  const router = Router({ mergeParams: true });
  router.get("/", auth.optional, validate({ params: EventIdParams }), controller.list);
  router.post(
    "/",
    auth.required,
    requireRole("organizer", "admin"),
    validate({ params: EventIdParams, body: CreateTicketType }),
    controller.create,
  );
  return router;
}

export const ticketTypesDocs: RouteDoc[] = [
  {
    method: "get",
    path: "/v1/events/{eventId}/ticket-types",
    summary: "An event's ticket types, cheapest first",
    tag: "ticket types",
    auth: "optional",
    params: EventIdParams,
    responses: {
      200: { description: "Ticket types with what is left", schema: z.array(TicketTypeResponse) },
      404: { description: "No such event, or a draft you do not own" },
    },
  },
  {
    method: "post",
    path: "/v1/events/{eventId}/ticket-types",
    summary: "Add a ticket type to your event",
    tag: "ticket types",
    auth: "required",
    roles: ["organizer", "admin"],
    params: EventIdParams,
    body: { schema: CreateTicketType },
    responses: {
      201: { description: "The new ticket type", schema: TicketTypeResponse },
      400: { description: "Invalid fields" },
      403: { description: "Not your event" },
      404: { description: "No such event" },
      409: { description: "Duplicate name, or more seats than the venue holds" },
    },
  },
];
