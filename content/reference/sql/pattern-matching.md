# Pattern Matching

`LIKE` matches simple wildcards and is case-sensitive. `ILIKE` is the case-insensitive version (PostgreSQL only). For anything harder, use the regex operators `~` and `~*`.

### LIKE and ILIKE

```sql
SELECT name FROM employees WHERE name LIKE 'A%' ORDER BY name;      -- starts with A
-- Ada Lovelace, Alan Turing, Annie Easley

SELECT name FROM employees WHERE name LIKE '% J%' ORDER BY name;    -- a word starting with J
-- Katherine Johnson, Mary Jackson

SELECT name FROM employees WHERE name ILIKE '%hop%';                -- contains, any case
-- Grace Hopper

SELECT name FROM products WHERE name LIKE '_ouse';                  -- _ is exactly one char
-- Mouse

SELECT count(*) FROM employees WHERE email NOT LIKE '%@example.com';  -- 0, NULL emails are not counted
```

| Wildcard | Matches |
| --- | --- |
| `%` | any run of characters, including none |
| `_` | exactly one character |
| `\%` `\_` | a literal `%` or `_` (backslash is the default escape) |

```sql
SELECT '50% off' LIKE '50\% off' AS a,     -- t
       'a_b' LIKE 'a!_b' ESCAPE '!' AS b,  -- t, pick your own escape
       'Abc' LIKE 'abc' AS c,              -- f
       'Abc' ILIKE 'abc' AS d;             -- t
```

### Prefix test

```sql
SELECT starts_with('Laptop', 'Lap'),    -- t
       'Laptop' ^@ 'Lap';               -- t, same thing as an operator
```

### Regular expressions

```sql
SELECT name FROM products WHERE name ~ '^[A-D]' ORDER BY name;   -- POSIX regex, case-sensitive
-- Chair, Desk

SELECT name FROM products WHERE name ~* 'CAM|lamp' ORDER BY name;  -- case-insensitive
-- Lamp, Webcam

SELECT name FROM products WHERE name ~ '\s';                       -- \s \d \w work
-- USB Cable

SELECT count(*) FROM products WHERE name !~ '[aeiou]{2}';            -- 6, no two vowels in a row
```

| Operator | Means |
| --- | --- |
| `s ~ 're'` | matches, case-sensitive |
| `s ~* 're'` | matches, ignoring case |
| `s !~ 're'` | does not match |
| `s !~* 're'` | does not match, ignoring case |

### Regex functions

```sql
SELECT regexp_replace('a1b22c333', '\d+', '#', 'g');      -- a#b#c#  ('g' = every match)
SELECT regexp_replace('a1b22c333', '\d+', '#');           -- a#b22c333  (first match only)
SELECT regexp_match('order-42-7', '(\d+)-(\d+)');          -- {42,7}  text[] of the groups
SELECT (regexp_match('order-42-7', '(\d+)'))[1];           -- 42  (arrays start at 1)
SELECT regexp_substr('order-42-7', '\d+');                 -- 42
SELECT regexp_count('banana', 'a');                        -- 3
SELECT regexp_like('Hello', 'h', 'i');                     -- t
SELECT substring('ID: 977' from '\d+');                    -- 977
```

### Use it in a loop

`regexp_matches` with `'g'` and `regexp_split_to_table` return one row per piece.

```sql
SELECT m[1] AS num FROM regexp_matches('a1b22c333', '\d+', 'g') AS m;
-- 1
-- 22
-- 333

SELECT word FROM regexp_split_to_table('one  two three', '\s+') AS word;
-- one
-- two
-- three
```

### Gotchas

- `LIKE` must match the whole string: `name LIKE 'Lap'` is false for `Laptop`. Add `%`. A regex `~` matches anywhere unless you anchor it with `^` and `$`.
- `LIKE` is case-sensitive in PostgreSQL. Use `ILIKE`, or `lower(name) LIKE 'lap%'`.
- `regexp_replace` replaces only the first match unless you pass `'g'`.
- `SIMILAR TO` exists, but it is a strange mix of `LIKE` and regex. Use `~` instead.
