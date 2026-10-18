# SELECT Basics

`SELECT` picks columns (or any expressions) and `FROM` names the table. The expression runs once for every row, so a query is the loop. Examples use the playground's sample tables (`employees`, `products`, `orders`, `customers`).

### Columns

```sql
SELECT * FROM products;                  -- every column
SELECT name, price FROM products;        -- just these, in this order
SELECT name, price FROM products ORDER BY id LIMIT 2;
-- Laptop  | 1299.00
-- Monitor |  329.99
```

### Expressions and aliases

```sql
SELECT name,
       price * stock AS stock_value,         -- AS names the output column
       upper(category) AS cat,
       price > 100 AS pricey                  -- booleans print as t / f
FROM products
WHERE id = 1;
-- Laptop | 18186.00 | ELECTRONICS | t

SELECT name AS "Product Name" FROM products;  -- double quotes keep spaces and case
```

### No table needed

```sql
SELECT 2 + 3 AS five, 'hi' AS greeting, now()::date AS today;
-- 5 | hi | (today)
```

### Table aliases

```sql
SELECT e.name, e.salary
FROM employees AS e            -- AS is optional: FROM employees e
WHERE e.id = 2;
-- Grace Hopper | 160000
```

### Literals

```sql
SELECT 42,                     -- integer
       3.14,                   -- numeric (exact)
       1.5e3,                  -- 1500
       'it''s',                -- text: single quotes, double '' to escape
       E'tab\there',           -- E'' strings understand \t \n
       $$no 'escaping' here$$, -- dollar quoting
       TRUE, FALSE, NULL,
       DATE '2024-01-15',
       INTERVAL '2 days',
       ARRAY[1, 2, 3];
```

### Use it in a loop

A query already runs per row. To loop over numbers with no table, select from `generate_series`.

```sql
SELECT n, n * n AS square
FROM generate_series(1, 4) AS n;
-- 1 |  1
-- 2 |  4
-- 3 |  9
-- 4 | 16
```

### Clause order

```text
SELECT DISTINCT columns and expressions   -- runs 5th, then DISTINCT
FROM     tables and joins                 -- 1st
WHERE    row filter                       -- 2nd
GROUP BY grouping                         -- 3rd
HAVING   group filter                     -- 4th
ORDER BY sort                             -- 6th
LIMIT    how many                         -- 7th
```

| Syntax | Does |
| --- | --- |
| `SELECT DISTINCT col` | drop duplicate rows |
| `expr AS name` | name an output column |
| `"Mixed Case"` | quoted identifier (column or alias) |
| `-- text` and `/* text */` | comments |
| `table.col` | qualify a column when two tables share a name |

### Gotchas

- Double quotes are names, not strings. `SELECT "hi"` fails with `column "hi" does not exist`. Use `'hi'`.
- Unquoted names fold to lowercase: `SELECT Name FROM Products` reads `name` from `products`.
- An output alias is not visible in `WHERE` (it runs before `SELECT`). Repeat the expression or use a subquery. `ORDER BY` can use it.
- Without `ORDER BY` the row order is not guaranteed, even if it looks stable.
