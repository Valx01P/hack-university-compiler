// Sales tax, by the state a zip is in. TAX_RATES lists the states the shop ships to. A state
// that is not there is an error the caller has to handle, instead of a NaN in the totals.
import geo from "../vendor/geo-lookup.cjs";

export const TAX_RATES: Readonly<Record<string, number>> = {
  CA: 0.0725,
  NY: 0.04,
  TX: 0.0625,
  WA: 0.065,
  OR: 0,
};

export class UnknownStateError extends Error {
  readonly state: string;

  constructor(state: string) {
    super(`We don't ship to ${state} yet`);
    this.name = "UnknownStateError";
    this.state = state;
  }
}

/** Tax on amountCents for the zip's state, rounded to a whole cent. */
export function taxCentsFor(zip: string, amountCents: number): number {
  // Callers check the zip first, so a zip with no data here is a bug, not a request to answer.
  const place = geo.lookupZip(zip);
  if (!place) throw new Error(`No geo data for zip ${zip}`);
  const state = place.state;
  const rate = TAX_RATES[state];
  if (rate === undefined) throw new UnknownStateError(state);
  return Math.round(amountCents * rate);
}
