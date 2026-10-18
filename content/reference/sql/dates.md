# Dates and Times

PostgreSQL has real types for this: `date`, `time`, `timestamp` (no time zone), `timestamptz` (a moment in time), and `interval` (a duration). Write literals as ISO strings, `'2024-03-15'`, and let PostgreSQL convert them.

### Literals and now

```sql
SELECT DATE '2024-03-15',                    -- 2024-03-15
       '2024-03-15'::date,                   -- same, with a cast
       TIMESTAMP '2024-03-15 14:30:00',      -- 2024-03-15 14:30:00
       TIME '14:30',                         -- 14:30:00
       INTERVAL '1 day 2 hours',             -- 1 day 02:00:00
       make_date(2024, 3, 15);               -- 2024-03-15

SELECT current_date,        -- today, a date
       now(),               -- timestamptz, the start of this transaction
       localtimestamp;      -- timestamp, no zone
```

| Type | Holds | Example |
| --- | --- | --- |
| `date` | calendar day | `2024-03-15` |
| `time` | time of day | `14:30:00` |
| `timestamp` | date and time, no zone | `2024-03-15 14:30:00` |
| `timestamptz` | an exact moment, shown in the session zone | `2024-03-15 14:30:00+00` |
| `interval` | a length of time | `1 mon 2 days` |

### Date arithmetic

```sql
SELECT DATE '2024-03-15' + 7,                        -- 2024-03-22  (date + integer days)
       DATE '2024-03-15' - DATE '2024-01-01',        -- 74          (date - date = days)
       DATE '2024-03-15' + INTERVAL '1 month',       -- 2024-04-15 00:00:00  (now a timestamp)
       (DATE '2024-03-15' + INTERVAL '1 month')::date,  -- 2024-04-15
       TIMESTAMP '2024-03-15 18:00' - TIMESTAMP '2024-03-14 12:00',  -- 1 day 06:00:00
       INTERVAL '1 hour' * 3,                        -- 03:00:00
       age(DATE '2024-03-15', DATE '2020-01-01');    -- 4 years 2 mons 14 days
```

### Pull out a part: extract

```sql
SELECT extract(year FROM DATE '2024-03-15'),     -- 2024
       extract(month FROM DATE '2024-03-15'),    -- 3
       extract(dow FROM DATE '2024-03-15'),      -- 5  (0 = Sunday)
       extract(doy FROM DATE '2024-03-15'),      -- 75 (day of year)
       extract(epoch FROM INTERVAL '2 hours');   -- 7200.000000 seconds
```

Fields: `year`, `quarter`, `month`, `week`, `day`, `dow`, `doy`, `hour`, `minute`, `second`, `epoch`.

### Round down: date_trunc

```sql
SELECT date_trunc('month', TIMESTAMP '2024-03-15 14:30'),   -- 2024-03-01 00:00:00
       date_trunc('hour', TIMESTAMP '2024-03-15 14:30'),    -- 2024-03-15 14:00:00
       date_trunc('month', DATE '2024-03-15')::date;        -- 2024-03-01

SELECT (date_trunc('month', DATE '2024-02-10') + INTERVAL '1 month - 1 day')::date;
-- 2024-02-29  (last day of the month)
```

### Format and parse

```sql
SELECT to_char(DATE '2024-03-05', 'YYYY-MM-DD'),     -- 2024-03-05
       to_char(DATE '2024-03-05', 'Mon DD, YYYY'),   -- Mar 05, 2024
       to_char(DATE '2024-03-05', 'FMDay'),          -- Tuesday
       to_char(TIMESTAMP '2024-03-05 14:07', 'HH24:MI'),  -- 14:07
       to_date('05/03/2024', 'DD/MM/YYYY'),          -- 2024-03-05
       to_timestamp('2024-03-05 14:07', 'YYYY-MM-DD HH24:MI')::timestamp;  -- 2024-03-05 14:07:00
```

### Time zones

```sql
SELECT TIMESTAMPTZ '2024-03-15 12:00+00' AT TIME ZONE 'America/New_York';
-- 2024-03-15 08:00:00  (that moment on New York's wall clock)

SET TIME ZONE 'UTC';   -- how timestamptz values print for the rest of the session
```

### Filter by date

```sql
SELECT id, ordered_on FROM orders
WHERE ordered_on >= '2024-06-01' AND ordered_on < '2024-07-01'   -- all of June
ORDER BY id;
-- 11 | 2024-06-09
-- 12 | 2024-06-30

SELECT name FROM employees
WHERE hired_on >= current_date - INTERVAL '5 years'      -- hired in the last 5 years
ORDER BY hired_on;
```

### Use it in a loop

`generate_series` walks a range of dates, one row per step.

```sql
SELECT d::date AS day, to_char(d, 'Dy') AS weekday
FROM generate_series(DATE '2024-03-01', DATE '2024-03-03', INTERVAL '1 day') AS d;
-- 2024-03-01 | Fri
-- 2024-03-02 | Sat
-- 2024-03-03 | Sun

SELECT date_trunc('month', ordered_on)::date AS month, count(*) AS orders
FROM orders
GROUP BY month
ORDER BY month
LIMIT 3;
-- 2024-01-01 | 2
-- 2024-02-01 | 2
-- 2024-03-01 | 2
```

### Gotchas

- `date + INTERVAL` returns a `timestamp`. Cast back with `::date` when you want a date.
- Month math clamps: `DATE '2024-01-31' + INTERVAL '1 month'` is `2024-02-29`, and adding another month gives March 29, not March 31.
- `BETWEEN '2024-06-01' AND '2024-06-30'` on a timestamp misses everything after midnight on the 30th. Use `>= start AND < next_day`.
- `now()` stays the same for the whole transaction. Use `clock_timestamp()` for the real current time.
