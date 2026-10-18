# GROUP BY and HAVING

`GROUP BY` makes one output row per distinct value of its columns, and every aggregate runs once per group. `WHERE` filters rows before grouping, `HAVING` filters groups after.

### One row per group

```sql
SELECT category,
       count(*)              AS products,
       round(avg(price), 2)  AS avg_price,
       sum(stock)            AS stock
FROM products
GROUP BY category
ORDER BY category;
-- Accessories | 3 |  39.83 | 820
-- Electronics | 4 | 479.49 | 149
-- Furniture   | 3 | 265.67 |  33
```

### Group by several columns

```sql
SELECT c.city, o.status, count(*) AS orders
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id
GROUP BY c.city, o.status
ORDER BY c.city, o.status
LIMIT 3;
-- Austin | cancelled | 1
-- Austin | delivered | 2
-- Austin | pending   | 1
```

### Group by an expression

```sql
SELECT extract(year FROM hired_on) AS year, count(*) AS hires
FROM employees
GROUP BY year             -- an output name works here, or GROUP BY 1
ORDER BY year
LIMIT 2;
-- 2016 | 1
-- 2017 | 2

SELECT date_trunc('month', ordered_on)::date AS month, count(*) AS orders
FROM orders
GROUP BY 1
ORDER BY 1
LIMIT 2;
-- 2024-01-01 | 2
-- 2024-02-01 | 2
```

### HAVING: filter the groups

```sql
SELECT department_id, count(*) AS staff, max(salary) AS top
FROM employees
WHERE department_id IS NOT NULL      -- rows first
GROUP BY department_id
HAVING count(*) >= 3                 -- then groups
ORDER BY department_id;
-- 1 | 5 | 185000
-- 2 | 3 | 150000
-- 5 | 3 | 170000
```

`WHERE` runs before grouping and `HAVING` after it, both before `SELECT`. That is why `WHERE` can't use aggregates and `HAVING` can't use `SELECT` aliases (full clause order in SELECT Basics).

### Group by a key, show its other columns

Grouping by a primary key lets you select any column of that table.

```sql
SELECT d.id, d.name, d.budget, count(e.id) AS staff
FROM departments AS d
LEFT JOIN employees AS e ON e.department_id = d.id
GROUP BY d.id
ORDER BY staff DESC, d.id
LIMIT 2;
-- 1 | Engineering | 1500000.00 | 5
-- 2 | Sales       |  600000.00 | 3
```

### Subtotals and a grand total

```sql
SELECT category, count(*) AS products, sum(stock) AS stock
FROM products
GROUP BY ROLLUP (category)
ORDER BY category;
-- Accessories |  3 |  820
-- Electronics |  4 |  149
-- Furniture   |  3 |   33
--             | 10 | 1002    (the grand total, category is NULL)
```

`GROUPING SETS ((a, b), (a), ())` picks the exact subtotals. `CUBE (a, b)` gives every combination.

### Gotchas

- Every selected column must be grouped or aggregated: `SELECT name, count(*) ... GROUP BY department_id` fails with `must appear in the GROUP BY clause`.
- `HAVING staff >= 3` fails with `column "staff" does not exist`. Repeat the aggregate: `HAVING count(*) >= 3`.
- NULLs group together: employees with no department form one group with a NULL key.
- After a `LEFT JOIN`, `count(*)` counts 1 for a group with no matches. Count a column from the right table, `count(e.id)`, to get 0.
