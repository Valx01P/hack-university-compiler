# Set Operations

Set operations stack the results of two queries. Both sides need the same number of columns with compatible types, and the column names come from the first query.

| Operator | Returns |
| --- | --- |
| `a UNION b` | rows in either, duplicates removed |
| `a UNION ALL b` | rows in either, duplicates kept |
| `a INTERSECT b` | rows in both |
| `a EXCEPT b` | rows in `a` that are not in `b` |

`INTERSECT ALL` and `EXCEPT ALL` keep duplicates too.

### UNION and UNION ALL

```sql
SELECT city FROM customers WHERE id <= 3
UNION
SELECT city FROM customers WHERE id >= 7
ORDER BY city;
-- Austin, Boston, Chicago, Denver

SELECT city FROM customers WHERE id <= 3
UNION ALL
SELECT city FROM customers WHERE id >= 7
ORDER BY city;
-- Austin, Austin, Boston, Chicago, Denver
```

### Combine different tables, label the source

```sql
SELECT name, 'employee' AS kind FROM employees WHERE id <= 2
UNION ALL
SELECT name, 'customer' FROM customers WHERE id <= 2
ORDER BY kind, name;
-- Acme Corp      | customer
-- Blue Owl Books | customer
-- Ada Lovelace   | employee
-- Grace Hopper   | employee
```

### INTERSECT: in both

```sql
SELECT customer_id FROM orders WHERE ordered_on < '2024-04-01'
INTERSECT
SELECT customer_id FROM orders WHERE ordered_on >= '2024-04-01'
ORDER BY customer_id;
-- 1, 2, 3, 4  (ordered both before and after April)
```

### EXCEPT: in the first, not the second

```sql
SELECT id FROM customers
EXCEPT
SELECT customer_id FROM orders
ORDER BY id;
-- 8

SELECT product_id FROM order_items WHERE order_id <= 6
EXCEPT
SELECT product_id FROM order_items WHERE order_id > 6
ORDER BY product_id;
-- 6, 7  (sold early, never again)
```

### Sort, limit, and parentheses

`ORDER BY` and `LIMIT` at the end apply to the whole result. Wrap a branch in parentheses to limit it alone.

```sql
(SELECT name, price FROM products ORDER BY price DESC LIMIT 1)
UNION ALL
(SELECT name, price FROM products ORDER BY price LIMIT 1)
ORDER BY price;
-- USB Cable |    9.99
-- Laptop    | 1299.00
```

### Use it as a table

```sql
SELECT kind, count(*) AS people
FROM (
  SELECT 'employee' AS kind FROM employees
  UNION ALL
  SELECT 'customer' FROM customers
) AS everyone
GROUP BY kind
ORDER BY kind;
-- customer |  8
-- employee | 16
```

### Gotchas

- `UNION` removes duplicates, which costs a sort and can hide rows you wanted. Use `UNION ALL` unless you need the dedup.
- Column count must match: `SELECT 1 UNION SELECT 1, 2` fails with `each UNION query must have the same number of columns`.
- Types must be compatible: `SELECT 1 UNION SELECT 'a'::text` fails with `UNION types integer and text cannot be matched`. Cast one side.
- `INTERSECT` binds tighter than `UNION` and `EXCEPT`. Add parentheses when you mix them.
