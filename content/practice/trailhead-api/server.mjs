// The Trailhead API: the course's backend, in one file with no dependencies.
// Start it with `node server.mjs`. It listens on http://127.0.0.1:4000/v1,
// keeps everything in memory, and starts from the same seed data every time.
import http from "node:http";
import { createHash, randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 4000);
const NOW = new Date(process.env.HU_FIXED_TIME ?? "2026-10-01T09:00:00Z");
const DELAYS = process.env.TRAILHEAD_DELAYS === "1";
const TEST_MODE = process.env.TRAILHEAD_TEST === "1";
const ALLOWED_ORIGINS = new Set(
  (process.env.TRAILHEAD_ORIGINS ?? "http://localhost:5173,http://localhost:4173,http://127.0.0.1:3005").split(","),
);

// Response delays, in milliseconds, used only when TRAILHEAD_DELAYS=1.
const DELAY = { products: 300, product: 200, reviews: 900, me: 150, cart: 400 };

// ---------------------------------------------------------------- seed data

const CATALOG = [
  ["trail-pack-45", "Trail Pack 45L", "packs", 18900, 14, "A 45-liter pack for multi-day trips, with a floating lid, an adjustable torso, and side pockets you can reach while walking.", "1.4 kg", "210D nylon ripstop"],
  ["summit-daypack-22", "Summit Daypack 22L", "packs", 8900, 9, "A light daypack with a hydration sleeve, a padded hip belt, and room for a shell and lunch.", "0.7 kg", "100D recycled nylon"],
  ["hip-pack-5", "Hip Pack 5L", "packs", 3900, 0, "A 5-liter hip pack for runs and short hikes, with two water-resistant zip pockets.", "200 g", "Coated polyester"],
  ["ridge-2p-tent", "Ridge 2P Tent", "tents", 34900, 4, "A freestanding two-person tent with a double-wall ripstop fly, two doors, and two vestibules for wet gear.", "1.8 kg", "20D silicone-coated nylon"],
  ["alpine-1p-tent", "Alpine 1P Tent", "tents", 27900, 0, "A low, wind-shedding solo tent that pitches fly first in a storm.", "1.1 kg", "15D nylon ripstop"],
  ["basecamp-4p-tent", "Basecamp 4P Tent", "tents", 52900, 2, "A roomy dome for four, with standing height in the middle and a large front vestibule.", "4.6 kg", "68D polyester"],
  ["storm-shell-jacket", "Storm Shell Jacket", "apparel", 21900, 20, "A waterproof, breathable three-layer shell with pit zips and a helmet-compatible hood.", "400 g", "3-layer waterproof nylon"],
  ["merino-base-layer", "Merino Base Layer", "apparel", 9500, 35, "A long-sleeve crew in soft merino wool that stays warm when damp and resists odor.", "200 g", "100% merino wool"],
  ["trail-runner-cap", "Trail Runner Cap", "apparel", 2800, 40, "A light, quick-drying cap with a soft brim that packs flat.", "60 g", "Recycled polyester"],
  ["ember-stove", "Ember Stove", "cooking", 6400, 11, "A compact canister stove that boils a liter of water in about four minutes.", "85 g", "Titanium and aluminum"],
  ["titan-pot-set", "Titan Pot Set", "cooking", 7900, 16, "Two nesting titanium pots with a lid that doubles as a frying pan.", "310 g", "Titanium"],
  ["camp-kettle-1l", "Camp Kettle 1L", "cooking", 3400, 18, "A one-liter aluminum kettle with a pour spout and a folding handle.", "180 g", "Hard-anodized aluminum"],
];
const CATEGORIES = ["packs", "tents", "apparel", "cooking"];

