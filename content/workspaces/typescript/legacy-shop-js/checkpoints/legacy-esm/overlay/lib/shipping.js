// Shipping: free over $50, otherwise a flat rate by zone. Zips starting with 9 are the west
// coast zone.
export function shippingFor(subtotal, zip) {
  if (subtotal > "50") return 0;
  return zip.charAt(0) === "9" ? 7.5 : 5;
}
