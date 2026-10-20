// Shipping: free over $50, otherwise a flat rate by zone. The west coast states are one zone,
// everywhere else the other.
// @ts-expect-error -- geo-lookup ships no types, so this import is an untyped any (TS7016)
import geo from "../vendor/geo-lookup.cjs";

const WEST_COAST = ["CA", "OR", "WA", "AK"];
const ZONE_RATES: Record<string, number> = { west: 750, east: 500 };

export function shippingCents(subtotalCents: number, zip: string): number {
  if (subtotalCents > 5000) return 0;
  const zone = WEST_COAST.includes(geo.lookupZip(zip).state) ? "west" : "east";
  return ZONE_RATES[zone];
}