// Two accounts you can log in as, and reviewers who only appear in reviews.
const USERS = [
  { id: "u_1", email: "sam@example.com", name: "Sam", password: "trailhead" },
  { id: "u_2", email: "ana@example.com", name: "Ana", password: "trailhead" },
];
const REVIEWERS = [
  { id: "u_3", name: "Lee" }, { id: "u_4", name: "Priya" }, { id: "u_5", name: "Marco" },
  { id: "u_6", name: "June" }, { id: "u_7", name: "Tomas" }, { id: "u_8", name: "Kemi" },
];
// [slug, rating, title, body]. Every product but camp-kettle-1l has reviews.
const SEED_REVIEWS = [
  ["trail-pack-45", 5, "Carries a week of food", "The torso adjusts in seconds, and the hip belt takes the weight off my shoulders."],
  ["trail-pack-45", 4, "Great lid pocket", "The floating lid holds everything I want at a stop. A little heavy for day hikes."],
  ["trail-pack-45", 5, "Comfortable all day", "Twenty miles in and no sore spots."],
  ["summit-daypack-22", 5, "Just big enough", "Fits a shell, lunch, and a liter of water with room to spare."],
  ["summit-daypack-22", 4, "Good hip belt", "Padded and stable on steep trail."],
  ["hip-pack-5", 4, "Stays put on runs", "No bounce, and the zips keep my phone dry in drizzle."],
  ["ridge-2p-tent", 5, "Two doors make all the difference", "Nobody climbs over anybody at 3 a.m."],
  ["ridge-2p-tent", 4, "Dry through a storm", "Held up to a night of rain. The vestibules fit two packs."],
  ["alpine-1p-tent", 5, "Sheds wind well", "Pitched fly first in a gale and slept fine."],
  ["basecamp-4p-tent", 4, "Room to stand up", "The family fits, gear and all. Takes two people to pitch."],
  ["storm-shell-jacket", 5, "Dry all day", "Six hours of rain on the ridge and dry underneath."],
  ["storm-shell-jacket", 4, "Packs small", "Rolls into its own pocket. The hood fits over a helmet."],
  ["merino-base-layer", 5, "Warm even when wet", "Sweated through it on the climb and stayed warm on the way down."],
  ["merino-base-layer", 5, "No smell after three days", "Wore it the whole trip."],
  ["trail-runner-cap", 4, "Light and dries fast", "Soaked it in a creek at noon and it was dry by lunch."],
  ["ember-stove", 5, "Boils fast", "A liter in just over four minutes, even at altitude."],
  ["ember-stove", 4, "Tiny in the pack", "Fits inside my pot with a canister."],
  ["ember-stove", 5, "Simmers well", "Turns down low enough to cook rice without burning it."],
  ["ember-stove", 3, "Struggles in wind", "Bring a windscreen if you camp above treeline."],
  ["ember-stove", 5, "Reliable", "Two seasons and it lights first time, every time."],
  ["ember-stove", 4, "Good value", "Does everything my old stove did at half the weight."],
  ["ember-stove", 5, "Great for two", "Cooked dinner for two every night of a week-long trip."],
  ["ember-stove", 4, "Easy to clean", "Nothing to clog, and the arms fold flat."],
  ["ember-stove", 5, "Solid pot supports", "Holds a big pot steady on uneven ground."],
  ["ember-stove", 4, "Quiet", "Much quieter than the roaring kind."],
  ["ember-stove", 5, "My go-to stove", "It's the first thing I pack."],
  ["ember-stove", 4, "Light and simple", "No piezo to break, just a match or a lighter."],
  ["titan-pot-set", 4, "The lid is a pan", "Fried eggs in the lid while the coffee boiled below."],
  ["titan-pot-set", 5, "Light and tough", "Dropped it on rock twice. Not a dent."],
];

const summaryOf = (p) => ({
  slug: p.slug, name: p.name, category: p.category, priceCents: p.priceCents,
  imageUrl: p.imageUrl, rating: ratingOf(p.slug), inStock: p.stock > 0,
});
const detailOf = (p) => ({
  ...summaryOf(p), description: p.description, images: p.images, stock: p.stock, specs: p.specs, updatedAt: p.updatedAt,
});

let products, reviews, sessions, carts, orders, idempotencyKeys, failedLogins;

function reset() {
  products = CATALOG.map(([slug, name, category, priceCents, stock, description, weight, material]) => ({
    slug, name, category, priceCents, stock, description,
    imageUrl: `/images/products/${slug}.webp`,
    images: [`/images/products/${slug}.webp`],
    specs: { weight, material },
    updatedAt: NOW.toISOString(),
  }));
  // Newest first: the first seed review is one day old, the next two days, and so on.
  reviews = SEED_REVIEWS.map(([productSlug, rating, title, body], i) => ({
    id: `r_${String(i + 1).padStart(3, "0")}`,
    productSlug, rating, title, body,
    author: REVIEWERS[i % REVIEWERS.length],
    createdAt: new Date(NOW.getTime() - (i + 1) * 86_400_000).toISOString(),
  }));
  sessions = new Map(); // session id -> user id
  carts = new Map(); // user id -> Map(slug -> quantity)
  orders = new Map(); // order id -> order
  idempotencyKeys = new Map(); // key -> order id
  failedLogins = new Map(); // email -> { count, lockedUntil }
}
reset();

