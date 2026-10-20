// Money as whole cents, and how to show it. One module per file: other files import what
// this one exports, and nothing else.
export type Cents = number;

export function formatCents(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}
