const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

// Prices are stored as integer cents so sums never pick up floating-point errors.
export function formatPrice(cents: number): string {
  return priceFormatter.format(cents / 100);
}

// Dates format in UTC so the server and every browser print the same day.
export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}
