-- Demo data for Bramble Coffee: 4 customers, 8 products, and 12 orders placed between
-- 2026-09-20 and 2026-09-30, before the workspace clock (2026-10-01T09:00:00Z). npm run
-- db:reset loads it after the migrations, and the checks load it into a fresh database.

INSERT INTO customers (id, name, email) VALUES
  ('cus_01', 'Ada Lovelace', 'ada@example.com'),
  ('cus_02', 'Grace Hopper', 'grace@example.com'),
  ('cus_03', 'Alan Turing', 'alan@example.com'),
  ('cus_04', 'Katherine Johnson', 'katherine@example.com');

INSERT INTO products (sku, name, price_cents, stock) VALUES
  ('COF-ETH-250', 'Ethiopia Yirgacheffe 250 g', 1450, 40),
  ('COF-COL-250', 'Colombia Huila 250 g', 1350, 35),
  ('COF-DEC-250', 'Swiss Water Decaf 250 g', 1500, 8),
  ('COF-ESP-1KG', 'Espresso Blend 1 kg', 3900, 12),
  ('GEA-V60-02', 'V60 Dripper', 2400, 15),
  ('GEA-KET-01', 'Gooseneck Kettle', 5900, 5),
  ('GEA-GRD-01', 'Burr Grinder', 12900, 3),
  ('GEA-FLT-100', 'Paper Filters x100', 650, 0);

-- 3 pending, 3 paid, 3 shipped, 2 delivered, and 1 cancelled. ord_0007 is the delivered
-- $129.00 grinder that the capstone refunds.
INSERT INTO orders (id, customer_id, status, note, created_at, paid_at, payment_ref, shipped_at, carrier, tracking_number, delivered_at, cancelled_at, cancel_reason) VALUES
  ('ord_0001', 'cus_01', 'delivered', NULL, '2026-09-20T09:12:00.000Z', '2026-09-20T09:20:00.000Z', 'pay_0001', '2026-09-21T15:00:00.000Z', 'ups', '1Z999AA10123456784', '2026-09-23T12:40:00.000Z', NULL, NULL),
  ('ord_0002', 'cus_02', 'shipped', NULL, '2026-09-21T14:30:00.000Z', '2026-09-21T14:35:00.000Z', 'pay_0002', '2026-09-24T10:00:00.000Z', 'dhl', '7350123456', NULL, NULL, NULL),
  ('ord_0003', 'cus_01', 'shipped', NULL, '2026-09-22T08:45:00.000Z', '2026-09-22T08:50:00.000Z', 'pay_0003', '2026-09-25T16:30:00.000Z', 'usps', '9400111202555842332669', NULL, NULL, NULL),
  ('ord_0004', 'cus_03', 'cancelled', NULL, '2026-09-23T16:20:00.000Z', NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-23T17:05:00.000Z', 'Ordered the wrong roast'),
  ('ord_0005', 'cus_02', 'shipped', NULL, '2026-09-24T11:05:00.000Z', '2026-09-24T11:10:00.000Z', 'pay_0005', '2026-09-26T09:45:00.000Z', 'ups', '1Z999AA10123456785', NULL, NULL, NULL),
  ('ord_0006', 'cus_03', 'paid', NULL, '2026-09-25T10:00:00.000Z', '2026-09-25T10:04:00.000Z', 'pay_0006', NULL, NULL, NULL, NULL, NULL, NULL),
  ('ord_0007', 'cus_01', 'delivered', NULL, '2026-09-26T09:30:00.000Z', '2026-09-26T09:31:00.000Z', 'pay_0007', '2026-09-27T11:00:00.000Z', 'ups', '1Z999AA10123456786', '2026-09-29T14:20:00.000Z', NULL, NULL),
  ('ord_0008', 'cus_02', 'paid', NULL, '2026-09-28T13:15:00.000Z', '2026-09-28T13:20:00.000Z', 'pay_0008', NULL, NULL, NULL, NULL, NULL, NULL),
  ('ord_0009', 'cus_03', 'paid', NULL, '2026-09-30T08:05:00.000Z', '2026-09-30T08:12:00.000Z', 'pay_0009', NULL, NULL, NULL, NULL, NULL, NULL),
  ('ord_0010', 'cus_01', 'pending', 'Gift wrap, please', '2026-09-30T09:10:00.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('ord_0011', 'cus_02', 'pending', NULL, '2026-09-30T15:25:00.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('ord_0012', 'cus_03', 'pending', NULL, '2026-09-30T18:40:00.000Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);

INSERT INTO order_lines (order_id, line_no, sku, name, quantity, unit_price_cents) VALUES
  ('ord_0001', 1, 'COF-ETH-250', 'Ethiopia Yirgacheffe 250 g', 2, 1450),
  ('ord_0002', 1, 'COF-COL-250', 'Colombia Huila 250 g', 1, 1350),
  ('ord_0002', 2, 'GEA-FLT-100', 'Paper Filters x100', 1, 650),
  ('ord_0003', 1, 'GEA-V60-02', 'V60 Dripper', 1, 2400),
  ('ord_0003', 2, 'GEA-FLT-100', 'Paper Filters x100', 2, 650),
  ('ord_0004', 1, 'COF-DEC-250', 'Swiss Water Decaf 250 g', 1, 1500),
  ('ord_0005', 1, 'COF-ESP-1KG', 'Espresso Blend 1 kg', 1, 3900),
  ('ord_0005', 2, 'COF-ETH-250', 'Ethiopia Yirgacheffe 250 g', 1, 1450),
  ('ord_0006', 1, 'GEA-KET-01', 'Gooseneck Kettle', 1, 5900),
  ('ord_0007', 1, 'GEA-GRD-01', 'Burr Grinder', 1, 12900),
  ('ord_0008', 1, 'COF-COL-250', 'Colombia Huila 250 g', 2, 1350),
  ('ord_0009', 1, 'COF-ETH-250', 'Ethiopia Yirgacheffe 250 g', 1, 1450),
  ('ord_0009', 2, 'GEA-V60-02', 'V60 Dripper', 1, 2400),
  ('ord_0010', 1, 'COF-DEC-250', 'Swiss Water Decaf 250 g', 2, 1500),
  ('ord_0011', 1, 'COF-ESP-1KG', 'Espresso Blend 1 kg', 1, 3900),
  ('ord_0012', 1, 'COF-COL-250', 'Colombia Huila 250 g', 1, 1350),
  ('ord_0012', 2, 'COF-ETH-250', 'Ethiopia Yirgacheffe 250 g', 1, 1450);

-- The audit rows the event listeners would have written for these orders.
INSERT INTO order_events (order_id, type, at) VALUES
  ('ord_0001', 'order.created', '2026-09-20T09:12:00.000Z'),
  ('ord_0001', 'order.paid', '2026-09-20T09:20:00.000Z'),
  ('ord_0001', 'order.shipped', '2026-09-21T15:00:00.000Z'),
  ('ord_0004', 'order.created', '2026-09-23T16:20:00.000Z'),
  ('ord_0004', 'order.cancelled', '2026-09-23T17:05:00.000Z'),
  ('ord_0007', 'order.created', '2026-09-26T09:30:00.000Z'),
  ('ord_0007', 'order.paid', '2026-09-26T09:31:00.000Z'),
  ('ord_0007', 'order.shipped', '2026-09-27T11:00:00.000Z');
