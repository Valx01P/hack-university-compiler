# NULL

`NULL` means "unknown", not zero or empty. Almost anything combined with `NULL` is `NULL`, so `= NULL` is never true. Test it with `IS NULL`. In `psql` output a `NULL` prints as nothing.

### Test for NULL

```sql
SELECT name FROM employees WHERE email IS NULL ORDER BY name;
-- Frances Allen, Linus Pauling

SELECT count(*) FROM employees WHERE email IS NOT NULL;   -- 14
SELECT count(*) FROM employees WHERE email = NULL;        -- 0, always
```

### Replace NULL: COALESCE

`coalesce` returns its first argument that is not `NULL`.

```sql
SELECT name, coalesce(email, 'no email') AS contact
FROM employees
WHERE id IN (3, 4)
ORDER BY id;
-- Alan Turing   | alan@example.com
-- Linus Pauling | no email

SELECT coalesce(NULL, NULL, 7, 9);     -- 7
```

### Make a NULL: NULLIF

`nullif(a, b)` is `NULL` when `a = b`, otherwise `a`. Its classic use is avoiding division by zero.

```sql
SELECT name, price / nullif(stock, 0) AS per_unit
FROM products
WHERE id IN (5, 6)
ORDER BY id;
-- Desk  | 56.1250000000000000
-- Chair |                       (stock is 0, so NULL instead of an error)

SELECT nullif('', '') IS NULL;         -- t, turns empty strings into NULL
```

### NULL in expressions

```sql
SELECT 1 + NULL,                  -- NULL
       'a' || NULL,               -- NULL
       concat('a', NULL, 'b'),    -- ab, concat skips NULLs
       NULL = NULL,               -- NULL, not t
       NULL IS NULL,              -- t
       NULL IS DISTINCT FROM 1,   -- t
       1 IS NOT DISTINCT FROM 1;  -- t, = that treats NULL as a value
```

### Three-valued logic

`WHERE` keeps a row only when the condition is `t`. Both `f` and `NULL` drop it.

| `a` | `b` | `a AND b` | `a OR b` | `NOT a` |
| --- | --- | --- | --- | --- |
| `t` | `NULL` | `NULL` | `t` | `f` |
| `f` | `NULL` | `f` | `NULL` | `t` |
| `NULL` | `NULL` | `NULL` | `NULL` | `NULL` |

### Aggregates skip NULL

```sql
SELECT count(*) AS everyone,            -- 16, counts rows
       count(email) AS with_email,      -- 14, counts non-NULL values
       count(department_id) AS in_dept  -- 15
FROM employees;
```

### Sort NULLs

`ASC` puts `NULL` last and `DESC` puts it first. Override with `ORDER BY col NULLS FIRST` or `NULLS LAST` (see Sorting and Limiting).

### Use it in a loop

Clean every row at once: fill in defaults and flag what is missing.

```sql
SELECT name,
       coalesce(department_id::text, 'unassigned') AS dept,
       email IS NULL AS missing_email
FROM employees
WHERE email IS NULL OR department_id IS NULL
ORDER BY id;
-- Linus Pauling | 1          | t
-- Frances Allen | 3          | t
-- Ken Thompson  | unassigned | f
```

### Gotchas

- `x = NULL` and `x <> NULL` are never true. Use `IS NULL` and `IS NOT NULL`.
- `WHERE id NOT IN (1, NULL)` returns no rows. Filter `NULL` out of the list (or use `NOT EXISTS`).
- `WHERE status <> 'done'` also drops rows where `status` is `NULL`. Add `OR status IS NULL` if you want them.
- `count(col)`, `sum`, and `avg` ignore `NULL`, so `avg` divides by the non-NULL count only.
