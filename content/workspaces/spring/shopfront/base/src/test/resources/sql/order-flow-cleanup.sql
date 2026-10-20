-- Removes everything order-flow-data.sql adds, and any order placed with it. Runs before each
-- OrderFlowTest test (in case an earlier run stopped halfway) and after each one.
DELETE FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE email = 'flow@example.com');
DELETE FROM customers WHERE email = 'flow@example.com';
DELETE FROM products WHERE sku = 'ZZ-001';
DELETE FROM categories WHERE slug = 'test-goods';
