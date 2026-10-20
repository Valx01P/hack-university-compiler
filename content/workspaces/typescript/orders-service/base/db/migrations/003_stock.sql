-- Stock on hand per product. The CHECK is the last line of defense: the service checks stock
-- before it writes, and if two orders race for the last bag, the database refuses the one
-- that would go below zero.
ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0);
