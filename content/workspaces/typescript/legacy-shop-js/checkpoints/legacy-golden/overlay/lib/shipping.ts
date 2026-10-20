// Shipping: free over $50, otherwise a flat rate by zone. The west coast states are one zone,
// everywhere else the other.
import geo from "../vendor/geo-lookup.cjs";

const WEST_COAST = ["CA", "OR", "WA", "AK"];
// Keyed by the two zones, not by any string, so looking a zone up always finds a rate.
const ZONE_RATES = { west: 750, east: 500 } as const;

export function shippingCents(subtotalCents: number, zip: string): number {
  if (subtotalCents > 5000) return 0;
  const state = geo.lookupZip(zip)?.state;
  const zone = state !== undefined && WEST_COAST.includes(state) ? "west" : "east";
  return ZONE_RATES[zone];
}
