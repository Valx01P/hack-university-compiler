// Carts, kept in memory and keyed by the id in the URL. Each item copies the product's name
// and price. A change stores a new cart object instead of editing the old one, so a cart
// someone else is holding (say, the totals being worked out) never changes under them.
// Carts are gone when the server restarts.
import * as catalog from "./catalog.ts";
import type { Cart } from "./types.ts";

const carts = new Map<string, Cart>();

export function getCart(id: string): Cart | undefined {
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
  const cart = getOrCreateCart(cartId);
  const existing = cart.items.find((item) => item.sku === sku);
  const items = existing
    ? cart.items.map((item) => (item === existing ? { ...item, qty: item.qty + qty } : item))
    : [...cart.items, { sku, name: product.name, priceCents: product.priceCents, salePercent: product.salePercent, qty }];
  const next: Cart = { ...cart, items };
  carts.set(cartId, next);
  return next;
}

export function setCoupon(cartId: string, code: string): Cart {
  const next: Cart = { ...getOrCreateCart(cartId), coupon: code };
  carts.set(cartId, next);
  return next;
}

export function clearCart(cartId: string): void {
  carts.delete(cartId);
}
