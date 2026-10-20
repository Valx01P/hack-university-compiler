// Turning shipments and events into lines for people: what the demo prints, and what a
// support tool would show. formatEvent switches on the event's type, and the compiler checks
// that every type of event has a line.
import type { Shipment, TrackingEvent } from "./types.ts";

const day = (iso: string): string => iso.slice(0, 10);
const minute = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;

/** "ETA 2026-10-03", or "ETA unknown" when the carrier sends none (USPS never does). */
export function formatEta(shipment: Pick<Shipment, "eta">): string {
  return shipment.eta === null ? "ETA unknown" : `ETA ${day(shipment.eta)}`;
}

export function formatWeight(grams: number): string {
  return grams < 1000 ? `${grams} g` : `${(grams / 1000).toFixed(1)} kg`;
}

export function formatEvent(event: TrackingEvent): string {
  const at = minute(event.at);
  switch (event.type) {
    case "label_created":
      return `${at}  label created`;
    case "picked_up":
      return `${at}  picked up in ${event.location}`;
    case "in_transit":
      return `${at}  at ${event.facility}, ${event.location}`;
    case "out_for_delivery":
      return `${at}  out for delivery in ${event.location}`;
    case "delivered":
      return `${at}  delivered in ${event.location}${event.signedBy === null ? "" : `, signed by ${event.signedBy}`}`;
    case "exception":
      return `${at}  problem in ${event.location}: ${event.message}`;
  }
}
