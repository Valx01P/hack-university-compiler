// A cart's totals: each line, then the subtotal, the coupon's discount, tax for the zip's
// state, shipping, and the total. Money goes out as strings with two decimals.
const discounts = require("./discounts");
const tax = require("./tax");
const shipping = require("./shipping");
const format = require("./format");
const geo = require("../vendor/geo-lookup");

/** @typedef {import("./cart").Cart} Cart */
/** @typedef {import("./cart").CartItem} CartItem */

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
function lineTotal(item) {
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
function computeTotals(cart, zip) {
  const place = geo.lookupZip(zip);
  const lineTotals = cart.items.map(lineTotal);
  const subtotal = lineTotals.reduce(function (sum, n) {
    return sum + n;
  }, 0);
  const discount = cart.coupon ? discounts.applyCoupon(cart, cart.coupon) : 0;
  const afterDiscount = subtotal - discount;
  const salesTax = tax.taxFor(place.state, afterDiscount);
  const shippingCost = cart.freeShipping ? 0 : shipping.shippingFor(format.formatMoney(afterDiscount), zip);
  return {
    lines: lineTotals.sort().map(format.formatMoney),
    subtotal: format.formatMoney(subtotal),
    discount: format.formatMoney(discount),
    tax: format.formatMoney(salesTax),
    shipping: format.formatMoney(shippingCost),
    total: format.formatMoney(afterDiscount + salesTax + shippingCost),
  };
}

module.exports = { lineTotal, computeTotals };
