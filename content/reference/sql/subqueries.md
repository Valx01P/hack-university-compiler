# Subqueries

A subquery is a `SELECT` in parentheses inside another statement. Where it sits decides what it must return: one value (scalar), one column (`IN`, `ANY`), any rows at all (`EXISTS`), or a whole table (`FROM`).

### Scalar: one row, one column

```sql
SELECT name, salary
FROM employees
WHERE salary > (SELECT avg(salary) FROM employees)   -- avg is 127625
ORDER BY salary DESC
LIMIT 3;
-- Ada Lovelace | 185000
-- Alan Turing  | 170000
-- Grace Hopper | 160000

SELECT name,
       price - (SELECT min(price) FROM products) AS above_cheapest
FROM products
WHERE id <= 2
ORDER BY id;
-- Laptop  | 1289.01
-- Monitor |  320.00
```

### IN and NOT IN: one column of values

```sql
SELECT name
FROM customers
WHERE id IN (SELECT customer_id FROM orders WHERE status = 'pending')
ORDER BY name;
-- Blue Owl Books, Cedar Cafe, Fern Florist

SELECT name
FROM products
WHERE id NOT IN (SELECT product_id FROM order_items)
ORDER BY name;
-- (0 rows): every product has sold
```

### EXISTS and NOT EXISTS: is there any matching row?

```sql
SELECT c.name
FROM customers AS c
WHERE NOT EXISTS (
  SELECT 1 FROM orders AS o WHERE o.customer_id = c.id
);   -- Harbor Hotel
```

`EXISTS` stops at the first match and only cares whether a row exists, so `SELECT 1` is the convention.

### Correlated: re-run per outer row

The inner query refers to the outer row (`e.department_id` here).

```sql
SELECT e.name, e.salary
FROM employees AS e
WHERE e.salary > (
  SELECT avg(salary) FROM employees AS x
  WHERE x.department_id = e.department_id
)
ORDER BY e.id;
-- Ada Lovelace, Grace Hopper, Alan Turing, Steve Wozniak, Frances Allen, John Backus

SELECT d.name,
       (SELECT count(*) FROM employees AS e WHERE e.department_id = d.id) AS staff
FROM departments AS d
ORDER BY d.id;
-- Engineering | 5
-- Sales       | 3
-- Marketing   | 2
-- Support     | 2
-- Research    | 3
```

### Derived table: a subquery in FROM

```sql
SELECT category, max(total) AS best_seller_units
FROM (
  SELECT p.category, p.name, sum(oi.quantity) AS total
  FROM products AS p
  JOIN order_items AS oi ON oi.product_id = p.id
  GROUP BY p.category, p.name
) AS per_product
GROUP BY category
ORDER BY category;
-- Accessories | 29
-- Electronics |  7
-- Furniture   |  6
```

The alias (`AS per_product`) is optional since PostgreSQL 16, but name it anyway for clarity. A `WITH` query (see CTEs and Recursion) is the same idea, written first.

### ANY and ALL

```sql
SELECT name, price
FROM products
WHERE price > ALL (SELECT price FROM products WHERE category = 'Furniture')
ORDER BY price;
-- Laptop | 1299.00

SELECT name, price
FROM products
WHERE price < ANY (SELECT price FROM products WHERE category = 'Accessories')
ORDER BY price;   -- cheaper than at least one accessory
-- USB Cable |  9.99
-- Mouse     | 29.99
-- Lamp      | 59.00
```

### Reference

| Form | Returns true when |
| --- | --- |
| `x = (SELECT ...)` | `x` equals the single value |
| `x IN (SELECT ...)` | `x` is in the column |
| `x NOT IN (SELECT ...)` | `x` is not in the column and the column has no NULL |
| `EXISTS (SELECT ...)` | the subquery returns at least one row |
| `x > ANY (SELECT ...)` | `x` beats at least one value |
| `x > ALL (SELECT ...)` | `x` beats every value |

### Gotchas

- `NOT IN` against a list with a NULL in it matches nothing. `WHERE id NOT IN (SELECT manager_id FROM employees)` returns no rows because Ada's `manager_id` is NULL. Use `NOT EXISTS`.
- A scalar subquery that returns two rows fails with `more than one row returned by a subquery used as an expression`. Add `LIMIT 1` or an aggregate.
- A scalar subquery that returns no rows gives NULL, not an error.
