// The Corner Shop checkout service: a plain node:http server. Each route is an if on the
// path, and its handler talks to the lib/ modules directly: carts, the catalog, coupons,
// totals, and orders.
const http = require("http");
const cart = require("./lib/cart");
const catalog = require("./lib/catalog");
const discounts = require("./lib/discounts");
const totals = require("./lib/totals");
const orders = require("./lib/orders");
const geo = require("./vendor/geo-lookup");

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function cartView(c) {
  let subtotal = 0;
  c.items.forEach(function (item) {
    subtotal += item.price * item.qty;
  });
  return { id: c.id, items: c.items, coupon: c.coupon, subtotal: subtotal };
}

function knownZip(zip) {
  return geo.isValidZip(zip) && geo.lookupZip(zip) !== null;
}

const server = http.createServer(function (req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  let m;

  if (req.method === "GET" && path === "/products") {
    send(res, 200, catalog.all());
  } else if (req.method === "GET" && (m = path.match(/^\/cart\/([^/]+)$/))) {
    const c = cart.getCart(m[1]);
    if (!c) return send(res, 404, { error: "Cart not found" });
    send(res, 200, cartView(c));
  } else if (req.method === "POST" && (m = path.match(/^\/cart\/([^/]+)\/items$/))) {
    const sku = url.searchParams.get("sku");
    const qty = url.searchParams.get("qty");
    const c = cart.addItem(m[1], sku, qty);
    if (!c) return send(res, 404, { error: "Unknown product" });
    send(res, 200, cartView(c));
  } else if (req.method === "POST" && (m = path.match(/^\/cart\/([^/]+)\/coupon$/))) {
    const code = url.searchParams.get("code");
    const c = cart.setCoupon(m[1], code);
    send(res, 200, { ok: true, coupon: c.coupon });
  } else if (req.method === "GET" && (m = path.match(/^\/cart\/([^/]+)\/totals$/))) {
    const c = cart.getCart(m[1]);
    const zip = url.searchParams.get("zip");
    if (!c) return send(res, 404, { error: "Cart not found" });
    if (!knownZip(zip)) return send(res, 400, { error: "Unknown zip code" });
    const state = geo.lookupZip(zip).state;
    if (!(state in require("./lib/tax").TAX_RATES)) return send(res, 422, { error: "We don't ship to " + state + " yet" });
    send(res, 200, totals.computeTotals(c, zip));
  } else if (req.method === "POST" && (m = path.match(/^\/checkout\/([^/]+)$/))) {
    const c = cart.getCart(m[1]);
    const zip = url.searchParams.get("zip");
    if (!c || c.items.length === 0) return send(res, 400, { error: "The cart is empty" });
    if (!knownZip(zip)) return send(res, 400, { error: "Unknown zip code" });
    const t = totals.computeTotals(c, zip);
    orders.placeOrder(c, t, function (err, order) {
      if (err) {
        console.error("checkout failed", err);
        return send(res, 500, { error: "Could not place the order" });
      }
      cart.clearCart(c.id);
      send(res, 201, order);
    });
  } else {
    send(res, 404, { error: "Not found" });
  }
});

server.listen(PORT, HOST, function () {
  console.log("Corner Shop listening on http://localhost:" + PORT);
});
