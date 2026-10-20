// Sales tax, by state. TAX_RATES lists the states the shop ships to. A state that is not there
// is an error the caller has to handle, instead of a NaN in the totals.
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

export function taxFor(state: string, amount: number): number {
  const rate = TAX_RATES[state];
  if (rate === undefined) throw new UnknownStateError(state);
  return amount * rate;
}
