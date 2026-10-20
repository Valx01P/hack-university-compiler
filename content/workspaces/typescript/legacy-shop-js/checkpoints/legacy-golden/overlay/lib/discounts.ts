// Coupons, read once from data/coupons.json (where amounts are dollars) and turned into cents.
// applyCoupon works out what a coupon does to a cart. It only reads the cart (Readonly says
// so, and the compiler holds it to that), so working out the totals twice gives the same
// answer twice.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { now } from "./clock.ts";
import type { Cart, Coupon } from "./types.ts";

type CouponJson = { code: string; type: string; percent?: number; amount?: number; minSpend?: number; endsAt?: string; vipOnly?: boolean };

function toCoupon(json: CouponJson): Coupon {
  const base = { code: json.code, ...(json.endsAt === undefined ? {} : { endsAt: json.endsAt }) };
  if (json.type === "percent") return { ...base, type: "percent", percent: json.percent ?? 0, ...(json.vipOnly === undefined ? {} : { vipOnly: json.vipOnly }) };
  if (json.type === "fixed") return { ...base, type: "fixed", amountCents: Math.round((json.amount ?? 0) * 100), minSpendCents: Math.round((json.minSpend ?? 0) * 100) };
  return { ...base, type: "free_shipping" };
}

const couponJson: CouponJson[] = JSON.parse(readFileSync(join(import.meta.dirname, "..", "data", "coupons.json"), "utf8"));
export const coupons: Coupon[] = couponJson.map(toCoupon);

export class UnknownCouponError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("Unknown coupon code");
    this.name = "UnknownCouponError";
    this.code = code;
  }
}

/** What a coupon does: cents off, and whether shipping becomes free. */
export type CouponEffect = { readonly discountCents: number; readonly freeShipping: boolean };

const NOTHING: CouponEffect = { discountCents: 0, freeShipping: false };

export function applyCoupon(cart: Readonly<Cart>, code: string): CouponEffect | undefined {
  const coupon = coupons.find((c) => c.code === code);
  if (!coupon) return undefined;
  // endsAt is a date written as text ("2026-08-31"), so it becomes a Date before comparing.
  if (coupon.endsAt && new Date(coupon.endsAt) < now()) return NOTHING;
  switch (coupon.type) {
    case "percent": {
      if (coupon.vipOnly && !cart.vip) return NOTHING;
      const discountCents = cart.items.reduce((sum, item) => sum + Math.round((item.priceCents * coupon.percent) / 100) * item.qty, 0);
      return { discountCents, freeShipping: false };
    }
    case "fixed": {
      const subtotal = cart.items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
      return { discountCents: subtotal >= coupon.minSpendCents ? coupon.amountCents : 0, freeShipping: false };
    }
    case "free_shipping":
      return { discountCents: 0, freeShipping: true };
  }
}
