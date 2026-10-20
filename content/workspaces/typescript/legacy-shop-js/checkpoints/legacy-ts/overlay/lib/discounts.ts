// Coupons, read once from data/coupons.json (where amounts are dollars) and turned into cents.
// applyCoupon works out how much a coupon takes off a cart.
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

export function applyCoupon(cart: Cart, code: string): number | undefined {
  const coupon = coupons.find((c) => c.code === code);
  if (!coupon) return undefined;
  // endsAt is a date written as text ("2026-08-31"), so it becomes a Date before comparing.
  if (coupon.endsAt && new Date(coupon.endsAt) < now()) return 0;
  switch (coupon.type) {
    case "percent": {
      if (coupon.vipOnly && !cart.vip) return 0;
      let discount = 0;
      for (const item of cart.items) {
        const cut = Math.round((item.priceCents * coupon.percent) / 100);
        item.priceCents = item.priceCents - cut;
        discount += cut * item.qty;
      }
      return discount;
    }
    case "fixed": {
      const subtotal = cart.items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
      return subtotal >= coupon.minSpendCents ? coupon.amountCents : 0;
    }
    case "free_shipping":
      cart.freeShipping = true;
      return 0;
  }
}
