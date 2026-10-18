# Strings

Use `text` for strings. Literals use single quotes, with `''` for a quote inside. Concatenate with `||`. Positions start at 1, and every function works on a whole column at once.

### Concatenate

```sql
SELECT 'Hello' || ', ' || 'world';            -- Hello, world
SELECT 'id-' || 42;                           -- id-42, numbers convert
SELECT 'a' || NULL;                           -- NULL
SELECT concat('a', NULL, 'b', 1);             -- ab1, NULL skipped
SELECT concat_ws(', ', 'Austin', NULL, 'TX'); -- Austin, TX  (with separator)
SELECT format('%s costs $%s', 'Lamp', 59);    -- Lamp costs $59
```

### Length, case, trim

```sql
SELECT length('héllo'),           -- 5 characters
       octet_length('héllo'),     -- 6 bytes
       upper('abc'),              -- ABC
       lower('ABC'),              -- abc
       initcap('ada lovelace'),   -- Ada Lovelace
       trim('  hi  '),            -- hi
       ltrim('xxhi', 'x'),        -- hi
       rtrim('hi!!', '!');        -- hi
```

### Substrings

```sql
SELECT substring('PostgreSQL' from 1 for 4),   -- Post
       substr('PostgreSQL', 5),                -- greSQL
       left('PostgreSQL', 4),                  -- Post
       right('PostgreSQL', 3),                 -- SQL
       left('PostgreSQL', -3);                 -- Postgre  (negative: all but the last 3)
```

### Search and replace

```sql
SELECT position('SQL' in 'PostgreSQL'),        -- 8  (0 if missing)
       strpos('PostgreSQL', 'gre'),            -- 5
       replace('a-b-c', '-', '+'),             -- a+b+c
       'PostgreSQL' LIKE '%SQL';               -- t
```

### Split and join

```sql
SELECT split_part('ada@example.com', '@', 2);      -- example.com
SELECT string_to_array('a,b,c', ',');               -- {a,b,c}
SELECT array_to_string(ARRAY['a', 'b', 'c'], '-'); -- a-b-c

SELECT string_agg(name, ', ' ORDER BY name)        -- join a column into one string
FROM products WHERE category = 'Furniture';
-- Chair, Desk, Lamp
```

### Pad, repeat, reverse

```sql
SELECT lpad('7', 3, '0'),       -- 007
       rpad('ab', 5, '.'),      -- ab...
       repeat('ab', 3),         -- ababab
       reverse('abc'),          -- cba
       ascii('A'),              -- 65
       chr(66);                 -- B
```

| Call | Does |
| --- | --- |
| `a \|\| b` | concatenate (`NULL` if either is `NULL`) |
| `concat(...)` / `concat_ws(sep, ...)` | concatenate, skipping `NULL` |
| `length(s)` | number of characters |
| `upper` / `lower` / `initcap` | change case |
| `trim(s)` / `trim(both 'x' from s)` | strip spaces or given characters |
| `substring(s from i for n)` | `n` characters starting at `i` (1-based) |
| `left(s, n)` / `right(s, n)` | first or last `n` characters |
| `position(sub in s)` | index of `sub`, 0 if missing |
| `replace(s, from, to)` | replace every occurrence |
| `split_part(s, sep, n)` | the `n`th field |
| `string_agg(col, sep)` | join many rows into one string |
| `format('%s %L', ...)` | printf-style, `%L` quotes as a literal |

### Use it in a loop

Turn one string into rows, work on each piece, and glue it back.

```sql
SELECT string_agg(initcap(word), ' ' ORDER BY i) AS title
FROM unnest(string_to_array('the art of sql', ' ')) WITH ORDINALITY AS t(word, i);
-- The Art Of Sql

SELECT name, upper(left(name, 1)) || '.' AS initial, length(name) AS len
FROM products WHERE id <= 2 ORDER BY id;
-- Laptop  | L. | 6
-- Monitor | M. | 7
```

### Gotchas

- `"double quotes"` are column names. Strings always use `'single quotes'`, and `'it''s'` escapes a quote.
- `||` with a `NULL` gives `NULL`. Use `concat` or `coalesce(col, '')`.
- Indexes start at 1. `substring(s from 0 for 3)` gives only 2 characters.
- `=` and `LIKE` are case-sensitive. Compare `lower(a) = lower(b)`, or use `ILIKE`.
