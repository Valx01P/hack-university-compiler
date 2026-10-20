# Corner Shop checkout

The checkout service behind the Corner Shop website. Written in a hurry for the 2019 holiday
season and still running. TODO: add types someday.

## Running it

    npm start

It listens on PORT (8080 if you don't set it) and prints its address. `npm test` runs the
tests.

## Endpoints

- `GET /products` - the catalog
- `GET /cart/:id` - a cart
- `POST /cart/:id/item?sku=P001&qty=2` - add something to a cart
- `POST /cart/:id/coupon?code=SAVE10` - use a coupon
- `GET /cart/:id/totals?zip=94103` - subtotal, discount, tax, shipping, total
- `POST /checkout/:id?zip=94103` - place the order (saved to data/orders.json)

## The code

```text
server.js            the HTTP server: one if per route, and the handlers
lib/cart.js          carts, in memory, keyed by the id in the URL
lib/catalog.js       the products, read from data/products.json at startup
lib/discounts.js     the coupons in data/coupons.json, and applyCoupon
lib/tax.js           sales tax rates by state
lib/shipping.js      free over $50, otherwise a rate by zone
lib/totals.js        a cart's subtotal, discount, tax, shipping, and total
lib/orders.js        appends orders to data/orders.json
lib/format.js        money as "12.50"
lib/util.js          helpers
vendor/geo-lookup.js zip code to state and city (a vendored copy, don't edit)
data/                products, coupons, and the orders placed so far
test/                tests for the totals
```

## One request, start to finish

`GET /cart/r1/totals?zip=94103`:

1. `server.js` matches the path with a regex, finds the cart with `cart.getCart("r1")`, and
   checks the zip with `geo.isValidZip` and `geo.lookupZip`.
2. `lib/totals.js` `computeTotals` works out each line with `lineTotal`, adds them up, and
   asks `lib/discounts.js` `applyCoupon` what the cart's coupon takes off.
3. It looks up the zip's state in `vendor/geo-lookup.js`, gets the tax from `lib/tax.js`
   `taxFor`, and the shipping from `lib/shipping.js` `shippingFor`.
4. `lib/format.js` `formatMoney` turns each amount into a string with two decimals, and
   `server.js` sends them back as JSON.

## Notes

- Free shipping over $50.
- VIP carts are the ones whose id starts with `vip-`.
- If totals ever show NaN, restart the server (?)
