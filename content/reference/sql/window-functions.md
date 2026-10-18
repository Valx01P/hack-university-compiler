# Window Functions

A window function computes over a set of related rows but, unlike `GROUP BY`, keeps every row. `OVER (...)` defines the window: `PARTITION BY` splits rows into groups, `ORDER BY` orders them inside each group, and a frame picks which of those rows count.

```text
function(args) OVER (
  PARTITION BY col, ...      -- optional: restart per group
  ORDER BY col, ...          -- optional: order inside the group
  ROWS BETWEEN ... AND ...   -- optional: the frame
)
```

### An aggregate next to each row

```sql
SELECT name, department_id, salary,
       round(avg(salary) OVER (PARTITION BY department_id)) AS dept_avg,
       sum(salary) OVER ()                                  AS payroll
FROM employees
WHERE department_id IN (4, 5)
ORDER BY department_id, salary DESC;
-- John Backus       | 4 |  99000 |  85500 | 600000
-- Annie Easley      | 4 |  72000 |  85500 | 600000
-- Alan Turing       | 5 | 170000 | 143000 | 600000
-- Katherine Johnson | 5 | 138000 | 143000 | 600000
-- Hedy Lamarr       | 5 | 121000 | 143000 | 600000
```

`OVER ()` with nothing inside is the whole result.

### Ranking

```sql
SELECT order_id, product_id, quantity,
       row_number() OVER (ORDER BY quantity DESC, order_id, product_id) AS row_num,
       rank()       OVER w AS rnk,
       dense_rank() OVER w AS dense
FROM order_items
WINDOW w AS (ORDER BY quantity DESC)
ORDER BY row_num
LIMIT 5;
--  7 | 10 | 20 | 1 | 1 | 1
--  7 |  3 | 10 | 2 | 2 | 2
--  7 |  4 | 10 | 3 | 2 | 2
--  4 |  6 |  6 | 4 | 4 | 3
-- 10 | 10 |  6 | 5 | 4 | 3
```

`WINDOW w AS (...)` names a window so several functions can share it.

### Top N per group

Window functions can't go in `WHERE`, so rank in a subquery or CTE and filter outside. Use `rn <= 3` for the top 3, or `rank()` to keep ties. For just the top row, `DISTINCT ON` is shorter (see Sorting and Limiting).

```sql
WITH ranked AS (
  SELECT category, name, price,
         row_number() OVER (PARTITION BY category ORDER BY price DESC) AS rn
  FROM products
)
SELECT category, name, price
FROM ranked
WHERE rn = 1
ORDER BY category;
-- Accessories | Keyboard |   79.50
-- Electronics | Laptop   | 1299.00
-- Furniture   | Desk     |  449.00
```

### Running totals and moving averages

Revenue per month, then a running total and a 3-month moving average across the months.

```sql
WITH monthly AS (
  SELECT date_trunc('month', o.ordered_on)::date AS month,
         sum(oi.quantity * p.price)              AS revenue
  FROM orders AS o
  JOIN order_items AS oi ON oi.order_id = o.id
  JOIN products AS p ON p.id = oi.product_id
  GROUP BY 1
)
SELECT month, revenue,
       sum(revenue) OVER (ORDER BY month) AS running,
       round(avg(revenue) OVER (ORDER BY month
                                ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS avg_3
FROM monthly
ORDER BY month;
-- 2024-01-01 | 3046.90 |  3046.90 | 3046.90
-- 2024-02-01 | 3951.96 |  6998.86 | 3499.43
-- 2024-03-01 | 2835.74 |  9834.60 | 3278.20
-- 2024-04-01 | 1802.70 | 11637.30 | 2863.47
-- 2024-05-01 |  986.92 | 12624.22 | 1875.12
-- 2024-06-01 | 3926.99 | 16551.21 | 2238.87
```

### Share of a total

```sql
SELECT name, price,
       round(100.0 * price / sum(price) OVER (PARTITION BY category), 1) AS pct
FROM products
WHERE category = 'Furniture'
ORDER BY price DESC;
-- Desk  | 449.00 | 56.3
-- Chair | 289.00 | 36.3
-- Lamp  |  59.00 |  7.4
```

### Previous and next row: LAG and LEAD

```sql
SELECT id, ordered_on,
       ordered_on - lag(ordered_on) OVER (ORDER BY ordered_on) AS days_since_prev,
       lead(id) OVER (ORDER BY ordered_on)                     AS next_order
FROM orders
WHERE customer_id = 1
ORDER BY ordered_on;
-- 1 | 2024-01-05 |    | 3
-- 3 | 2024-02-02 | 28 | 7
-- 7 | 2024-04-10 | 68 |
```

`lag(x, 2, 0)` looks two rows back and returns `0` instead of NULL at the edge.

### Reference

| Call | Does |
| --- | --- |
| `row_number()` | 1, 2, 3 in window order, ties broken arbitrarily |
| `rank()` / `dense_rank()` | rank with gaps / without gaps after ties |
| `ntile(4)` | bucket number 1 to 4 (quartiles) |
| `percent_rank()` / `cume_dist()` | relative rank from 0 to 1 |
| `lag(x, n, default)` / `lead(x, n, default)` | value `n` rows before / after |
| `first_value(x)` / `last_value(x)` | first / last value in the frame |
| `nth_value(x, n)` | the `n`th value in the frame |
| `sum(x) OVER (...)`, `avg`, `count`, `min`, `max` | any aggregate, per window |

### Frames

```text
ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW          -- running total
ROWS BETWEEN 2 PRECEDING AND CURRENT ROW                  -- last 3 rows
ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING                  -- centered, 3 rows
ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING  -- whole partition
```

### Gotchas

- `WHERE row_number() OVER (...) = 1` fails with `window functions are not allowed in WHERE`. Filter in an outer query.
- With `ORDER BY` and no frame, the frame ends at the current row and its ties (`RANGE`), so tied rows share one running total. Add a unique tiebreaker or use `ROWS`.
- For the same reason `last_value(x)` returns the current row. Give it the whole partition: `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`.
- Windows run after `GROUP BY`, so they can wrap aggregates: `sum(count(*)) OVER ()` is the total across all groups.
