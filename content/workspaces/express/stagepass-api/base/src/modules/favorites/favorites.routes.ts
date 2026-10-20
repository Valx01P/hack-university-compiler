// Routes for /v1/me/favorites. A feature this small skips the controller: each handler is
// three lines of HTTP around one service call, and the view is the events module's.
import { Router } from "express";
import { z } from "zod";
import { type AuthGuards, currentUser } from "../../http/auth.ts";
import { noStore } from "../../http/cache-control.ts";
import type { RouteDoc } from "../../http/openapi.ts";
import { validate } from "../../http/validate.ts";
import { EventIdParams, EventSummaryResponse } from "../events/events.schemas.ts";
import { toEventSummaryJson } from "../events/events.view.ts";
import type { FavoritesService } from "./favorites.service.ts";

export function favoritesRoutes({ favorites, auth }: { favorites: FavoritesService; auth: AuthGuards }): Router {
  const router = Router();
  router.use(auth.required, noStore);

  router.get("/", async (req, res) => {
    const events = await favorites.list(currentUser(req));
    res.json(events.map(toEventSummaryJson));
  });

  router.put("/:eventId", validate({ params: EventIdParams }), async (req, res) => {
    const { eventId } = res.locals.params as EventIdParams;
    await favorites.add(currentUser(req), eventId);
    res.status(204).end();
  });

  router.delete("/:eventId", validate({ params: EventIdParams }), async (req, res) => {
    const { eventId } = res.locals.params as EventIdParams;
    await favorites.remove(currentUser(req), eventId);
    res.status(204).end();
  });
  return router;
}

export const favoritesDocs: RouteDoc[] = [
  {
    method: "get",
    path: "/v1/me/favorites",
    summary: "Your favorite events, most recent first",
    tag: "favorites",
    auth: "required",
    responses: { 200: { description: "Events", schema: z.array(EventSummaryResponse) } },
  },
  {
    method: "put",
    path: "/v1/me/favorites/{eventId}",
    summary: "Favorite an event (idempotent)",
    tag: "favorites",
    auth: "required",
    params: EventIdParams,
    responses: { 204: { description: "Favorited" }, 404: { description: "No such event" } },
  },
  {
    method: "delete",
    path: "/v1/me/favorites/{eventId}",
    summary: "Stop favoriting an event (idempotent)",
    tag: "favorites",
    auth: "required",
    params: EventIdParams,
    responses: { 204: { description: "Not a favorite anymore" } },
  },
];
