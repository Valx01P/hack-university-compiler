# Joins

A join pairs rows from two tables that match a condition. `JOIN` alone means `INNER JOIN`: only rows with a match on both sides survive. Use an outer join to keep the rows that have no match.

| Join | Keeps |
| --- | --- |
| `a JOIN b ON ...` | only pairs that match |
| `a LEFT JOIN b ON ...` | every row of `a`, NULLs where `b` has no match |
| `a RIGHT JOIN b ON ...` | every row of `b`, NULLs where `a` has no match |
| `a FULL JOIN b ON ...` | every row of both |
| `a CROSS JOIN b` | every row of `a` with every row of `b` |

### Inner join

```sql
SELECT e.name, d.name AS department
FROM employees AS e
JOIN departments AS d ON d.id = e.department_id
ORDER BY e.id
LIMIT 3;
-- Ada Lovelace | Engineering
-- Grace Hopper | Engineering
-- Alan Turing  | Research
```

Ken Thompson has no department, so the inner join drops him.

### Left join: keep every left row

```sql
SELECT e.name, coalesce(d.name, '(none)') AS department
FROM employees AS e
LEFT JOIN departments AS d ON d.id = e.department_id
WHERE e.id >= 15
ORDER BY e.id;
-- Annie Easley | Support
-- Ken Thompson | (none)
```

### Find rows with no match (anti-join)

```sql
SELECT c.name
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
WHERE o.id IS NULL;   -- Harbor Hotel
```

`WHERE NOT EXISTS (...)` does the same (see Subqueries).

### Full and right joins

```sql
SELECT e.name, d.name AS department
FROM employees AS e
FULL JOIN departments AS d ON d.id = e.department_id
WHERE e.id IS NULL OR d.id IS NULL;
-- Ken Thompson |      (no department, and every department has staff)
```

`a RIGHT JOIN b` is `b LEFT JOIN a`. Most people write the left join.

### Join several tables

```sql
SELECT o.id AS order_id, c.name AS customer, p.name AS product, oi.quantity
FROM orders AS o
JOIN customers AS c    ON c.id = o.customer_id
JOIN order_items AS oi ON oi.order_id = o.id
JOIN products AS p     ON p.id = oi.product_id
WHERE o.id = 2
ORDER BY p.name;
-- 2 | Blue Owl Books | Headphones | 1
-- 2 | Blue Owl Books | USB Cable  | 3
```

### Self join: a table joined to itself

```sql
SELECT e.name AS employee, m.name AS manager
FROM employees AS e
LEFT JOIN employees AS m ON m.id = e.manager_id
ORDER BY e.id
LIMIT 3;
-- Ada Lovelace |
-- Grace Hopper | Ada Lovelace
-- Alan Turing  | Ada Lovelace
```

Aliases are required here, so you can tell the two copies apart.

### Cross join: every combination

```sql
SELECT s.size, c.color
FROM (VALUES ('S'), ('M')) AS s(size)
CROSS JOIN (VALUES ('red'), ('blue')) AS c(color)
ORDER BY s.size, c.color;
-- M | blue
-- M | red
-- S | blue
-- S | red
```

### USING, and joining on more than one column

```sql
SELECT order_id, quantity, name
FROM order_items
JOIN products ON products.id = order_items.product_id AND quantity >= 10
ORDER BY order_id, name;
-- 7 | 10 | Keyboard
-- 7 | 10 | Mouse
-- 7 | 20 | USB Cable

SELECT *
FROM (VALUES (1, 'a')) AS x(id, l)
JOIN (VALUES (1, 'b')) AS y(id, r) USING (id);
-- 1 | a | b    (columns id, l, r: USING keeps one id)
```

### LATERAL: a subquery per left row

```sql
SELECT c.name, last.ordered_on
FROM customers AS c
LEFT JOIN LATERAL (
  SELECT ordered_on FROM orders AS o
  WHERE o.customer_id = c.id
  ORDER BY ordered_on DESC
  LIMIT 1
) AS last ON true
ORDER BY c.id
LIMIT 2;
-- Acme Corp      | 2024-04-10
-- Blue Owl Books | 2024-05-03
```

### Gotchas

- A `WHERE` condition on the right table of a `LEFT JOIN` drops the unmatched rows again. Put it in `ON`: `LEFT JOIN orders AS o ON o.customer_id = c.id AND o.status = 'pending'`.
- Joining one-to-many repeats the left row once per match, so `sum` over the left table's columns counts them several times.
- A column in both tables must be qualified: `SELECT id FROM orders JOIN customers ...` fails with `column reference "id" is ambiguous`.
- `FROM a, b` with no condition is a cross join. Forgetting the condition multiplies rows silently.
