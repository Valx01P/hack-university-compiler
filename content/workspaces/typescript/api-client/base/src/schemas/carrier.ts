// A carrier, as Parcelly describes it in openapi.yaml (#/components/schemas/Carrier).
import * as z from "zod";

export const Carrier = z.object({
  id: z.string(),
  name: z.string(),
  // A URL with {trackingNumber} in it, filled in per shipment.
  trackingUrlTemplate: z.string(),
  supportsSignature: z.boolean(),
});

export const CarrierList = z.object({ items: z.array(Carrier) });
