-- Indexes for the queries the app runs most. PostgreSQL indexes primary keys and UNIQUE columns
-- by itself (order_lines (order_id, product_id) covers lookups by order_id), but not other foreign keys.
CREATE INDEX products_category_id_idx ON products (category_id);
CREATE INDEX orders_customer_id_placed_at_idx ON orders (customer_id, placed_at DESC, id DESC);
CREATE INDEX order_lines_product_id_idx ON order_lines (product_id);
