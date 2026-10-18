# Math

Arithmetic works on columns row by row. The result type follows the inputs: `integer / integer` is integer division, and anything with a `numeric` (a literal like `2.0`) stays exact decimal.

### Arithmetic

```sql
SELECT 7 + 2,      -- 9
       7 - 2,      -- 5
       7 * 2,      -- 14
       7 / 2,      -- 3     integer division truncates
       7 / 2.0,    -- 3.5000000000000000
       7 % 2,      -- 1     remainder
       -7 / 2,     -- -3    truncates toward zero
       -7 % 2,     -- -1    sign follows the left side
       2 ^ 10;     -- 1024  power (returns a double)
```

### Get decimals from integers

```sql
SELECT 7::numeric / 2,          -- 3.5000000000000000
       7 * 1.0 / 2,             -- 3.5000000000000000
       round(7::numeric / 3, 2);  -- 2.33

SELECT round(avg(salary), 2) FROM employees;   -- 127625.00
```

### Rounding

```sql
SELECT round(3.14159, 2),       -- 3.14
       round(2.5),              -- 3    numeric rounds half away from zero
       round(2.5::float8),      -- 2    double rounds half to even
       round(1234.5, -2),       -- 1200
       ceil(2.1),               -- 3
       floor(-2.1),             -- -3
       trunc(-2.7),             -- -2   toward zero
       trunc(3.14159, 3);       -- 3.141
```

### Functions

| Call | Does |
| --- | --- |
| `abs(x)` | absolute value |
| `sign(x)` | -1, 0, or 1 |
| `power(a, b)` or `a ^ b` | `a` to the `b` |
| `sqrt(x)` or `\|/ x` | square root |
| `cbrt(x)` | cube root |
| `exp(x)` / `ln(x)` | e to the x, natural log |
| `log(x)` / `log(b, x)` | base 10, base `b` |
| `mod(a, b)` / `div(a, b)` | remainder, integer quotient |
| `greatest(a, b, ...)` / `least(...)` | max or min of the arguments |
| `gcd(a, b)` / `lcm(a, b)` | greatest common divisor, least common multiple |
| `factorial(n)` | n! |
| `pi()` | 3.141592653589793 |
| `random()` | double in [0, 1) |
| `width_bucket(x, lo, hi, n)` | which of `n` equal buckets `x` falls in |

```sql
SELECT abs(-5), sqrt(16), power(2, 8), log(2, 8), mod(17, 5), div(17, 5), factorial(5), gcd(12, 18);
-- 5 | 4 | 256 | 3.0000000000000000 | 2 | 3 | 120 | 6

SELECT floor(random() * 6 + 1)::int AS die;    -- 1 to 6
```

### Number types

```sql
SELECT 0.1 + 0.2,                       -- 0.3    numeric is exact
       0.1::float8 + 0.2::float8,       -- 0.30000000000000004
       2147483647 + 1::bigint,          -- 2147483648
       pg_typeof(7 / 2),                -- integer
       pg_typeof(7 / 2.0);              -- numeric
```

Money goes in `numeric(10, 2)`, never `real` or `double precision`.

### Format a number

```sql
SELECT to_char(1234567.891, 'FM9,999,999.00'),   -- 1,234,567.89
       to_char(42, 'FM000'),                      -- 042
       round(0.256 * 100, 1) || '%';              -- 25.6%
```

### Use it in a loop

Math on every row, with `generate_series` as a counter.

```sql
SELECT n, n * n AS square, 2 ^ n AS pow2, n % 3 = 0 AS fizz
FROM generate_series(1, 4) AS n;
-- 1 |  1 |  2 | f
-- 2 |  4 |  4 | f
-- 3 |  9 |  8 | t
-- 4 | 16 | 16 | f
```

### Gotchas

- `count(*) / 3` and `5 / 2` are integer division. Cast one side: `count(*)::numeric / 3`.
- Dividing by zero raises `ERROR:  division by zero`. Guard with `x / nullif(y, 0)`.
- `integer` overflows past 2147483647 with an error. Use `bigint` for big sums.
- `^` is power, not XOR, and it is left-associative: `2 ^ 3 ^ 2` is 64.
