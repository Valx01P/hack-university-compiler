-- The audit trail: one row each time an order is created, paid, shipped, or cancelled. The
-- event listeners in src/app.ts write these rows after the change is committed.
CREATE TABLE order_events (
  id INTEGER PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (id),
  type TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE INDEX order_events_by_order ON order_events (order_id, id);
