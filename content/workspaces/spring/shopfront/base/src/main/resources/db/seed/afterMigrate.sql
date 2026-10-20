-- Dev seed data, applied by Flyway after every migrate when the dev profile adds classpath:db/seed
-- to spring.flyway.locations. It is idempotent: rows that already exist are skipped (ON CONFLICT DO NOTHING),
-- so restarting the app never duplicates them, and Reset database brings them all back.
-- Tests and checks never load it: they start from the migrations alone.

-- Passwords: ana-pass-123, bob-pass-123, cy-pass-123, admin-pass-123 (bcrypt, cost 10).
INSERT INTO customers (id, email, name, password_hash, role, created_at) VALUES
    (1, 'ana@example.com', 'Ana Lima', '{bcrypt}$2a$10$Sz184CgJKktsabWeqQDv2OQ0c.J5Y7gMyHxue9NdCYNJdsRicpm0y', 'CUSTOMER', '2026-01-05 10:00:00+00'),
    (2, 'bob@example.com', 'Bob Mensah', '{bcrypt}$2a$10$YrFt/pG/7cihGyx8ZoDveOnLL0Xmreb3aXJw9SEPwkU5ooXX2tnh2', 'CUSTOMER', '2026-01-12 14:30:00+00'),
    (3, 'cy@example.com', 'Cy Park', '{bcrypt}$2a$10$xnVeR8dxp969XI2Esz0NT.pGU39zcBGAlEde7y9JLv.oF2XDtD0o.', 'CUSTOMER', '2026-01-20 09:15:00+00'),
    (4, 'admin@example.com', 'Shop Admin', '{bcrypt}$2a$10$Z7Zx6mUBn8gxfQoF.Bi/huGu//Mj2DIMOlIxEJGY/KOc/avt6mwSS', 'ADMIN', '2026-01-02 08:00:00+00')
ON CONFLICT DO NOTHING;

INSERT INTO categories (id, name, slug) VALUES
    (1, 'Books', 'books'),
    (2, 'Electronics', 'electronics'),
    (3, 'Kitchen', 'kitchen'),
    (4, 'Outdoors', 'outdoors')
ON CONFLICT DO NOTHING;

-- Stock runs from 0 to 40: BK-005 and KT-003 are sold out, and KT-004 has exactly one left.
INSERT INTO products (id, sku, name, description, price_cents, stock, category_id) VALUES
    (1, 'BK-001', 'The Pragmatic Programmer', 'Hunt and Thomas on the habits of effective programmers. 20th anniversary edition, hardcover.', 4499, 25, 1),
    (2, 'BK-002', 'Designing Data-Intensive Applications', 'Martin Kleppmann on storage, replication, and stream processing. Paperback.', 5499, 18, 1),
    (3, 'BK-003', 'Refactoring', 'Martin Fowler''s catalog of refactorings, second edition.', 4999, 12, 1),
    (4, 'BK-004', 'Dune', 'Frank Herbert''s desert planet epic. Paperback.', 1299, 40, 1),
    (5, 'BK-005', 'The Left Hand of Darkness', 'Ursula K. Le Guin''s classic, set on the winter planet Gethen. Paperback.', 1099, 0, 1),
    (6, 'BK-006', 'Kindred', 'Octavia E. Butler''s time-travel novel. Paperback.', 999, 22, 1),
    (7, 'EL-001', 'Mechanical Keyboard', 'Tenkeyless layout with hot-swappable brown switches and USB-C.', 12900, 15, 2),
    (8, 'EL-002', 'Wireless Mouse', 'Silent clicks, three-device pairing, and a battery that lasts months.', 3499, 30, 2),
    (9, 'EL-003', '27-inch 4K Monitor', 'IPS panel at 60 Hz, with USB-C that charges a laptop at 65 W.', 42900, 8, 2),
    (10, 'EL-004', 'Noise-Cancelling Headphones', 'Over-ear, 30-hour battery, folds flat for travel.', 29900, 10, 2),
    (11, 'EL-005', 'USB-C Hub', 'Seven ports: HDMI, Ethernet, SD, three USB-A, and pass-through charging.', 4999, 35, 2),
    (12, 'EL-006', '14-inch Laptop', '16 GB of memory, a 1 TB SSD, and an all-day battery.', 129900, 5, 2),
    (13, 'KT-001', 'Chef''s Knife', 'A 20 cm blade of high-carbon stainless steel.', 7999, 20, 3),
    (14, 'KT-002', 'Cast Iron Skillet', '26 cm, pre-seasoned, and oven safe.', 3999, 16, 3),
    (15, 'KT-003', 'Pour-Over Coffee Kit', 'Glass dripper, 50 paper filters, and a gooseneck kettle.', 4599, 0, 3),
    (16, 'KT-004', 'Stand Mixer', 'A 4.8 litre bowl, ten speeds, and a dough hook and whisk.', 34900, 1, 3),
    (17, 'KT-005', 'Bamboo Cutting Board', '45 by 30 cm, with a juice groove.', 2499, 28, 3),
    (18, 'KT-006', 'Measuring Spoons', 'A set of six in stainless steel.', 499, 40, 3),
    (19, 'OD-001', 'Two-Person Tent', 'Freestanding, 2.1 kg, and up in five minutes.', 18900, 6, 4),
    (20, 'OD-002', 'Sleeping Bag', 'Comfortable down to -5 degrees Celsius, and packs into its own sack.', 9900, 11, 4),
    (21, 'OD-003', 'Trekking Poles', 'A pair in aluminium, adjustable from 105 to 135 cm.', 5999, 14, 4),
    (22, 'OD-004', 'Insulated Water Bottle', '750 ml, keeps drinks cold for 24 hours.', 2999, 33, 4),
    (23, 'OD-005', 'Headlamp', '400 lumens, rechargeable, with a red night mode.', 2499, 24, 4),
    (24, 'OD-006', 'Camping Stove', 'A folding gas stove that boils a litre in four minutes.', 6999, 9, 4)
