// Routes for /v1/organizer: an organizer's own events and sales. Private, so never cached.
import { Router } from "express";
import { z } from "zod";
import { eventStatuses } from "../../db/schema.ts";
import { type AuthGuards, currentUser, requireRole } from "../../http/auth.ts";
import { noStore } from "../../http/cache-control.ts";
import type { RouteDoc } from "../../http/openapi.ts";
import type { OrganizerEventSales } from "../events/events.repository.ts";
import type { StatsService } from "./stats.service.ts";

const OrganizerEventResponse = z.object({
  id: z.int(),
  title: z.string(),
  slug: z.string(),
  status: z.enum(eventStatuses),
  startsAt: z.iso.datetime(),
  ticketsSold: z.int(),
  revenueCents: z.int(),
});

const OrganizerStatsResponse = z.object({
  totals: z.object({ events: z.int(), ticketsSold: z.int(), revenueCents: z.int() }),
  events: z.array(OrganizerEventResponse.extend({ soldOutTicketTypes: z.array(z.string()) })),
});

function toOrganizerEventJson(event: OrganizerEventSales): z.infer<typeof OrganizerEventResponse> {
  return { ...event, startsAt: event.startsAt.toISOString() };
}

export function statsRoutes({ stats, auth }: { stats: StatsService; auth: AuthGuards }): Router {
  const router = Router();
  router.use(auth.required, requireRole("organizer"), noStore);

  router.get("/events", async (req, res) => {
    const events = await stats.organizerEvents(currentUser(req));
    res.json(events.map(toOrganizerEventJson));
  });

  router.get("/stats", async (req, res) => {
    const result = await stats.organizerStats(currentUser(req));
    res.json({
      totals: result.totals,
      events: result.events.map((event) => ({ ...toOrganizerEventJson(event), soldOutTicketTypes: event.soldOutTicketTypes })),
    });
  });
  return router;
}

export const statsDocs: RouteDoc[] = [
  {
    method: "get",
    path: "/v1/organizer/events",
    summary: "Your events with tickets sold and revenue",
    tag: "organizer",
    auth: "required",
    roles: ["organizer"],
    responses: { 200: { description: "Your events, soonest first", schema: z.array(OrganizerEventResponse) } },
  },
  {
    method: "get",
    path: "/v1/organizer/stats",
    summary: "Sales totals and sold-out ticket types",
    tag: "organizer",
    auth: "required",
    roles: ["organizer"],
    responses: { 200: { description: "Your sales", schema: OrganizerStatsResponse } },
  },
];
