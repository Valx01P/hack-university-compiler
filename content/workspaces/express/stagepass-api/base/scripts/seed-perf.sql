-- The performance database (tpl_stagepass_perf) only: the demo seed plus 1,000 customers,
-- 20,000 events, and 60,000 paid orders made with generate_series, so the planner has enough
-- rows to prefer indexes and EXPLAIN shows the plans a real database would.
-- Run it after npm run db:reset: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/seed-perf.sql
BEGIN;

-- Customers 7 to 1006. They share Cam's password hash, so any of them can log in for a test.
INSERT INTO users (id, email, name, role, password_hash, created_at, updated_at)
SELECT 6 + g,
       'customer' || g || '@stagepass.test',
       'Customer ' || g,
       'customer',
       (SELECT password_hash FROM users WHERE id = 4),
       timestamptz '2026-08-10T00:00:00Z' + g * interval '1 minute',
       timestamptz '2026-08-10T00:00:00Z' + g * interval '1 minute'
FROM generate_series(1, 1000) AS g;

-- Events 25 to 20024, a day apart in a cycle, one in ten a draft. Jazz is rare (one in 400), as
-- most search terms are, so a search reads the GIN index instead of walking every event.
INSERT INTO events (id, organizer_id, venue_id, slug, title, description, category, status,
                    starts_at, ends_at, published_at, created_at, updated_at)
SELECT 24 + g,
       2 + g % 2,
       1 + g % 4,
       'generated-event-' || g,
       (ARRAY['Open Rehearsal', 'Late Show', 'Matinee', 'Tribute Night', 'Dance Party', 'Lecture', 'Workshop', 'Quiz Night'])[1 + g % 8] || ' ' || g,
       'A generated event with ' ||
         CASE WHEN g % 400 = 0 THEN 'a jazz trio' ELSE
         (ARRAY['a string quartet', 'a stand-up set', 'a panel talk', 'a drama', 'a synth set', 'a folk duo', 'a poetry reading',
                'a brass band', 'a blues jam', 'a choir', 'a magic show', 'a puppet play', 'a film screening', 'a book reading', 'a dance troupe',
                'a cabaret', 'a tango night', 'an opera gala', 'a karaoke night', 'a quiz', 'a lecture', 'a workshop', 'a bluegrass band',
                'a DJ set', 'a reggae band', 'a piano recital', 'an improv set', 'a sketch show', 'a salsa class', 'a gospel choir', 'a harp duo'])[1 + (g * 3) % 31]
         END || '.',
       (ARRAY['music', 'comedy', 'theater', 'talk'])[1 + g % 4],
       CASE WHEN g % 10 = 0 THEN 'draft' ELSE 'published' END,
       timestamptz '2026-10-02T00:00:00Z' + (g % 365) * interval '1 day' + (g % 12) * interval '1 hour',
       timestamptz '2026-10-02T02:00:00Z' + (g % 365) * interval '1 day' + (g % 12) * interval '1 hour',
       CASE WHEN g % 10 = 0 THEN NULL ELSE timestamptz '2026-09-01T00:00:00Z' END,
       timestamptz '2026-08-15T00:00:00Z',
       timestamptz '2026-08-15T00:00:00Z'
FROM generate_series(1, 20000) AS g;

-- One General ticket type per generated event, ids 43 to 20042.
INSERT INTO ticket_types (id, event_id, name, price_cents, capacity, sold, created_at, updated_at)
SELECT 18 + e.id, e.id, 'General', 1000 + (e.id % 40) * 100, 100, 0, e.created_at, e.created_at
FROM events AS e
WHERE e.id > 24;

-- 60,000 paid orders on published generated events, one item each. Cam (4) and Dee (5) get
-- one in twenty each, the generated customers the rest.
INSERT INTO orders (id, customer_id, event_id, status, total_cents, idempotency_key, paid_at, created_at, updated_at)
SELECT 30 + g,
       CASE g % 20 WHEN 0 THEN 4 WHEN 1 THEN 5 ELSE 7 + g % 1000 END,
       ev.event_id,
       'paid',
       (1 + g % 3) * (1000 + (ev.event_id % 40) * 100),
       'generated-order-' || g,
       timestamptz '2026-09-01T00:00:00Z' + g * interval '25 seconds',
       timestamptz '2026-09-01T00:00:00Z' + g * interval '25 seconds',
       timestamptz '2026-09-01T00:00:00Z' + g * interval '25 seconds'
FROM generate_series(1, 60000) AS g
CROSS JOIN LATERAL (
  -- Skip every tenth generated event (the drafts): 18,000 published ones take the orders.
  SELECT 25 + (((g - 1) % 18000) / 9) * 10 + ((g - 1) % 18000) % 9 AS event_id
) AS ev;

INSERT INTO order_items (order_id, ticket_type_id, quantity, unit_price_cents)
SELECT o.id, 18 + o.event_id, 1 + (o.id - 30) % 3, 1000 + (o.event_id % 40) * 100
FROM orders AS o
WHERE o.id > 30;

-- sold follows the paid orders, as everywhere else.
UPDATE ticket_types AS t
SET sold = s.quantity
FROM (SELECT ticket_type_id, sum(quantity) AS quantity FROM order_items WHERE order_id > 30 GROUP BY ticket_type_id) AS s
WHERE t.id = s.ticket_type_id;

-- Rows went in with explicit ids, so each identity sequence must continue after the highest one.
DO $$
BEGIN
  PERFORM setval(pg_get_serial_sequence('users', 'id'), (SELECT max(id) FROM users));
  PERFORM setval(pg_get_serial_sequence('events', 'id'), (SELECT max(id) FROM events));
  PERFORM setval(pg_get_serial_sequence('ticket_types', 'id'), (SELECT max(id) FROM ticket_types));
  PERFORM setval(pg_get_serial_sequence('orders', 'id'), (SELECT max(id) FROM orders));
  PERFORM setval(pg_get_serial_sequence('order_items', 'id'), (SELECT max(id) FROM order_items));
END
$$;

COMMIT;

-- Fresh statistics, so the very first EXPLAIN already sees 20,000 events. VACUUM also moves the
-- bulk insert's entries out of the GIN index's pending list, which otherwise makes the planner
-- avoid the index.
VACUUM (ANALYZE) users, venues, events, ticket_types, orders, order_items;
