// The controller: takes validated input, calls the service, picks the status, renders the view.
import type { RequestHandler } from "express";
import type { CreateVenue, UpdateVenue, VenueIdParams } from "./venues.schemas.ts";
import type { VenuesService } from "./venues.service.ts";
import { toVenueJson } from "./venues.view.ts";

export class VenuesController {
  readonly #venues: VenuesService;

  constructor(venues: VenuesService) {
    this.#venues = venues;
  }

  list: RequestHandler = async (_req, res) => {
    const venues = await this.#venues.list();
    res.json(venues.map(toVenueJson));
  };

  get: RequestHandler = async (_req, res) => {
    const { venueId } = res.locals.params as VenueIdParams;
    res.json(toVenueJson(await this.#venues.get(venueId)));
  };

  create: RequestHandler = async (req, res) => {
    const venue = await this.#venues.create(req.body as CreateVenue);
    res.status(201).location(`/v1/venues/${venue.id}`).json(toVenueJson(venue));
  };

  update: RequestHandler = async (req, res) => {
    const { venueId } = res.locals.params as VenueIdParams;
    res.json(toVenueJson(await this.#venues.update(venueId, req.body as UpdateVenue)));
  };
}
