// A cart's totals: each line, then the subtotal, the coupon's discount, tax for the zip's
// state, shipping, and the total, all in cents until they are formatted at the end.
import { applyCoupon, UnknownCouponError } from "./discounts.ts";
import { formatCents } from "./format.ts";
import { shippingCents } from "./shipping.ts";
import { taxCentsFor } from "./tax.ts";
import type { Cart, CartItem, Totals } from "./types.ts";

/** The total for one line, in cents. A sale takes its percentage off. */
export function lineTotal(item: Pick<CartItem, "priceCents" | "qty" | "salePercent">): number {
  const full = item.priceCents * item.qty;
  return item.salePercent ? Math.round(full * (1 - item.salePercent / 100)) : full;
}

export function computeTotals(cart: Readonly<Cart>, zip: string): Totals {
  const lineTotals = cart.items.map(lineTotal);
  const subtotal = lineTotals.reduce((sum, cents) => sum + cents, 0);
  const effect = cart.coupon === null ? { discountCents: 0, freeShipping: false } : applyCoupon(cart, cart.coupon);
  // applyCoupon has no effect for a code it does not know: an error, not NaN.
  if (effect === undefined) throw new UnknownCouponError(cart.coupon ?? "");
  const discount = effect.discountCents;
  const afterDiscount = subtotal - discount;
  const tax = taxCentsFor(zip, afterDiscount);
  const shipping = effect.freeShipping ? 0 : shippingCents(afterDiscount, zip);
  return {
    // A compare function, or sort() would order 12987 before 750 as text.
    lines: lineTotals.toSorted((a, b) => a - b).map(formatCents),
    subtotal: formatCents(subtotal),
    discount: formatCents(discount),
    tax: formatCents(tax),
    shipping: formatCents(shipping),
    total: formatCents(afterDiscount + tax + shipping),
  };
}
