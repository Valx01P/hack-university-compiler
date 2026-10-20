// Sales tax, by the state a zip is in. TAX_RATES lists the states the shop ships to. A state
// that is not there is an error the caller has to handle, instead of a NaN in the totals.
// @ts-expect-error -- geo-lookup ships no types, so this import is an untyped any (TS7016)
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
  const state: string = geo.lookupZip(zip).state;
  const rate = TAX_RATES[state];
  if (rate === undefined) throw new UnknownStateError(state);
  return Math.round(amountCents * rate);
}
