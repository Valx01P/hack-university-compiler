// The view: a ticket type as clients see it, with what is left to sell worked out for them.
import type { z } from "zod";
import type { TicketTypeResponse } from "./ticket-types.schemas.ts";
import type { TicketType } from "./ticket-types.repository.ts";

export function toTicketTypeJson(ticketType: TicketType): z.infer<typeof TicketTypeResponse> {
  const available = Math.max(0, ticketType.capacity - ticketType.sold);
  return {
    id: ticketType.id,
    eventId: ticketType.eventId,
    name: ticketType.name,
    priceCents: ticketType.priceCents,
    capacity: ticketType.capacity,
    sold: ticketType.sold,
    available,
    soldOut: available === 0,
  };
}
