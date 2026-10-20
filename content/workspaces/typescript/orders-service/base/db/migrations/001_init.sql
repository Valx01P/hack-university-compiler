-- Bramble Coffee's first schema: customers, products, orders, and the lines of each order.
-- Money is whole cents (INTEGER), and times are ISO 8601 text in UTC, which sorts in time
-- order as plain text.
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL
);

CREATE TABLE products (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0)
);

-- One row per order. The columns after created_at fill in as the order moves through its
-- states, so a pending order has no paid_at and a paid order has no shipped_at.
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers (id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  note TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  payment_ref TEXT,
  shipped_at TEXT,
  carrier TEXT,
  tracking_number TEXT,
  delivered_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT
);

-- Each line keeps the name and price the customer saw, so changing a product later never
-- changes an order that was already placed.
CREATE TABLE order_lines (
  order_id TEXT NOT NULL REFERENCES orders (id),
  line_no INTEGER NOT NULL,
  sku TEXT NOT NULL REFERENCES products (sku),
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  PRIMARY KEY (order_id, line_no)
);

-- The order lists page newest first by (created_at, id), so these indexes match them.
CREATE INDEX orders_by_created ON orders (created_at DESC, id DESC);
CREATE INDEX orders_by_status ON orders (status, created_at DESC, id DESC);
CREATE INDEX orders_by_customer ON orders (customer_id, created_at DESC, id DESC);