ON CONFLICT DO NOTHING;

-- Ten orders: ana 4, bob 4, cy 2. Tax is 825 basis points (8.25%) of the subtotal, half a cent rounding up.
INSERT INTO orders (id, customer_id, status, currency, tax_rate_basis_points, subtotal_cents, tax_cents, total_cents, placed_at, cancelled_at) VALUES
    (1, 1, 'SHIPPED', 'USD', 825, 7998, 660, 8658, '2026-02-03 15:20:00+00', NULL),
    (2, 2, 'SHIPPED', 'USD', 825, 7999, 660, 8659, '2026-02-07 10:05:00+00', NULL),
    (3, 3, 'CANCELLED', 'USD', 825, 38700, 3193, 41893, '2026-02-10 19:45:00+00', '2026-02-11 08:00:00+00'),
    (4, 1, 'PAID', 'USD', 825, 5094, 420, 5514, '2026-02-18 12:00:00+00', NULL),
    (5, 2, 'SHIPPED', 'USD', 825, 34899, 2879, 37778, '2026-02-25 09:30:00+00', NULL),
    (6, 2, 'PAID', 'USD', 825, 5998, 495, 6493, '2026-03-04 17:10:00+00', NULL),
    (7, 1, 'SHIPPED', 'USD', 825, 6498, 536, 7034, '2026-03-09 11:00:00+00', NULL),
    (8, 3, 'PLACED', 'USD', 825, 12900, 1064, 13964, '2026-03-20 14:25:00+00', NULL),
    (9, 2, 'PLACED', 'USD', 825, 10497, 866, 11363, '2026-03-27 08:40:00+00', NULL),
    (10, 1, 'PLACED', 'USD', 825, 47899, 3952, 51851, '2026-03-31 09:30:00+00', NULL)
ON CONFLICT DO NOTHING;

INSERT INTO order_lines (id, order_id, product_id, quantity, unit_price_cents) VALUES
    (1, 1, 1, 1, 4499),
    (2, 1, 8, 1, 3499),
    (3, 2, 13, 1, 7999),
    (4, 3, 19, 1, 18900),
    (5, 3, 20, 2, 9900),
    (6, 4, 4, 2, 1299),
    (7, 4, 6, 1, 999),
    (8, 4, 18, 3, 499),
    (9, 5, 10, 1, 29900),
    (10, 5, 11, 1, 4999),
    (11, 6, 22, 2, 2999),
    (12, 7, 14, 1, 3999),
    (13, 7, 17, 1, 2499),
    (14, 8, 7, 1, 12900),
    (15, 9, 2, 1, 5499),
    (16, 9, 23, 2, 2499),
    (17, 10, 9, 1, 42900),
    (18, 10, 3, 1, 4999)
ON CONFLICT DO NOTHING;

-- The rows above chose their own ids, so move each identity sequence past the highest id,
-- or the next row the app inserts would collide with a seed row.
SELECT setval(pg_get_serial_sequence('customers', 'id'), (SELECT max(id) FROM customers));
SELECT setval(pg_get_serial_sequence('categories', 'id'), (SELECT max(id) FROM categories));
SELECT setval(pg_get_serial_sequence('products', 'id'), (SELECT max(id) FROM products));
SELECT setval(pg_get_serial_sequence('orders', 'id'), (SELECT max(id) FROM orders));
SELECT setval(pg_get_serial_sequence('order_lines', 'id'), (SELECT max(id) FROM order_lines));
