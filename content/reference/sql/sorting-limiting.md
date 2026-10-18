# Sorting and Limiting

`ORDER BY` sorts the result, `LIMIT` keeps the first n rows, and `OFFSET` skips some first. Without `ORDER BY` the order is whatever the database finds fastest, so always sort before you limit.

### ORDER BY

```sql
SELECT name, price FROM products ORDER BY price;            -- ascending (ASC is the default)
SELECT name, price FROM products ORDER BY price DESC;       -- descending

SELECT name, category, price FROM products
ORDER BY category, price DESC                               -- by category, then price within it
LIMIT 4;
-- Keyboard  | Accessories | 79.50
-- Mouse     | Accessories | 29.99
-- USB Cable | Accessories |  9.99
-- Laptop    | Electronics | 1299.00
```

### Sort by an expression or alias

```sql
SELECT name, price * stock AS value
FROM products
ORDER BY value DESC                  -- the alias works here (not in WHERE)
LIMIT 2;
-- Laptop  | 18186.00
-- Monitor |  9899.70

SELECT name FROM employees ORDER BY length(name), name LIMIT 2;
-- Alan Turing
-- Hedy Lamarr
```

### NULLs first or last

```sql
SELECT name, email FROM employees
ORDER BY email DESC NULLS LAST, id
LIMIT 2;
-- Steve Wozniak | woz@example.com
-- Radia Perlman | radia@example.com
```

### LIMIT and OFFSET

```sql
SELECT name, price FROM products ORDER BY price DESC LIMIT 3;   -- top 3
-- Laptop  | 1299.00
-- Desk    |  449.00
-- Monitor |  329.99

SELECT id, name FROM products ORDER BY id LIMIT 3 OFFSET 3;     -- page 2 of 3 per page
-- 4 | Mouse
-- 5 | Desk
-- 6 | Chair

SELECT name FROM products ORDER BY price DESC
FETCH FIRST 1 ROWS ONLY;                                        -- standard spelling of LIMIT 1
```

Page `p` (from 1) of size `n` is `LIMIT n OFFSET (p - 1) * n`.

### Ties: WITH TIES

```sql
SELECT order_id, product_id, quantity FROM order_items
ORDER BY quantity DESC
FETCH FIRST 2 ROWS WITH TIES;     -- 3 rows: the 2nd and 3rd both have quantity 10
-- 7 | 10 | 20
-- 7 |  3 | 10
-- 7 |  4 | 10
```

### DISTINCT

```sql
SELECT DISTINCT category FROM products ORDER BY category;
-- Accessories, Electronics, Furniture

SELECT DISTINCT city, signed_up >= '2023-01-01' AS recent
FROM customers ORDER BY city, recent;     -- unique pairs, not unique cities
```

### DISTINCT ON: first row per group

Keeps one row for each distinct value of the `ON` columns: the first one in `ORDER BY` order. Handy for "the most expensive product in each category".

```sql
SELECT DISTINCT ON (category) category, name, price
FROM products
ORDER BY category, price DESC;
-- Accessories | Keyboard | 79.50
-- Electronics | Laptop   | 1299.00
-- Furniture   | Desk     | 449.00
```

### Use it in a loop: page by key

`OFFSET` still reads and throws away every skipped row. For deep pages, remember the last key you showed and start after it.

```sql
SELECT id, name FROM products ORDER BY id LIMIT 3;                 -- page 1 ends at id 3
SELECT id, name FROM products WHERE id > 3 ORDER BY id LIMIT 3;    -- page 2
-- 4 | Mouse
-- 5 | Desk
-- 6 | Chair
```

For the top n rows of each group, see Window Functions.

| Clause | Does |
| --- | --- |
| `ORDER BY a, b DESC` | sort by `a`, break ties with `b` descending |
| `ORDER BY 2` | sort by the 2nd selected column |
| `NULLS FIRST` / `NULLS LAST` | where `NULL` goes |
| `LIMIT n OFFSET m` | skip `m`, keep `n` |
| `FETCH FIRST n ROWS WITH TIES` | keep `n`, plus rows tied with the last |
| `ORDER BY random()` | shuffle |

### Gotchas

- `LIMIT` without `ORDER BY` returns some arbitrary rows. Sort on columns that never tie (add `id`) so pages do not overlap.
- `DISTINCT ON (x)` needs `ORDER BY` to start with `x`, or PostgreSQL raises an error.
- Text sorts by byte here (the C collation): `'Banana' < 'apple'` because uppercase comes first. Sort by `lower(name)` for dictionary order.
- `DISTINCT` applies to the whole row you select, not to the first column.
