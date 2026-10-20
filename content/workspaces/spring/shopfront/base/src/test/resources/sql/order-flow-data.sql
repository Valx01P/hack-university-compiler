-- One customer (password flow-pass-123) and one product with 5 in stock, for OrderFlowTest.
INSERT INTO customers (email, name, password_hash, role, created_at)
VALUES ('flow@example.com', 'Flo Tester', '{bcrypt}$2a$10$pPYPa1baYL/AS99V0pygVO4DEAcUTMbqjcII7CzzKhDq4hkhg6BGm',
        'CUSTOMER', '2026-03-01 09:00:00+00');

INSERT INTO categories (name, slug) VALUES ('Test Goods', 'test-goods');

INSERT INTO products (sku, name, description, price_cents, stock, category_id)
SELECT 'ZZ-001', 'Test Widget', 'Made for OrderFlowTest.', 1000, 5, id FROM categories WHERE slug = 'test-goods';
