// What ticket type requests may contain, and the JSON ticket type responses have.
import { z } from "zod";

export const CreateTicketType = z.strictObject({
  name: z.string().trim().min(1).max(60),
  // Money is whole cents: 2500 is $25.00, so no floating point rounding anywhere.
  priceCents: z.int().min(0).max(1_000_000),
  capacity: z.int().min(1).max(100_000),
});
export type CreateTicketType = z.infer<typeof CreateTicketType>;

export const TicketTypeResponse = z.object({
  id: z.int(),
  eventId: z.int(),
  name: z.string(),
  priceCents: z.int(),
  capacity: z.int(),
  sold: z.int(),
  available: z.int(),
  soldOut: z.boolean(),
});
