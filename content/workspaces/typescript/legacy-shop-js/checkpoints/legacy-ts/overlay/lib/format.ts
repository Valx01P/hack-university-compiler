// Money for the API: 1250 cents becomes "12.50".
export function formatCents(cents) {
  return (cents / 100).toFixed(2);
}

/** Cents as the dollars the API's JSON has always used: 1250 becomes 12.5. */
export function toDollars(cents: number): number {
  return cents / 100;
}
