# Arrays and JSON

Any Postgres type can be an array (`text[]`, `integer[]`), and `jsonb` stores JSON as a parsed, indexable value. Arrays start at index 1, not 0.

```sql
CREATE TABLE posts (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL,
    tags  text[] NOT NULL DEFAULT '{}',
    meta  jsonb NOT NULL DEFAULT '{}'
);
INSERT INTO posts (title, tags, meta) VALUES
    ('Intro', ARRAY['sql', 'basics'], '{"author": "Ana", "views": 120, "draft": false}'),
    ('Joins', '{sql,joins}', '{"author": "Bo", "views": 45, "links": ["a", "b"]}'),
    ('Notes', '{}', '{"author": "Ana", "views": 3, "draft": true}');
```

### Arrays: create and access

```sql harness
CREATE TABLE posts (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL,
    tags  text[] NOT NULL DEFAULT '{}',
    meta  jsonb NOT NULL DEFAULT '{}'
);
INSERT INTO posts (title, tags, meta) VALUES
    ('Intro', ARRAY['sql', 'basics'], '{"author": "Ana", "views": 120, "draft": false}'),
    ('Joins', '{sql,joins}', '{"author": "Bo", "views": 45, "links": ["a", "b"]}'),
    ('Notes', '{}', '{"author": "Ana", "views": 3, "draft": true}');
{{code}}
```

```sql
SELECT ARRAY[10, 20, 30] AS a,         -- {10,20,30}
       '{x,y}'::text[] AS b,           -- {x,y}
       (ARRAY[10, 20, 30])[1] AS one,  -- 10
       (ARRAY[10, 20, 30])[2:3] AS s,  -- {20,30}
       (ARRAY[10, 20, 30])[9] AS out;  -- NULL, no error

SELECT title, tags[1] AS first_tag, cardinality(tags) AS n
FROM posts ORDER BY id;
-- Intro | sql | 2
-- Joins | sql | 2
-- Notes |     | 0
```

### Arrays: search and change

```sql harness
CREATE TABLE posts (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL,
    tags  text[] NOT NULL DEFAULT '{}',
    meta  jsonb NOT NULL DEFAULT '{}'
);
INSERT INTO posts (title, tags, meta) VALUES
    ('Intro', ARRAY['sql', 'basics'], '{"author": "Ana", "views": 120, "draft": false}'),
    ('Joins', '{sql,joins}', '{"author": "Bo", "views": 45, "links": ["a", "b"]}'),
    ('Notes', '{}', '{"author": "Ana", "views": 3, "draft": true}');
{{code}}
SELECT title, tags FROM posts ORDER BY id;
```

```sql
SELECT title FROM posts WHERE 'joins' = ANY (tags);             -- Joins
SELECT title FROM posts WHERE tags @> ARRAY['sql'] ORDER BY id; -- Intro, Joins

UPDATE posts SET tags = array_append(tags, 'draft') WHERE title = 'Notes';
UPDATE posts SET tags = array_remove(tags, 'basics') WHERE title = 'Intro';
```

| Call | Does |
| --- | --- |
| `cardinality(a)` | number of items, `0` when empty |
| `array_length(a, 1)` | length of dimension 1, `NULL` when empty |
| `array_append(a, x)`, `array_prepend(x, a)`, `a \|\| b` | add items |
| `array_remove(a, x)` | drop every `x` |
| `array_position(a, x)` | index of the first `x`, or `NULL` |
| `x = ANY (a)` | `a` contains `x` |
| `a @> b` / `a && b` | `a` contains all of `b` / they share an item |
| `array_to_string(a, ', ')`, `string_to_array(s, ',')` | to and from text |

### unnest and array_agg: rows to arrays and back

```sql harness
CREATE TABLE posts (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL,
    tags  text[] NOT NULL DEFAULT '{}',
    meta  jsonb NOT NULL DEFAULT '{}'
);
INSERT INTO posts (title, tags, meta) VALUES
    ('Intro', ARRAY['sql', 'basics'], '{"author": "Ana", "views": 120, "draft": false}'),
    ('Joins', '{sql,joins}', '{"author": "Bo", "views": 45, "links": ["a", "b"]}'),
    ('Notes', '{}', '{"author": "Ana", "views": 3, "draft": true}');
UPDATE posts SET tags = array_append(tags, 'draft') WHERE title = 'Notes';
UPDATE posts SET tags = array_remove(tags, 'basics') WHERE title = 'Intro';
{{code}}
```

