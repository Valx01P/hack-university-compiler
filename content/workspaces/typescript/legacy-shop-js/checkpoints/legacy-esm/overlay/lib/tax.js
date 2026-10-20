// Sales tax, by state. TAX_RATES lists the states the shop ships to.
export const TAX_RATES = {
  CA: 0.0725,
  NY: 0.04,
  TX: 0.0625,
  WA: 0.065,
  OR: 0,
};

export function taxFor(state, amount) {
  return amount * TAX_RATES[state];
}
