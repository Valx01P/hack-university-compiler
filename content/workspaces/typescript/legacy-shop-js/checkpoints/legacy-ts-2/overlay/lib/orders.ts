// Orders, appended to data/orders.json. placeOrder resolves only once the file is written, so
// a client that hears 201 can trust the order is saved, and a failed write rejects instead of
// being lost.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
// @ts-expect-error -- geo-lookup ships no types, so this import is an untyped any (TS7016)
import geo from "../vendor/geo-lookup.cjs";
import { now } from "./clock.ts";
import { toDollars } from "./format.ts";
import type { Cart, CartItem, Totals } from "./types.ts";
import { deepClone, raceWindow } from "./util.ts";

const ORDERS_FILE = join(import.meta.dirname, "..", "data", "orders.json");

export type Order = {
  id: string;
  cartId: string;
  items: (Omit<CartItem, "priceCents"> & { price: number })[];
  totals: Totals;
  shipTo: { zip: string; city: string; state: string };
  placedAt: string;
};

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function placeOrder(cart: Cart, totals: Totals, zip: string): Promise<Order> {
  let orders: Order[] = [];
  try {
    orders = JSON.parse(await readFile(ORDERS_FILE, "utf8"));
  } catch (error) {
    if (!isMissing(error)) throw new Error("Could not read the orders", { cause: error });
  }
  const place = geo.lookupZip(zip);
  const order: Order = {
    id: "o" + (orders.length + 1),
    cartId: cart.id,
    items: deepClone(cart.items).map(({ priceCents, ...item }: CartItem) => ({ ...item, price: toDollars(priceCents) })),
    totals,
    shipTo: { zip, city: place.city, state: place.state },
    placedAt: now().toISOString(),
  };
  orders.push(order);
  await raceWindow();
  await writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2) + "\n");
  return order;
}