function ratingOf(slug) {
  const list = reviews.filter((r) => r.productSlug === slug);
  if (list.length === 0) return { average: 0, count: 0 };
  const average = list.reduce((sum, r) => sum + r.rating, 0) / list.length;
  return { average: Math.round(average * 10) / 10, count: list.length };
}

// ---------------------------------------------------------------- helpers

const wait = (ms) => (DELAYS ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

function send(res, status, body, headers = {}) {
  const json = body === undefined ? undefined : JSON.stringify(body);
  res.writeHead(status, {
    ...(json === undefined ? {} : { "Content-Type": status >= 400 ? "application/problem+json" : "application/json" }),
    ...headers,
  });
  res.end(json);
}

// An RFC 9457 problem: type, title, status, and an optional detail and extras.
const problem = (res, status, title, extra = {}, headers = {}) =>
  send(res, status, { type: "about:blank", title, status, ...extra }, headers);
const invalid = (res, errors) => problem(res, 422, "Validation failed", { errors });

const etagOf = (body) => `"${createHash("sha1").update(JSON.stringify(body)).digest("hex").slice(0, 16)}"`;
const encodeCursor = (offset) => Buffer.from(String(offset)).toString("base64url");
function decodeCursor(cursor) {
  const offset = Number(Buffer.from(cursor, "base64url").toString());
  return Number.isInteger(offset) && offset >= 0 ? offset : null;
}

// A session ID arrives in the th_session cookie, or as a bearer token.
function sessionId(req) {
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "")?.[1];
  return bearer ?? /(?:^|;\s*)th_session=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
}
function userFrom(req) {
  const id = sessions.get(sessionId(req));
  return USERS.find((u) => u.id === id);
}
const publicUser = ({ id, email, name }) => ({ id, email, name });

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cartOf(user) {
  const items = [...(carts.get(user.id) ?? new Map())].map(([slug, quantity]) => {
    const p = products.find((x) => x.slug === slug);
    return { slug, name: p.name, priceCents: p.priceCents, quantity, lineTotalCents: p.priceCents * quantity };
  });
  return { items, subtotalCents: items.reduce((sum, i) => sum + i.lineTotalCents, 0), currency: "USD" };
}

const isWholeNumber = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function addressErrors(address) {
  const errors = {};
  if (typeof address !== "object" || address === null) return { shippingAddress: "Required." };
  for (const field of ["name", "line1", "city", "region", "postalCode"]) {
    if (typeof address[field] !== "string" || address[field].trim() === "") errors[`shippingAddress.${field}`] = "Required.";
  }
  if (address.line2 !== undefined && typeof address.line2 !== "string") errors["shippingAddress.line2"] = "Must be text.";
  if (typeof address.country !== "string" || !/^[A-Z]{2}$/.test(address.country)) {
    errors["shippingAddress.country"] = "Use a two-letter country code, like US.";
  }
  return errors;
}

