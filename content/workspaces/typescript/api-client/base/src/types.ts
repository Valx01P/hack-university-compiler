// The SDK's public types, inferred from the schemas so they can never disagree with what is
// checked at runtime, plus the ShipmentId brand: a string known to look like SHP-1001.
import type * as z from "zod";
import type { Carrier } from "./schemas/carrier.ts";
import type { TrackingEvent } from "./schemas/event.ts";
import type { SHIPMENT_STATUSES, Shipment } from "./schemas/shipment.ts";

export type ShipmentId = string & { readonly __brand: "ShipmentId" };

export function isShipmentId(text: string): text is ShipmentId {
  return /^SHP-\d{4}$/.test(text);
}

export type Shipment = z.output<typeof Shipment>;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
export type TrackingEvent = z.output<typeof TrackingEvent>;
export type Carrier = z.output<typeof Carrier>;
export type Page<T> = { readonly items: readonly T[]; readonly nextCursor: string | null };
