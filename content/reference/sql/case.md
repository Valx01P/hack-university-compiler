# CASE Expressions

`CASE` is SQL's `if`/`else` and `switch`, and it is an expression: it returns a value you can put anywhere a value goes (`SELECT`, `WHERE`, `ORDER BY`, inside `sum`). There is no `IF()` function or `? :` in PostgreSQL.

### Searched CASE: if / else if / else

```sql
SELECT name, price,
       CASE
         WHEN price >= 300 THEN 'premium'
         WHEN price >= 50  THEN 'standard'
         ELSE 'budget'
       END AS tier
FROM products
WHERE id IN (1, 3, 4)
ORDER BY id;
-- Laptop   | 1299.00 | premium
-- Keyboard |   79.50 | standard
-- Mouse    |   29.99 | budget
```

The first `WHEN` that is true wins. Without `ELSE`, no match gives `NULL`.

### Simple CASE: switch

```sql
SELECT id,
       CASE status
         WHEN 'delivered' THEN 'done'
         WHEN 'shipped'   THEN 'on the way'
         WHEN 'cancelled' THEN 'cancelled'
         ELSE 'waiting'
       END AS label
FROM orders
WHERE id <= 4
ORDER BY id;
-- 1 | done
-- 2 | done
-- 3 | done
-- 4 | cancelled
```

### Ternary

```sql
SELECT name, CASE WHEN stock > 0 THEN 'in stock' ELSE 'sold out' END AS availability
FROM products
WHERE id IN (5, 6)
ORDER BY id;
-- Desk  | in stock
-- Chair | sold out
```

### Count by condition (a pivot)

```sql
SELECT sum(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
       count(CASE WHEN status = 'shipped' THEN 1 END)        AS shipped,
       sum(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)   AS pending
FROM orders;
-- 5 | 3 | 3
```

`count` skips the `NULL` from a missing `ELSE`. In PostgreSQL, `count(*) FILTER (WHERE status = 'pending')` is shorter (see Aggregates).

### Custom sort order

```sql
SELECT id, status FROM orders
ORDER BY CASE status
           WHEN 'pending' THEN 1
           WHEN 'shipped' THEN 2
           ELSE 3
         END, id
LIMIT 4;
-- 8  | pending
-- 9  | pending
-- 12 | pending
-- 6  | shipped
```

### Use it in a loop

`CASE` inside `UPDATE` changes every row by its own rule.

```sql
UPDATE products
SET price = CASE category
              WHEN 'Electronics' THEN price * 0.90
              WHEN 'Furniture'   THEN price * 0.80
              ELSE price
            END;
-- UPDATE 10

SELECT name, price FROM products WHERE id IN (2, 5, 10) ORDER BY id;
-- Monitor   | 296.99
-- Desk      | 359.20
-- USB Cable |   9.99
```

### Shortcuts

| Call | Same as |
| --- | --- |
| `coalesce(a, b)` | `CASE WHEN a IS NOT NULL THEN a ELSE b END` |
| `nullif(a, b)` | `CASE WHEN a = b THEN NULL ELSE a END` |
| `greatest(a, b)` | the larger value, ignoring `NULL` |
| `least(a, b)` | the smaller value, ignoring `NULL` |

### Gotchas

- Every branch must return a compatible type. `CASE WHEN x THEN 1 ELSE 'none' END` fails. Cast: `1::text`.
- `CASE x WHEN NULL THEN ...` never matches, because it tests `x = NULL`. Use `CASE WHEN x IS NULL THEN ...`.
- Order the `WHEN`s from most specific to least. `WHEN price >= 50` first would swallow everything over 300 too.
- It ends with `END`, not `END CASE` (that is PL/pgSQL).
