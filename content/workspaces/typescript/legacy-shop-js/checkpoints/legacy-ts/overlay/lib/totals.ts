// A cart's totals: each line, then the subtotal, the coupon's discount, tax for the zip's
// state, shipping, and the total, all in cents until they are formatted at the end.
import { applyCoupon } from "./discounts.ts";
import { formatCents } from "./format.ts";
import { shippingCents } from "./shipping.ts";
import { taxCentsFor } from "./tax.ts";
import type { Cart, CartItem, Totals } from "./types.ts";

/** The total for one line, in cents. A sale takes its percentage off. */
export function lineTotal(item: Pick<CartItem, "priceCents" | "qty" | "salePercent">): number {
  const full = item.priceCents * item.qty;
  return item.salePercent ? Math.round(full * (1 - item.salePercent / 100)) : full;
}

export function computeTotals(cart: Cart, zip: string): Totals {
  const lineTotals = cart.items.map(lineTotal);
  const subtotal = lineTotals.reduce((sum, cents) => sum + cents, 0);
  const discount: number = cart.coupon ? applyCoupon(cart, cart.coupon) : 0;
  const afterDiscount = subtotal - discount;
  const tax = taxCentsFor(zip, afterDiscount);
  const shipping = cart.freeShipping ? 0 : shippingCents(afterDiscount, zip);
  return {
    lines: lineTotals.sort().map(formatCents),
    subtotal: formatCents(subtotal),
    discount: formatCents(discount),
    tax: formatCents(tax),
    shipping: formatCents(shipping),
    total: formatCents(afterDiscount + tax + shipping),
  };
}
