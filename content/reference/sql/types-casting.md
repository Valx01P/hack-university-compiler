# Types and Casting

Every value and column in PostgreSQL has a type, and Postgres rarely converts between types on its own. Convert with `value::type` (the Postgres shorthand) or `CAST(value AS type)` (standard SQL). Both do the same thing.

### Common types

| Type | Holds | Literal |
| --- | --- | --- |
| `integer` (`int`) | whole numbers, 4 bytes, up to about 2.1 billion | `42` |
| `bigint` | whole numbers, 8 bytes | `9000000000` |
| `numeric(p, s)` | exact decimals, `p` digits with `s` after the point | `19.99` |
| `double precision` (`float8`) | approximate floating point | `1.5::float8` |
| `text` | strings of any length | `'hello'` |
| `varchar(n)` | strings of at most `n` characters | `'hi'` |
| `boolean` | `t`, `f`, or NULL | `true` |
| `date` | a calendar day | `'2024-03-01'::date` |
| `timestamp` / `timestamptz` | date and time, without or with time zone | `'2024-01-05 10:30'::timestamp` |
| `interval` | a duration | `'1 day 2 hours'::interval` |
| `integer[]` | an array | `'{1,2,3}'::integer[]` |
| `jsonb` | JSON, stored parsed | `'{"a": 1}'::jsonb` |

Prefer `text` over `varchar(n)` and `numeric` for money. `float8` is fast but inexact.

### Cast

```sql
SELECT '42'::integer + 1           AS a,  -- 43
       CAST('3.5' AS numeric) * 2  AS b,  -- 7.0
       42::text || '!'             AS c,  -- 42!
       '2024-02-29'::date + 1      AS d,  -- 2024-03-01  (date + integer adds days)
       'yes'::boolean              AS e,  -- t
       '1 day 2 hours'::interval   AS f;  -- 1 day 02:00:00
```

A typed literal is the same idea with the type in front: `DATE '2024-03-01'`, `INTERVAL '7 days'`, `TIMESTAMP '2024-01-05 10:30'`.

### Numbers

```sql
SELECT 7::numeric / 2              AS cast_first,   -- 3.5000000000000000
       round(7::numeric / 2, 2)    AS rounded,      -- 3.50
       3.5::integer                AS to_int,       -- 4  (rounds)
       trunc(3.99)::integer        AS truncated,    -- 3
       'toolong'::varchar(3)       AS cut;          -- too  (an explicit cast truncates)
```

Integer division and `numeric` versus `float8` are in Math.

### Text and numbers

```sql
SELECT to_char(1234.5, 'FM9,999.00')            AS money,   -- 1,234.50
       to_number('1,234.50', '9G999D99')        AS num,     -- 1234.50
       format('%s costs %s', 'Laptop', 1299.00) AS msg;     -- Laptop costs 1299.00
```

`to_char` and `to_date` for dates are in Dates and Times.

### Cast columns in a query

```sql
SELECT name,
       price::integer          AS whole,
       price::text || ' USD'   AS label
FROM products
ORDER BY id
LIMIT 3;
-- Laptop   | 1299 | 1299.00 USD
-- Monitor  |  330 | 329.99 USD
-- Keyboard |   80 | 79.50 USD
```

### Check a type, or check before casting

```sql
SELECT pg_typeof(1)            AS a,  -- integer
       pg_typeof(1.5)          AS b,  -- numeric
       pg_typeof(2147483648)   AS c,  -- bigint
       pg_typeof(now())        AS d;  -- timestamp with time zone

SELECT raw,
       CASE WHEN pg_input_is_valid(raw, 'integer') THEN raw::integer END AS n
FROM (VALUES ('42'), ('abc'), ('7')) AS t(raw);
-- 42  | 42
-- abc |
-- 7   |  7
```

### Change a column's type

```sql
CREATE TABLE readings (id integer, value text);
INSERT INTO readings VALUES (1, '3.5'), (2, '10');
ALTER TABLE readings ALTER COLUMN value TYPE numeric USING value::numeric;
SELECT sum(value) FROM readings;  -- 13.5
```

### Gotchas

- Inserting `'toolong'` into a `varchar(3)` column fails with `value too long`, but the cast `'toolong'::varchar(3)` quietly cuts it to `too`.
- A bad cast stops the whole statement: `'abc'::integer` fails with `invalid input syntax for type integer`. Test with `pg_input_is_valid` first.
- `::` binds tighter than arithmetic: `1 + 2::text` casts only the `2` and fails. Write `(1 + 2)::text`.
- Casting to `integer` rounds (`3.5::integer` is `4`). Use `trunc` or `floor` to drop the fraction.
