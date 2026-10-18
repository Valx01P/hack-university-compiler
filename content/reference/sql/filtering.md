# Filtering with WHERE

`WHERE` keeps the rows whose condition is true. It runs before `SELECT`, once per row, and a row where the condition is `NULL` is dropped just like `false`.

### Compare

```sql
SELECT name, price FROM products WHERE price < 50 ORDER BY price;
-- USB Cable |  9.99
-- Mouse     | 29.99

SELECT name FROM products WHERE category = 'Furniture' ORDER BY name;
-- Chair, Desk, Lamp
SELECT count(*) FROM products WHERE category = 'furniture';   -- 0, text compares case-sensitively
```

| Operator | Means |
| --- | --- |
| `=` | equal (one `=`, not `==`) |
| `<>` or `!=` | not equal |
| `<` `<=` `>` `>=` | ordering, works on numbers, text, and dates |
| `IS DISTINCT FROM` | not equal, treating `NULL` as a value |
| `IS NULL` / `IS NOT NULL` | the only way to test for `NULL` |

### Combine with AND, OR, NOT

```sql
SELECT name FROM products
WHERE (category = 'Electronics' OR category = 'Furniture')
  AND stock > 0
  AND NOT name = 'Lamp'
ORDER BY name;
-- Desk, Headphones, Laptop, Monitor, Webcam
```

Precedence is `NOT`, then `AND`, then `OR`. Parenthesize every mix of `AND` and `OR`.

### IN: one of a list

```sql
SELECT name FROM employees WHERE department_id IN (2, 4) ORDER BY name;
-- Annie Easley, Barbara Liskov, John Backus, Mary Jackson, Steve Wozniak

SELECT name FROM products WHERE category NOT IN ('Electronics', 'Accessories') ORDER BY name;
-- Chair, Desk, Lamp

SELECT name FROM products WHERE id = ANY (ARRAY[1, 3, 5]) ORDER BY id;
-- Laptop, Keyboard, Desk
```

### BETWEEN: inclusive range

```sql
SELECT name, price FROM products WHERE price BETWEEN 59 AND 89 ORDER BY price;
-- Lamp     | 59.00
-- Keyboard | 79.50
-- Webcam   | 89.00

SELECT id, ordered_on FROM orders
WHERE ordered_on BETWEEN '2024-01-01' AND '2024-01-31'
ORDER BY id;
-- 1 | 2024-01-05
-- 2 | 2024-01-19
```

### Filter on an expression

```sql
SELECT name, price * stock AS value
FROM products
WHERE price * stock > 9000            -- not WHERE value > 9000
ORDER BY value DESC;
-- Laptop   | 18186.00
-- Monitor  |  9899.70
-- Keyboard |  9540.00
```

### Use it in a loop

`WHERE` is the `if` inside the loop over rows. Stack conditions to narrow it down.

```sql
SELECT name, salary, hired_on
FROM employees
WHERE department_id = 1
  AND salary >= 130000
  AND hired_on < '2020-01-01'
ORDER BY salary DESC;
-- Ada Lovelace      | 185000 | 2016-02-01
-- Grace Hopper      | 160000 | 2017-06-12
-- Margaret Hamilton | 145000 | 2018-11-05
-- Linus Pauling     | 132000 | 2019-03-18
```

### Gotchas

- `WHERE email = NULL` matches nothing. Write `WHERE email IS NULL`.
- `a OR b AND c` means `a OR (b AND c)`. Add parentheses.
- `NOT IN (...)` returns no rows at all if the list holds a `NULL`.
- `BETWEEN '2024-01-01' AND '2024-01-31'` on a timestamp stops at midnight on the 31st. Use `>= '2024-01-01' AND < '2024-02-01'`.