```sql
SELECT tag, count(*) AS posts               -- one row per tag, use it like a loop
FROM posts, unnest(tags) AS tag
GROUP BY tag
ORDER BY tag;
-- draft | 1
-- joins | 1
-- sql   | 2

SELECT * FROM unnest(ARRAY['a', 'b']) WITH ORDINALITY AS t(tag, pos);
-- a | 1
-- b | 2

SELECT meta ->> 'author' AS author, array_agg(title ORDER BY title) AS titles
FROM posts
GROUP BY author
ORDER BY author;
-- Ana | {Intro,Notes}
-- Bo  | {Joins}
```

### JSONB: read

```sql harness
CREATE TABLE posts (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL,
    tags  text[] NOT NULL DEFAULT '{}',
    meta  jsonb NOT NULL DEFAULT '{}'
);
INSERT INTO posts (title, tags, meta) VALUES
    ('Intro', ARRAY['sql', 'basics'], '{"author": "Ana", "views": 120, "draft": false}'),
    ('Joins', '{sql,joins}', '{"author": "Bo", "views": 45, "links": ["a", "b"]}'),
    ('Notes', '{}', '{"author": "Ana", "views": 3, "draft": true}');
{{code}}
```

```sql
SELECT meta -> 'author' AS as_json,                   -- "Ana"  (jsonb)
       meta ->> 'author' AS as_text,                  -- Ana    (text)
       (meta ->> 'views')::integer + 1 AS views,      -- 121
       meta -> 'links' ->> 0 AS first_link,           -- NULL here, 'a' for Joins
       meta #>> '{links,1}' AS second_link            -- path form
FROM posts
WHERE id = 1;

SELECT title FROM posts WHERE meta @> '{"author": "Ana"}' ORDER BY id;  -- Intro, Notes
SELECT title FROM posts WHERE meta ? 'links';                            -- Joins
SELECT title FROM posts WHERE (meta ->> 'views')::integer > 100;         -- Intro
```

### JSONB: change and build

```sql harness
CREATE TABLE posts (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL,
    tags  text[] NOT NULL DEFAULT '{}',
    meta  jsonb NOT NULL DEFAULT '{}'
);
INSERT INTO posts (title, tags, meta) VALUES
    ('Intro', ARRAY['sql', 'basics'], '{"author": "Ana", "views": 120, "draft": false}'),
    ('Joins', '{sql,joins}', '{"author": "Bo", "views": 45, "links": ["a", "b"]}'),
    ('Notes', '{}', '{"author": "Ana", "views": 3, "draft": true}');
{{code}}
SELECT id, meta FROM posts ORDER BY id;
```

```sql
UPDATE posts SET meta = meta || '{"draft": false}' WHERE id = 3;     -- merge keys
UPDATE posts SET meta = meta - 'links' WHERE id = 2;                 -- drop a key
UPDATE posts SET meta = jsonb_set(meta, '{views}', '200') WHERE id = 1;

SELECT jsonb_build_object('id', id, 'title', title) FROM posts WHERE id = 1;
-- {"id": 1, "title": "Intro"}
SELECT jsonb_agg(title ORDER BY id) FROM posts;
-- ["Intro", "Joins", "Notes"]
SELECT key, value FROM jsonb_each_text('{"a": 1, "b": "x"}') ORDER BY key;
-- a | 1
-- b | x
```

| Operator or call | Does |
| --- | --- |
| `j -> 'k'`, `j -> 0` | field or element, as `jsonb` |
| `j ->> 'k'`, `j ->> 0` | field or element, as `text` |
| `j #> '{a,b}'`, `j #>> '{a,b}'` | follow a path |
| `j @> '{"k": 1}'` | contains |
| `j ? 'k'` | has key |
| `j \|\| j2`, `j - 'k'` | merge, remove key |
| `jsonb_set(j, '{path}', value)` | replace at a path |
| `jsonb_array_elements(j)`, `jsonb_each(j)` | expand to rows |
| `jsonb_build_object`, `jsonb_agg`, `to_jsonb(row)` | build JSON |
| `jsonb_typeof(j)`, `jsonb_array_length(j)` | inspect |

### Gotchas

- `->>` returns text. Cast before math or comparing numbers, or `'9' > '100'` is true because text compares letter by letter.
- `::` binds tighter than `->>`. `meta ->> 'views'::integer` casts the key and fails, so write `(meta ->> 'views')::integer`.
- `array_length('{}'::integer[], 1)` is `NULL`, not `0`. Use `cardinality`.
- A missing JSON key gives `NULL`, not an error, so a typo in a key name fails silently.
- Index `jsonb` and array columns with `USING gin` (see Indexes and EXPLAIN) so `@>`, `?`, and `&&` stay fast.
