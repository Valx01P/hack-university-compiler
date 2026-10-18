# Aggregates

An aggregate function folds many rows into one value. Without `GROUP BY` it folds the whole table into a single row. Every aggregate skips NULLs, except `count(*)`, which counts rows.

### The core five

```sql
SELECT count(*)              AS n,            -- 16
       sum(salary)           AS payroll,      -- 2042000
       round(avg(salary), 2) AS mean,         -- 127625.00
       min(hired_on)         AS first_hire,   -- 2016-02-01
       max(salary)           AS top_salary    -- 185000
FROM employees;
```

`min` and `max` work on numbers, text, and dates alike.

### Count

```sql
SELECT count(*)                      AS rows_total,      -- 16  every row
       count(email)                  AS have_email,      -- 14  non-NULL emails
       count(department_id)          AS have_dept,       -- 15
       count(DISTINCT department_id) AS departments      -- 5   distinct non-NULL values
FROM employees;
```

### Count or sum only some rows: FILTER

```sql
SELECT count(*)                                     AS orders,     -- 12
       count(*) FILTER (WHERE status = 'delivered') AS delivered,  -- 5
       count(*) FILTER (WHERE status = 'pending')   AS pending     -- 3
FROM orders;
```

`FILTER (WHERE ...)` works on any aggregate. The portable spelling is `count(CASE WHEN status = 'pending' THEN 1 END)`.

### Aggregate an expression, across a join

```sql
SELECT sum(oi.quantity * p.price)  AS revenue,       -- 16551.21
       sum(oi.quantity)            AS units,         -- 89
       max(oi.quantity * p.price)  AS biggest_line   -- 3897.00
FROM order_items AS oi
JOIN products AS p ON p.id = oi.product_id;
```

### Strings, arrays, booleans

```sql
SELECT string_agg(name, ', ' ORDER BY name) AS names,         -- Chair, Desk, Lamp
       array_agg(id ORDER BY id)            AS ids,           -- {5,6,9}
       bool_and(stock > 0)                  AS all_stocked,   -- f
       bool_or(price > 400)                 AS any_over_400   -- t
FROM products
WHERE category = 'Furniture';
```

### Median and most common value

```sql
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY salary) AS median
FROM employees;  -- 130000

SELECT mode() WITHIN GROUP (ORDER BY status) AS most_common
FROM orders;     -- delivered
```

### Reference

| Call | Does |
| --- | --- |
| `count(*)` | rows, NULLs included |
| `count(x)` | rows where `x` is not NULL |
| `count(DISTINCT x)` | distinct non-NULL values of `x` |
| `sum(x)` / `avg(x)` | total and mean, NULL on zero rows |
| `min(x)` / `max(x)` | smallest and largest |
| `string_agg(x, ', ' ORDER BY x)` | join text values with a separator |
| `array_agg(x ORDER BY x)` | collect values into an array |
| `bool_and(cond)` / `bool_or(cond)` | true if all / any rows match |
| `percentile_cont(0.5) WITHIN GROUP (ORDER BY x)` | median, interpolated |
| `mode() WITHIN GROUP (ORDER BY x)` | most frequent value |
| `agg(x) FILTER (WHERE cond)` | aggregate only the matching rows |

### Gotchas

- A plain column next to an aggregate needs `GROUP BY`: `SELECT name, max(salary) FROM employees` fails with `column "employees.name" must appear in the GROUP BY clause`.
- Aggregates are not allowed in `WHERE`. Filter groups with `HAVING`, or compare against a subquery: `WHERE salary > (SELECT avg(salary) FROM employees)`.
- `sum` and `avg` of zero rows are NULL, not 0. Use `coalesce(sum(x), 0)`.
- `avg` of integers returns `numeric` with many decimals. Wrap it in `round(avg(x), 2)`.
