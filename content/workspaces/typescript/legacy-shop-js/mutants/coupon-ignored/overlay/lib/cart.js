// Carts, kept in memory and keyed by the id in the URL. A cart is
// { id, items, coupon, vip }, and each item copies the product's name and price.
// Carts are gone when the server restarts.
const catalog = require("./catalog");

const carts = new Map();

function getCart(id) {
  return carts.get(id);
}

function getOrCreateCart(id) {
  if (!carts.has(id)) {
    carts.set(id, { id: id, items: [], coupon: null, vip: id.indexOf("vip-") === 0 });
  }
  return carts.get(id);
}

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

function setCoupon(cartId, code) {
  const cart = getOrCreateCart(cartId);
  cart.coupon = null;
  return cart;
}

function clearCart(cartId) {
  carts.delete(cartId);
}

module.exports = { getCart, getOrCreateCart, addItem, setCoupon, clearCart };
