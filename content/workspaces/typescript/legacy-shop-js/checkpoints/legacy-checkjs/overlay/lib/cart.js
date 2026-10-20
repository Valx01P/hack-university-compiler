// Carts, kept in memory and keyed by the id in the URL. A cart is
// { id, items, coupon, vip }, and each item copies the product's name and price.
// Carts are gone when the server restarts.
const catalog = require("./catalog");

/**
 * @typedef {{ sku: string, name: string, price: number, salePercent?: number, stock: number }} Product
 * @typedef {{ sku: string, name: string, price: number, salePercent?: number, qty: number }} CartItem
 * @typedef {{ id: string, items: CartItem[], coupon: string | null, vip: boolean, freeShipping?: boolean }} Cart
 */

/** @type {Map<string, Cart>} */
const carts = new Map();

/**
 * @param {string} id
 * @returns {Cart | undefined}
 */
function getCart(id) {
  return carts.get(id);
}

/**
 * @param {string} id
 * @returns {Cart}
 */
function getOrCreateCart(id) {
  if (!carts.has(id)) {
    carts.set(id, { id: id, items: [], coupon: null, vip: id.indexOf("vip-") === 0 });
  }
  return carts.get(id);
}

/**
 * Adds qty of a product to a cart, or more of it when it is already there.
 * @param {string} cartId
 * @param {string} sku
 * @param {number} qty
 * @returns {Cart | null} null when there is no such product
 */
function addItem(cartId, sku, qty) {
  const product = catalog.find(sku);
  if (!product) return null;
  const cart = getOrCreateCart(cartId);
  const existing = cart.items.find(function (item) {
    return item.sku === sku;
  });
  if (existing) {
    existing.qty = existing.qty + qty;
  } else {
    cart.items.push({ sku: sku, name: product.name, price: product.price, salePercent: product.salePercent, qty: qty });
  }
  return cart;
}

/**
 * @param {string} cartId
 * @param {string} code
 * @returns {Cart}
 */
function setCoupon(cartId, code) {
  const cart = getOrCreateCart(cartId);
  cart.coupon = code;
  return cart;
}

/** @param {string} cartId */
function clearCart(cartId) {
  carts.delete(cartId);
}

module.exports = { getCart, getOrCreateCart, addItem, setCoupon, clearCart };
