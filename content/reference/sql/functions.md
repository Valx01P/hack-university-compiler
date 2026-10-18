# Functions

Postgres has hundreds of built-in functions, called as `name(args)` anywhere an expression fits. `CREATE FUNCTION` adds your own, written in plain SQL or in PL/pgSQL when you need variables, `IF`, and loops.

### Built-in families

| Family | Common calls |
| --- | --- |
| Strings | `length`, `lower`, `upper`, `trim`, `substring`, `replace`, `split_part`, `concat_ws`, `format` |
| Math | `abs`, `round(x, 2)`, `ceil`, `floor`, `mod`, `power`, `sqrt`, `random()` |
| Dates | `now()`, `current_date`, `extract`, `date_trunc`, `age`, `to_char` |
| NULL and comparing | `coalesce`, `nullif`, `greatest`, `least` |
| Aggregates | `count`, `sum`, `avg`, `min`, `max`, `string_agg`, `array_agg` |
| Window | `row_number`, `rank`, `lag`, `lead` |
| Arrays and JSON | `unnest`, `cardinality`, `jsonb_build_object`, `jsonb_agg` |
| Sets of rows | `generate_series`, `unnest`, `jsonb_each` |
| Types | `pg_typeof(x)`, `gen_random_uuid()` |

```sql
SELECT greatest(1, 5, 3),          -- 5
       coalesce(NULL, 'none'),     -- none
       pg_typeof(1.5),             -- numeric
       format('%s has %s', 'Ana', 3);   -- Ana has 3
```

### generate_series: SQL's for loop

```sql
SELECT n FROM generate_series(1, 10, 3) AS n;          -- 1, 4, 7, 10

SELECT d::date AS day
FROM generate_series(DATE '2025-01-01', DATE '2025-01-03', INTERVAL '1 day') AS d;
-- 2025-01-01, 2025-01-02, 2025-01-03
```

Use it to make test rows (`INSERT ... SELECT ... FROM generate_series(1, 1000)`) or to fill gaps, like a row for every day even when nothing happened that day.

### CREATE FUNCTION in SQL

```sql
CREATE FUNCTION add_tax(price numeric, rate numeric DEFAULT 0.08)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
RETURN round(price * (1 + rate), 2);

SELECT add_tax(10),                      -- 10.80
       add_tax(10, 0.2),                 -- 12.00
       add_tax(price => 10, rate => 0.5);  -- 15.00, named arguments
```

### A function that returns rows

```sql
CREATE TABLE staff (name text, dept text);
INSERT INTO staff VALUES ('Ana', 'eng'), ('Bo', 'eng'), ('Cy', 'sales');

CREATE FUNCTION staff_in(d text)
RETURNS TABLE (name text)
LANGUAGE sql
STABLE
AS $$
    SELECT s.name FROM staff AS s WHERE s.dept = d ORDER BY s.name
$$;

SELECT * FROM staff_in('eng');            -- Ana, Bo
```

### PL/pgSQL: variables, IF, loops

```sql
CREATE FUNCTION fizzbuzz(n integer)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
    IF n % 15 = 0 THEN
        RETURN 'FizzBuzz';
    ELSIF n % 3 = 0 THEN
        RETURN 'Fizz';
    ELSIF n % 5 = 0 THEN
        RETURN 'Buzz';
    END IF;
    RETURN n::text;
END;
$$;

CREATE FUNCTION fib(n integer)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
    a   bigint := 0;
    b   bigint := 1;
    tmp bigint;
BEGIN
    FOR i IN 1..n LOOP
        tmp := a + b;
        a := b;
        b := tmp;
    END LOOP;
    RETURN a;
END;
$$;

SELECT fizzbuzz(n) FROM generate_series(1, 5) AS n;   -- 1, 2, Fizz, 4, Buzz
SELECT fib(10);                                       -- 55
```

### Replace and drop

```sql
CREATE OR REPLACE FUNCTION add_tax(price numeric, rate numeric DEFAULT 0.1)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
RETURN round(price * (1 + rate), 2);

DROP FUNCTION add_tax(numeric, numeric);    -- the argument types pick the overload
DROP FUNCTION IF EXISTS no_such_function;
```

| Piece | Means |
| --- | --- |
| `RETURNS type` | one value |
| `RETURNS TABLE (cols)` / `RETURNS SETOF type` | many rows, call it in `FROM` |
| `LANGUAGE sql` | the body is one query |
| `LANGUAGE plpgsql` | `DECLARE`, `IF`, `FOR`, `WHILE`, `RAISE` |
| `RETURN expr` | the short SQL body, no quoting needed |
| `AS $$ ... $$` | the body as a dollar-quoted string |
| `IMMUTABLE` / `STABLE` / `VOLATILE` | same inputs give the same output always / within a query / maybe not |

### Gotchas

- A parameter with the same name as a column is ambiguous. Qualify columns (`s.name`) or name parameters differently (`p_dept`).
- `CREATE OR REPLACE` can't change the return type. Drop the function and create it again.
- Functions overload by argument types, so `add_tax(integer)` and `add_tax(numeric)` are two functions. `DROP FUNCTION` needs the types when names repeat.
- PL/pgSQL assigns with `:=` and compares with `=`. `ELSIF` has no second `E`.
