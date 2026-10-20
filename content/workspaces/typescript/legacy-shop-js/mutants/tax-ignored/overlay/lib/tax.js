// Sales tax, by state. TAX_RATES lists the states the shop ships to.
const TAX_RATES = {
  CA: 0.0725,
  NY: 0.04,
  TX: 0.0625,
  WA: 0.065,
  OR: 0,
};

function taxFor(state, amount) {
  return amount * 0;
}

module.exports = { TAX_RATES, taxFor };