// ---------------------------------------------------------------- routes

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  if (TEST_MODE && req.method === "POST" && url.pathname === "/__reset") { reset(); return send(res, 204); }
  if (parts[0] !== "v1") return problem(res, 404, "Not Found");
  const [, a, b, c, d] = parts;
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(req.method);

  // CSRF defense: a browser always sends Origin on a cross-site POST, PUT, or DELETE.
  if (unsafe && req.headers.origin && !ALLOWED_ORIGINS.has(req.headers.origin)) {
    return problem(res, 403, "Forbidden", { detail: `Origin ${req.headers.origin} is not allowed.` });
  }

  // listProducts: GET /v1/products?category=&q=&sort=&page=&pageSize=
  if (req.method === "GET" && a === "products" && !b) {
    await wait(DELAY.products);
    const q = url.searchParams;
    const category = q.get("category");
    const search = q.get("q")?.trim().toLowerCase();
    const sort = q.get("sort");
    const page = Number(q.get("page") ?? 1);
    const pageSize = Number(q.get("pageSize") ?? 20);
    const errors = {};
    if (category && !CATEGORIES.includes(category)) errors.category = "Must be one of packs, tents, apparel, cooking.";
    if (sort && !["price", "-price", "name", "rating"].includes(sort)) errors.sort = "Must be one of price, -price, name, rating.";
    if (!isWholeNumber(page, 1, Infinity)) errors.page = "Must be a whole number, 1 or more.";
    if (!isWholeNumber(pageSize, 1, 50)) errors.pageSize = "Must be from 1 to 50.";
    if (Object.keys(errors).length) return invalid(res, errors);
    let all = products
      .filter((p) => (!category || p.category === category) && (!search || p.name.toLowerCase().includes(search)))
      .map(summaryOf);
    if (sort === "price") all.sort((x, y) => x.priceCents - y.priceCents);
    if (sort === "-price") all.sort((x, y) => y.priceCents - x.priceCents);
    if (sort === "name") all.sort((x, y) => x.name.localeCompare(y.name));
    if (sort === "rating") all.sort((x, y) => y.rating.average - x.rating.average);
    const items = all.slice((page - 1) * pageSize, page * pageSize);
    return send(res, 200, { items, page, pageSize, total: all.length }, {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    });
  }

  // getProduct: GET /v1/products/{slug}, with an ETag and 304
  if (req.method === "GET" && a === "products" && b && !c) {
    await wait(DELAY.product);
    const p = products.find((x) => x.slug === b);
    if (!p) return problem(res, 404, "Not Found", { detail: `No product ${b}.` });
    const body = detailOf(p);
    const etag = etagOf(body);
    if (req.headers["if-none-match"] === etag) return send(res, 304, undefined, { ETag: etag, "Cache-Control": "no-cache" });
    return send(res, 200, body, { ETag: etag, "Cache-Control": "no-cache" });
  }

  // listReviews and createReview: /v1/products/{slug}/reviews
  if (a === "products" && b && c === "reviews" && !d) {
    const p = products.find((x) => x.slug === b);
    if (req.method === "GET") {
      await wait(DELAY.reviews);
      if (!p) return problem(res, 404, "Not Found", { detail: `No product ${b}.` });
      const cursor = url.searchParams.get("cursor");
      const limit = Number(url.searchParams.get("limit") ?? 10);
      const start = cursor ? decodeCursor(cursor) : 0;
      const errors = {};
      if (start === null) errors.cursor = "Use the nextCursor from the previous page.";
      if (!isWholeNumber(limit, 1, 50)) errors.limit = "Must be from 1 to 50.";
      if (Object.keys(errors).length) return invalid(res, errors);
      const all = reviews.filter((r) => r.productSlug === b);
      const items = all.slice(start, start + limit);
      return send(res, 200, { items, nextCursor: start + limit < all.length ? encodeCursor(start + limit) : null });
    }
    if (req.method === "POST") {
      const user = userFrom(req);
      if (!user) return problem(res, 401, "Unauthorized", { detail: "Log in to write a review." });
      if (!p) return problem(res, 404, "Not Found", { detail: `No product ${b}.` });
      const input = await readJson(req);
      const title = typeof input?.title === "string" ? input.title.trim() : "";
      const body = typeof input?.body === "string" ? input.body.trim() : "";
      const errors = {};
      if (!isWholeNumber(input?.rating, 1, 5)) errors.rating = "Pick a rating from 1 to 5.";
      if (title.length < 1 || title.length > 80) errors.title = "Write a title of 1 to 80 characters.";
      if (body.length < 1 || body.length > 2000) errors.body = "Write a review of 1 to 2,000 characters.";
      if (Object.keys(errors).length) return invalid(res, errors);
      if (reviews.some((r) => r.productSlug === b && r.author.id === user.id)) {
        return problem(res, 409, "Conflict", { detail: "You've already reviewed this product." });
      }
      const review = {
        id: `r_${randomUUID().slice(0, 8)}`, productSlug: b, rating: input.rating, title, body,
        author: { id: user.id, name: user.name }, createdAt: NOW.toISOString(),
      };
      reviews.unshift(review);
      return send(res, 201, review, { Location: `/v1/products/${b}/reviews/${review.id}` });
    }
  }

  // login: POST /v1/auth/login
  if (req.method === "POST" && a === "auth" && b === "login") {
    const input = await readJson(req);
    const email = typeof input?.email === "string" ? input.email.toLowerCase() : "";
    const lock = failedLogins.get(email);
    if (lock && lock.lockedUntil > Date.now()) {
      const seconds = Math.ceil((lock.lockedUntil - Date.now()) / 1000);
      return problem(res, 429, "Too Many Requests", { detail: "Too many failed logins. Wait, then try again." }, { "Retry-After": String(seconds) });
    }
    const user = USERS.find((u) => u.email === email && u.password === input?.password);
    if (!user) {
      const count = (lock?.count ?? 0) + 1;
      failedLogins.set(email, { count, lockedUntil: count >= 5 ? Date.now() + 60_000 : 0 });
      return problem(res, 401, "Unauthorized", { detail: "Wrong email or password." });
    }
    failedLogins.delete(email);
    const id = randomUUID();
    sessions.set(id, user.id);
    return send(res, 200, publicUser(user), {
      "Set-Cookie": `th_session=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
    });
  }

  // logout: POST /v1/auth/logout
  if (req.method === "POST" && a === "auth" && b === "logout") {
    sessions.delete(sessionId(req));
    return send(res, 204, undefined, { "Set-Cookie": "th_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });
  }

  const user = userFrom(req);
  const needUser = () => problem(res, 401, "Unauthorized", { detail: "Log in first." });

  // getMe: GET /v1/me
  if (req.method === "GET" && a === "me" && !b) {
    await wait(DELAY.me);
    return user ? send(res, 200, publicUser(user)) : needUser();
  }

  // getCart, setCartItem, removeCartItem: /v1/cart and /v1/cart/items/{slug}
  if (a === "cart") {
    if (req.method === "GET" && !b) {
      await wait(DELAY.cart);
      return user ? send(res, 200, cartOf(user)) : needUser();
    }
    if (b === "items" && c && !d && (req.method === "PUT" || req.method === "DELETE")) {
      if (!user) return needUser();
      const p = products.find((x) => x.slug === c);
      if (!p) return problem(res, 404, "Not Found", { detail: `No product ${c}.` });
      const items = carts.get(user.id) ?? new Map();
      carts.set(user.id, items);
      if (req.method === "DELETE") {
        items.delete(c);
        return send(res, 200, cartOf(user));
      }
      const input = await readJson(req);
      if (!isWholeNumber(input?.quantity, 1, 10)) return invalid(res, { quantity: "Must be from 1 to 10." });
      if (input.quantity > p.stock) {
        return problem(res, 409, "Out of stock", { detail: `Only ${p.stock} left.`, available: p.stock });
      }
      items.set(c, input.quantity);
      return send(res, 200, cartOf(user));
    }
  }

  // createOrder and getOrder: /v1/orders and /v1/orders/{orderId}
  if (a === "orders") {
    if (req.method === "POST" && !b) {
      if (!user) return needUser();
      const key = req.headers["idempotency-key"];
      if (!key) return problem(res, 400, "Bad Request", { detail: "Send an Idempotency-Key header." });
      if (!UUID.test(key)) return problem(res, 400, "Bad Request", { detail: "The Idempotency-Key must be a UUID." });
      if (idempotencyKeys.has(key)) return problem(res, 409, "Conflict", { detail: "This Idempotency-Key was already used." });
      const cart = cartOf(user);
      if (cart.items.length === 0) return problem(res, 409, "Conflict", { detail: "Your cart is empty." });
      const input = await readJson(req);
      const errors = addressErrors(input?.shippingAddress);
      if (Object.keys(errors).length) return invalid(res, errors);
      const order = {
        id: `o_${randomUUID().slice(0, 8)}`, status: "pending", items: cart.items, totalCents: cart.subtotalCents,
        shippingAddress: input.shippingAddress, createdAt: NOW.toISOString(),
      };
      for (const item of cart.items) products.find((p) => p.slug === item.slug).stock -= item.quantity;
      orders.set(order.id, { ...order, userId: user.id });
      idempotencyKeys.set(key, order.id);
      carts.set(user.id, new Map());
      return send(res, 201, order, { Location: `/v1/orders/${order.id}` });
    }
    if (req.method === "GET" && b && !c) {
      if (!user) return needUser();
      const found = orders.get(b);
      // Someone else's order is a 404 too, so ids can't be probed.
      if (!found || found.userId !== user.id) return problem(res, 404, "Not Found", { detail: `No order ${b}.` });
      const { userId, ...order } = found;
      return send(res, 200, order);
    }
  }

  return problem(res, 404, "Not Found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Trailhead API on http://127.0.0.1:${PORT}/v1${DELAYS ? " (with delays)" : ""}`);
});
