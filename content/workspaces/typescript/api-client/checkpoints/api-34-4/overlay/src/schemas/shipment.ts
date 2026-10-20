// A shipment, as Parcelly sends it (openapi.yaml #/components/schemas/Shipment).
import * as z from "zod";
import { isShipmentId, type ShipmentId } from "../types.ts";
import { pageOf } from "./page.ts";

export const SHIPMENT_STATUSES = ["label_created", "in_transit", "out_for_delivery", "delivered", "exception"] as const;

export const ShipmentIdField = z.string().pipe(z.custom<ShipmentId>((value) => typeof value === "string" && isShipmentId(value), "expected an id like SHP-1001"));

const Address = z.object({
  name: z.string(),
  city: z.string(),
  region: z.string(),
  postalCode: z.string(),
  country: z.string(),
});

const Fields = {
  id: ShipmentIdField,
  status: z.enum(SHIPMENT_STATUSES),
  trackingNumber: z.string(),
  weightGrams: z.number().int().positive(),
  from: Address,
  to: Address,
  createdAt: z.iso.datetime(),
};

export const Shipment = z.object({
  ...Fields,
  carrier: z.string(),
  // The contract never said so, but USPS sends no ETA at all: null, not a date.
  eta: z.iso.datetime().nullable(),
});

export const ShipmentPage = pageOf(Shipment);
