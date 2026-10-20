# Corner Shop checkout

The checkout service behind the Corner Shop website, first written in 2019 in JavaScript and
now migrated to TypeScript: Node 26 runs the `.ts` files directly, and TypeScript 7 checks
them with `strict` on. Money is whole cents inside the app, the catalog is checked by a zod
schema when it loads, and the vendored zip lookup has a declaration file.

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Starts the server on PORT (8080 outside Hack University). It prints its address |
| `npm run dev` | The same, restarted whenever a file changes (`node --watch`) |
| `npm test` | The tests, with `node --test` |
| `npm run typecheck` | `tsc` |
| `npm run lint` | ESLint with typescript-eslint |

## Endpoints

| Method and path | What it does |
| --- | --- |
| `GET /products` | The catalog. Prices are dollars, as the API has always sent them |
| `GET /cart/:id` | A cart, 404 when there is none |
| `POST /cart/:id/items?sku=P001&qty=2` | Adds a product. qty must be a whole number, 1 or more |
| `POST /cart/:id/coupon?code=SAVE10` | Sets the cart's coupon |
| `GET /cart/:id/totals?zip=94103` | Lines, subtotal, discount, tax, shipping, and total, as "12.50" strings. 400 for an unknown coupon or zip, 422 for a state the shop has no tax rate for |
| `POST /checkout/:id?zip=94103` | Places the order and answers 201 once it is saved in data/orders.json, or 500 when it cannot be saved |

## The code

```text
server.ts                 the HTTP server: one if per route, and the handlers (still one long file)
lib/types.ts              Product, CartItem, Cart, and the Coupon union. Money fields are cents
lib/cart.ts               carts in memory. A change stores a new cart object
lib/catalog.ts            the products, checked by a zod schema when they load
lib/discounts.ts          the coupons, and applyCoupon, which reads a Readonly<Cart>
lib/tax.ts                tax by the zip's state, and UnknownStateError
lib/shipping.ts           free over $50, otherwise a rate by zone
lib/totals.ts             a cart's totals, in cents until they are formatted
lib/orders.ts             placeOrder: appends to data/orders.json and resolves once it is written
lib/format.ts, util.ts    cents as "12.50", and helpers
lib/clock.ts              now(), frozen by HU_FIXED_TIME
vendor/geo-lookup.cjs     zip code to state and city (vendored CommonJS, don't edit)
vendor/geo-lookup.d.cts   the types for it
test/                     tests for the totals
```

## One request, start to finish

`GET /cart/r1/totals?zip=94103`:

1. `server.ts` matches the path, finds the cart with `getCart("r1")` (a `Cart | undefined`, so
   a missing cart is a 404), and checks the zip with the vendor's `isValidZip` and
   `lookupZip`, typed by `vendor/geo-lookup.d.cts`.
2. `lib/totals.ts` `computeTotals` works out each line in cents, and asks `applyCoupon` in
   `lib/discounts.ts` what the coupon does: cents off, and whether shipping is free. An
   unknown code is an `UnknownCouponError`, which `server.ts` answers with 400.
3. `lib/tax.ts` finds the zip's state and its rate, or throws `UnknownStateError` (422), and
   `lib/shipping.ts` picks the zone's rate.
4. The line totals are sorted with a compare function, `formatCents` turns each amount into a
   string, and `server.ts` sends them back as JSON.
