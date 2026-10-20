// The Corner Shop checkout service: a plain node:http server. Each route is an if on the path,
// and its handler parses the request, calls the lib/ modules, and answers with JSON. Money is
// cents inside the app, and the API keeps the dollars and strings it has always sent.
import http, { type ServerResponse } from "node:http";
import * as cart from "./lib/cart.ts";
import * as catalog from "./lib/catalog.ts";
import { toDollars } from "./lib/format.ts";
import { UnknownCouponError } from "./lib/discounts.ts";
import * as orders from "./lib/orders.ts";
import { UnknownStateError } from "./lib/tax.ts";
import * as totals from "./lib/totals.ts";
import type { Cart, CartItem, Product, Totals } from "./lib/types.ts";
import geo from "./vendor/geo-lookup.cjs";

const PORT = Number(process.env["PORT"]) || 8080;
const HOST = process.env["HOST"] ?? "0.0.0.0";

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function productView(product: Product) {
  const { priceCents, ...rest } = product;
  return { ...rest, price: toDollars(priceCents) };
}

function itemView(item: CartItem) {
  const { priceCents, ...rest } = item;
  return { ...rest, price: toDollars(priceCents) };
}

function cartView(c: Cart) {
  const subtotal = c.items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
  return { id: c.id, items: c.items.map(itemView), coupon: c.coupon, subtotal: toDollars(subtotal) };
}

function knownZip(zip: string | null): zip is string {
  return zip !== null && geo.isValidZip(zip) && geo.lookupZip(zip) !== null;
}

/** The totals, or the answer for a coupon or a state the shop does not know. */
function totalsOrProblem(res: ServerResponse, c: Cart, zip: string): Totals | null {
  try {
    return totals.computeTotals(c, zip);
  } catch (error) {
    if (error instanceof UnknownCouponError) send(res, 400, { error: error.message });
    else if (error instanceof UnknownStateError) send(res, 422, { error: error.message });
    else throw error;
    return null;
  }
}

async function handle(req: http.IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  let m: RegExpMatchArray | null;

  if (req.method === "GET" && path === "/products") {
    send(res, 200, catalog.all().map(productView));
  } else if (req.method === "GET" && (m = path.match(/^\/cart\/([^/]+)$/))) {
    const c = cart.getCart(m[1] ?? "");
    if (!c) return send(res, 404, { error: "Cart not found" });
    send(res, 200, cartView(c));
  } else if (req.method === "POST" && (m = path.match(/^\/cart\/([^/]+)\/items$/))) {
    const sku = url.searchParams.get("sku") ?? "";
    const qty = Number(url.searchParams.get("qty"));
    if (!Number.isInteger(qty) || qty < 1) return send(res, 400, { error: "qty must be a whole number, 1 or more" });
    const c = cart.addItem(m[1] ?? "", sku, qty);
    if (!c) return send(res, 404, { error: "Unknown product" });
    send(res, 200, cartView(c));
  } else if (req.method === "POST" && (m = path.match(/^\/cart\/([^/]+)\/coupon$/))) {
    const c = cart.setCoupon(m[1] ?? "", url.searchParams.get("code") ?? "");
    send(res, 200, { ok: true, coupon: c.coupon });
  } else if (req.method === "GET" && (m = path.match(/^\/cart\/([^/]+)\/totals$/))) {
    const c = cart.getCart(m[1] ?? "");
    const zip = url.searchParams.get("zip");
    if (!c) return send(res, 404, { error: "Cart not found" });
    if (!knownZip(zip)) return send(res, 400, { error: "Unknown zip code" });
    const t = totalsOrProblem(res, c, zip);
    if (t) send(res, 200, t);
  } else if (req.method === "POST" && (m = path.match(/^\/checkout\/([^/]+)$/))) {
    const c = cart.getCart(m[1] ?? "");
    const zip = url.searchParams.get("zip");
    if (!c || c.items.length === 0) return send(res, 400, { error: "The cart is empty" });
    if (!knownZip(zip)) return send(res, 400, { error: "Unknown zip code" });
    const t = totalsOrProblem(res, c, zip);
    if (!t) return;
    try {
      const order = await orders.placeOrder(c, t, zip);
      cart.clearCart(c.id);
      send(res, 201, order);
    } catch (error) {
      console.error("checkout failed", error);
      send(res, 500, { error: "Could not place the order" });
    }
  } else {
    send(res, 404, { error: "Not found" });
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    console.error(error);
    if (!res.headersSent) send(res, 500, { error: "Something went wrong" });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Corner Shop listening on http://localhost:${PORT}`);
});
