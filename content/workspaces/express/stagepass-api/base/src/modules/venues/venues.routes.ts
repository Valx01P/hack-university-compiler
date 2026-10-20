// Routes for /v1/venues: anyone may read, only admins may write.
import { Router } from "express";
import { z } from "zod";
import { type AuthGuards, requireRole } from "../../http/auth.ts";
import type { RouteDoc } from "../../http/openapi.ts";
import { validate } from "../../http/validate.ts";
import type { VenuesController } from "./venues.controller.ts";
import { CreateVenue, UpdateVenue, VenueIdParams, VenueResponse } from "./venues.schemas.ts";

export function venuesRoutes({ controller, auth }: { controller: VenuesController; auth: AuthGuards }): Router {
  const router = Router();
  router.get("/", controller.list);
  router.get("/:venueId", validate({ params: VenueIdParams }), controller.get);
  router.post("/", auth.required, requireRole("admin"), validate({ body: CreateVenue }), controller.create);
  router.patch(
    "/:venueId",
    auth.required,
    requireRole("admin"),
    validate({ params: VenueIdParams, body: UpdateVenue }),
    controller.update,
  );
  return router;
}

export const venuesDocs: RouteDoc[] = [
  {
    method: "get",
    path: "/v1/venues",
    summary: "Every venue, by city and name",
    tag: "venues",
    responses: { 200: { description: "Venues", schema: z.array(VenueResponse) } },
  },
  {
    method: "get",
    path: "/v1/venues/{venueId}",
    summary: "One venue",
    tag: "venues",
    params: VenueIdParams,
    responses: { 200: { description: "The venue", schema: VenueResponse }, 404: { description: "No such venue" } },
  },
  {
    method: "post",
    path: "/v1/venues",
    summary: "Add a venue",
    tag: "venues",
    auth: "required",
    roles: ["admin"],
    body: { schema: CreateVenue },
    responses: {
      201: { description: "The new venue", schema: VenueResponse },
      400: { description: "Invalid fields" },
      403: { description: "Not an admin" },
      409: { description: "A venue with this name exists in this city" },
    },
  },
  {
    method: "patch",
    path: "/v1/venues/{venueId}",
    summary: "Change a venue",
    tag: "venues",
    auth: "required",
    roles: ["admin"],
    params: VenueIdParams,
    body: { schema: UpdateVenue },
    responses: {
      200: { description: "The changed venue", schema: VenueResponse },
      403: { description: "Not an admin" },
      404: { description: "No such venue" },
    },
  },
];
