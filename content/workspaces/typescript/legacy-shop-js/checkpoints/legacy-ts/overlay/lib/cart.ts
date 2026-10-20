// Carts, kept in memory and keyed by the id in the URL. Each item copies the product's name
// and price. Carts are gone when the server restarts.
import * as catalog from "./catalog.ts";
import type { Cart } from "./types.ts";

const carts = new Map<string, Cart>();

export function getCart(id: string): Cart {
  return carts.get(id);
}

export function getOrCreateCart(id: string): Cart {
  let cart = carts.get(id);
  if (!cart) {
    cart = { id, items: [], coupon: null, vip: id.startsWith("vip-") };
    carts.set(id, cart);
  }
  return cart;
}

/** Adds qty of a product to a cart, or more of it when it is already there. null when there is no such product. */
export function addItem(cartId: string, sku: string, qty: number): Cart | null {
  const product = catalog.find(sku);
  if (!product) return null;
  getOrCreateCart(cartId);
  const items = carts.get(cartId).items;
  const existing = items.find((item) => item.sku === sku);
  if (existing) {
    existing.qty = existing.qty + qty;
  } else {
    items.push({ sku, name: product.name, priceCents: product.priceCents, salePercent: product.salePercent, qty });
  }
  return getOrCreateCart(cartId);
}

export function setCoupon(cartId: string, code: string): Cart {
  const cart = getOrCreateCart(cartId);
  cart.coupon = code;
  return cart;
}

export function clearCart(cartId: string): void {
  carts.delete(cartId);
}
