// A cart's totals: each line, then the subtotal, the coupon's discount, tax for the zip's
// state, shipping, and the total. Money goes out as strings with two decimals.
import * as discounts from "./discounts.ts";
import * as tax from "./tax.ts";
import * as shipping from "./shipping.ts";
import * as format from "./format.js";
import geo from "../vendor/geo-lookup.cjs";

/** @typedef {import("./types.ts").Cart} Cart */
/** @typedef {import("./types.ts").CartItem} CartItem */

/**
 * @typedef {object} Totals
 * @property {string[]} lines
 * @property {string} subtotal
 * @property {string} discount
 * @property {string} tax
 * @property {string} shipping
 * @property {string} total
 */

/**
 * The total for one line of a cart.
 * @param {Pick<CartItem, "price" | "qty" | "salePercent">} item
 * @returns {number}
 */
export function lineTotal(item) {
  if (item.salePercent) {
    return item.price * item.qty * (1 - item.salePercent / 100);
  }
  return item.price * item.qty;
}

/**
 * @param {Cart} cart
 * @param {string} zip
 * @returns {Totals}
 */
export function computeTotals(cart, zip) {
  const place = geo.lookupZip(zip);
  const lineTotals = cart.items.map(lineTotal);
  const subtotal = lineTotals.reduce(function (sum, n) {
    return sum + n;
  }, 0);
  const discount = cart.coupon ? discounts.applyCoupon(cart, cart.coupon) : 0;
  const afterDiscount = subtotal - discount;
  const salesTax = tax.taxFor(place.state, afterDiscount);
  const shippingCost = cart.freeShipping ? 0 : shipping.shippingFor(afterDiscount, zip);
  return {
    lines: lineTotals.sort().map(format.formatMoney),
    subtotal: format.formatMoney(subtotal),
    discount: format.formatMoney(discount),
    tax: format.formatMoney(salesTax),
    shipping: format.formatMoney(shippingCost),
    total: format.formatMoney(afterDiscount + salesTax + shippingCost),
  };
}
