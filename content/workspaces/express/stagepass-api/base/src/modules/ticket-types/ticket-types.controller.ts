// The controller for an event's ticket types.
import type { RequestHandler } from "express";
import { currentUser } from "../../http/auth.ts";
import type { EventIdParams } from "../events/events.schemas.ts";
import type { CreateTicketType } from "./ticket-types.schemas.ts";
import type { TicketTypesService } from "./ticket-types.service.ts";
import { toTicketTypeJson } from "./ticket-types.view.ts";

export class TicketTypesController {
  readonly #ticketTypes: TicketTypesService;

  constructor(ticketTypes: TicketTypesService) {
    this.#ticketTypes = ticketTypes;
  }

  list: RequestHandler = async (req, res) => {
    const { eventId } = res.locals.params as EventIdParams;
    const ticketTypes = await this.#ticketTypes.listForEvent(req.user, eventId);
    res.vary("Authorization").json(ticketTypes.map(toTicketTypeJson));
  };

  create: RequestHandler = async (req, res) => {
    const { eventId } = res.locals.params as EventIdParams;
    const ticketType = await this.#ticketTypes.create(currentUser(req), eventId, req.body as CreateTicketType);
    res.status(201).location(`/v1/events/${eventId}/ticket-types`).json(toTicketTypeJson(ticketType));
  };
}
