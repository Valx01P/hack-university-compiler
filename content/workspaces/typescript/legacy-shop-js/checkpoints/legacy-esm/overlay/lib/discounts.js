// Coupons, read once from data/coupons.json. applyCoupon works out how much a coupon takes
// off a cart.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const coupons = JSON.parse(readFileSync(join(import.meta.dirname, "..", "data", "coupons.json"), "utf8"));

function today() {
  return new Date();
}

export function applyCoupon(cart, code) {
  const coupon = coupons.find(function (c) {
    return c.code === code;
  });
  if (!coupon) return;
  if (coupon.endsAt && coupon.endsAt < today()) return 0;
  if (coupon.vipOnly && !cart.vip) return 0;

  if (coupon.type === "percent") {
    let discount = 0;
    cart.items.forEach(function (item) {
      const cut = (item.price * coupon.percent) / 100;
      item.price = item.price - cut;
      discount += cut * item.qty;
    });
    return discount;
  }
  if (coupon.type === "fixed") {
    const subtotal = cart.items.reduce(function (sum, item) {
      return sum + item.price * item.qty;
    }, 0);
    return subtotal >= coupon.minSpend ? coupon.amount : 0;
  }
  if (coupon.type === "free_shipping") {
    cart.freeShipping = true;
    return 0;
  }
  return 0;
}
