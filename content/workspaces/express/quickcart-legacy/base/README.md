# QuickCart

Store API for QuickCart. Node 12, Express, Postgres.

## Setup

```
npm install
createdb quickcart
psql quickcart < schema.sql
psql quickcart < seed.sql
npm run start:dev
```

Set `DATABASE_URL`, `JWT_SECRET`, and `PORT` in your environment first.

## Endpoints

- `POST /signup` — create an account, returns a token
- `POST /login` — log in, returns a token
- `GET /products` — list products (supports `?search=`, `?sort=`, `?page=`)
- `GET /product/:id` — one product
- `POST /cart/add` — add an item to your cart
- `GET /cart` — your cart
- `POST /checkout` — place an order from a list of items
- `GET /orders` — your orders
- `GET /orders/:id` — one order
- `POST /admin/products` — add a product (admin)

## TODO

- [x] products and cart
- [x] checkout
- [ ] wrap checkout in a transaction
- [ ] write some tests (the one in test/ is skipped)
- [ ] stop logging the whole request body
- [ ] pagination is off by one somewhere
