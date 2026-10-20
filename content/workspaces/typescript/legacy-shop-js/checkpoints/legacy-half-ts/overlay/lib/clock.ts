// "Now", for the rules that depend on the date. HU_FIXED_TIME freezes it, so a coupon's expiry
// gives the same answer on every run.
export function now(): Date {
  const fixed = process.env["HU_FIXED_TIME"];
  return fixed ? new Date(fixed) : new Date();
}
