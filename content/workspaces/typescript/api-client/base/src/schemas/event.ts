// Tracking events: a discriminated union on "type", so a switch on event.type narrows each
// event to the fields its type has (a delivery has signedBy, an exception has a reason).
import * as z from "zod";

const Base = { id: z.string(), shipmentId: z.string(), at: z.iso.datetime() };

export const TrackingEvent = z.discriminatedUnion("type", [
  z.object({ ...Base, type: z.literal("label_created") }),
  z.object({ ...Base, type: z.literal("picked_up"), location: z.string() }),
  z.object({ ...Base, type: z.literal("in_transit"), location: z.string(), facility: z.string() }),
  z.object({ ...Base, type: z.literal("out_for_delivery"), location: z.string() }),
  z.object({ ...Base, type: z.literal("delivered"), location: z.string(), signedBy: z.string().nullable() }),
  z.object({
    ...Base,
    type: z.literal("exception"),
    location: z.string(),
    reason: z.enum(["address_issue", "damaged", "weather"]),
    message: z.string(),
  }),
]);

export const EventList = z.object({ items: z.array(TrackingEvent) });
