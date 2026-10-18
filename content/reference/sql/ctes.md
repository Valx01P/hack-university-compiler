# CTEs and Recursion

`WITH name AS (SELECT ...)` names a query so the main statement can use it like a table. It reads top to bottom, unlike nested subqueries. `WITH RECURSIVE` lets a CTE refer to itself, which is how SQL walks trees and graphs.

### One CTE

```sql
WITH big_orders AS (
  SELECT order_id, sum(oi.quantity * p.price) AS total
  FROM order_items AS oi
  JOIN products AS p ON p.id = oi.product_id
  GROUP BY order_id
)
SELECT order_id, total
FROM big_orders
WHERE total > 2000
ORDER BY total DESC;
-- 11 | 3897.00
--  1 | 2816.98
--  3 | 2217.96
```

### Chain several

Each CTE can use the ones before it. Separate them with commas, one `WITH`.

```sql
WITH order_totals AS (
  SELECT o.customer_id, sum(oi.quantity * p.price) AS total
  FROM orders AS o
  JOIN order_items AS oi ON oi.order_id = o.id
  JOIN products AS p ON p.id = oi.product_id
  WHERE o.status <> 'cancelled'
  GROUP BY o.customer_id
),
ranked AS (
  SELECT customer_id, total, rank() OVER (ORDER BY total DESC) AS place
  FROM order_totals
)
SELECT c.name, r.total, r.place
FROM ranked AS r
JOIN customers AS c ON c.id = r.customer_id
WHERE r.place <= 3
ORDER BY r.place;
-- Acme Corp    | 6329.64 | 1
-- Delta Dental | 5614.99 | 2
-- Echo Studios | 1117.75 | 3
```

### Recursive: count up

```sql
WITH RECURSIVE n(i) AS (
  SELECT 1                          -- anchor: the starting rows
  UNION ALL
  SELECT i + 1 FROM n WHERE i < 5   -- step: runs on the last batch until it returns nothing
)
SELECT i FROM n ORDER BY i;
-- 1, 2, 3, 4, 5
```

For plain number ranges, `generate_series(1, 5)` is shorter.

### Recursive: walk a tree

Everyone under Grace Hopper (id 2), with depth and the path from the top.

```sql
WITH RECURSIVE team AS (
  SELECT id, name, 0 AS depth, name AS path
  FROM employees
  WHERE id = 2
  UNION ALL
  SELECT e.id, e.name, t.depth + 1, t.path || ' > ' || e.name
  FROM employees AS e
  JOIN team AS t ON e.manager_id = t.id
)
SELECT depth, path FROM team ORDER BY path;
-- 0 | Grace Hopper
-- 1 | Grace Hopper > Dennis Ritchie
-- 1 | Grace Hopper > Linus Pauling
-- 1 | Grace Hopper > Margaret Hamilton
```

Walk up instead (an employee's chain of managers) by flipping the join: `JOIN team AS t ON e.id = t.manager_id`.

### Recursive: a graph with cycles

Graphs can loop. The `CYCLE` clause stops a path when it revisits a node.

```sql
CREATE TABLE edges (src text, dst text);
INSERT INTO edges VALUES ('a', 'b'), ('b', 'c'), ('c', 'a'), ('c', 'd');

WITH RECURSIVE reach AS (
  SELECT dst AS node FROM edges WHERE src = 'a'
  UNION ALL
  SELECT e.dst FROM edges AS e JOIN reach AS r ON e.src = r.node
) CYCLE node SET looped USING path
SELECT DISTINCT node FROM reach WHERE NOT looped ORDER BY node;
-- a, b, c, d
```

Without `CYCLE`, using `UNION` instead of `UNION ALL` also stops, because rows already seen are dropped.

### Write and read in one statement

A CTE can hold an `INSERT`, `UPDATE`, or `DELETE` with `RETURNING`, and the main query reads the changed rows.

```sql
WITH restocked AS (
  UPDATE products SET stock = stock + 10
  WHERE stock < 10
  RETURNING name, stock
)
SELECT name, stock FROM restocked ORDER BY name;
-- Chair | 10
-- Desk  | 18
```

### Gotchas

- A recursive CTE needs `WITH RECURSIVE`, an anchor, `UNION` or `UNION ALL`, and a step that eventually returns no rows. A step that never empties runs until it fails.
- The anchor fixes the column types. A `varchar(10)` anchor that the step grows with `||` fails with `has type character varying(10) in non-recursive term but type character varying overall`. Cast the anchor: `name::text AS path`.
- Row order out of a CTE is not guaranteed. Put `ORDER BY` on the final `SELECT`.
- A CTE used once is usually inlined into the main query. Add `AS MATERIALIZED` to force it to run once and be reused.
