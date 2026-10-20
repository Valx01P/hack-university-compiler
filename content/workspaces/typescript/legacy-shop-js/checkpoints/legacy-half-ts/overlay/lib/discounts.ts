// Coupons, read once from data/coupons.json. applyCoupon works out how much a coupon takes off
// a cart. The Coupon union in types.ts makes each kind of coupon carry its own fields.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { now } from "./clock.ts";
import type { Cart, Coupon } from "./types.ts";

export const coupons: Coupon[] = JSON.parse(readFileSync(join(import.meta.dirname, "..", "data", "coupons.json"), "utf8"));

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
        const cut = (item.price * coupon.percent) / 100;
        item.price = item.price - cut;
        discount += cut * item.qty;
      }
      return discount;
    }
    case "fixed": {
      const subtotal = cart.items.reduce((sum, item) => sum + item.price * item.qty, 0);
      return subtotal >= coupon.minSpend ? coupon.amount : 0;
    }
    case "free_shipping":
      cart.freeShipping = true;
      return 0;
  }
}
