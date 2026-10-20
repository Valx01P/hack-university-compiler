-- QuickCart schema. Rebuilt by `npm run db:reset` (schema.sql then seed.sql).
DROP TABLE IF EXISTS order_items, orders, cart_items, carts, coupons, products, users CASCADE;

CREATE TABLE users (
  id serial PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  name text,
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE products (
  id serial PRIMARY KEY,
  sku text,
  name text NOT NULL,
  slug text,
  price numeric(10,2) NOT NULL,
  stock int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE coupons (
  code text PRIMARY KEY,
  percent int,
  amount numeric(10,2),
  expires_at date
);

CREATE TABLE carts (
  id serial PRIMARY KEY,
  user_id int REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE cart_items (
  id serial PRIMARY KEY,
  cart_id int REFERENCES carts(id),
  product_id int REFERENCES products(id),
  quantity int NOT NULL
);

CREATE TABLE orders (
  id serial PRIMARY KEY,
  user_id int REFERENCES users(id),
  total numeric NOT NULL,
  coupon_code text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE order_items (
  id serial PRIMARY KEY,
  order_id int REFERENCES orders(id),
  product_id int REFERENCES products(id),
  quantity int NOT NULL,
  unit_price numeric(10,2) NOT NULL
);
