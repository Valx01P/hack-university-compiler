# Constraints

Constraints are rules the database enforces on every write. A statement that breaks one fails with an `ERROR` and changes nothing.

### Column constraints

```sql
CREATE TABLE authors (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  text NOT NULL,
    email text NOT NULL UNIQUE,
    born  integer CHECK (born > 1000)
);
```

### Foreign keys

```sql harness
CREATE TABLE authors (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  text NOT NULL,
    email text NOT NULL UNIQUE,
    born  integer CHECK (born > 1000)
);
{{code}}
SELECT * FROM books ORDER BY id;
```

```sql
CREATE TABLE books (
    id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    author_id integer NOT NULL REFERENCES authors (id) ON DELETE CASCADE,
    title     text NOT NULL,
    price     numeric(8, 2) NOT NULL CHECK (price >= 0)
);

INSERT INTO authors (name, email, born) VALUES ('Ada', 'ada@x.io', 1815);  -- id 1
INSERT INTO books (author_id, title, price) VALUES (1, 'Notes', 12.50);
-- INSERT INTO books (author_id, title, price) VALUES (9, 'X', 1);
-- ERROR:  insert or update on table "books" violates foreign key constraint "books_author_id_fkey"
```

| `ON DELETE` | When the parent row is deleted |
| --- | --- |
| `NO ACTION` (default) / `RESTRICT` | the delete fails while children exist |
| `CASCADE` | the children are deleted too |
| `SET NULL` | the child column becomes `NULL` |
| `SET DEFAULT` | the child column gets its default |

`ON UPDATE` takes the same options for when the parent key changes.

### Table constraints: several columns, named

```sql
CREATE TABLE enrollments (
    student_id integer NOT NULL,
    course_id  integer NOT NULL,
    starts     date NOT NULL,
    ends       date NOT NULL,
    PRIMARY KEY (student_id, course_id),
    CONSTRAINT dates_in_order CHECK (ends > starts)
);

INSERT INTO enrollments VALUES (1, 10, '2025-01-01', '2025-06-01');
-- INSERT INTO enrollments VALUES (1, 10, '2025-02-01', '2025-03-01');
-- ERROR:  duplicate key value violates unique constraint "enrollments_pkey"
```

`PRIMARY KEY` means `UNIQUE` plus `NOT NULL`, and a table has at most one. Name your constraints with `CONSTRAINT name` so errors and `ALTER` statements read well.

### Add and drop later

```sql harness
CREATE TABLE authors (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  text NOT NULL,
    email text NOT NULL UNIQUE,
    born  integer CHECK (born > 1000)
);
CREATE TABLE books (
    id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    author_id integer NOT NULL REFERENCES authors (id) ON DELETE CASCADE,
    title     text NOT NULL,
    price     numeric(8, 2) NOT NULL CHECK (price >= 0)
);
INSERT INTO authors (name, email, born) VALUES ('Ada', 'ada@x.io', 1815);
INSERT INTO books (author_id, title, price) VALUES (1, 'Notes', 12.50);
{{code}}
SELECT conrelid::regclass AS tbl, conname, contype FROM pg_constraint
WHERE conrelid IN ('authors'::regclass, 'books'::regclass) AND contype <> 'n'
ORDER BY conrelid::regclass::text, conname;
```

```sql
ALTER TABLE authors ADD CONSTRAINT name_not_blank CHECK (trim(name) <> '');
ALTER TABLE books ADD CONSTRAINT one_title_per_author UNIQUE (author_id, title);
ALTER TABLE authors ALTER COLUMN born SET NOT NULL;   -- fails if a row has NULL
ALTER TABLE authors ALTER COLUMN born DROP NOT NULL;
ALTER TABLE books DROP CONSTRAINT one_title_per_author;
```

### List a table's constraints

```sql harness
CREATE TABLE authors (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  text NOT NULL,
    email text NOT NULL UNIQUE,
    born  integer CHECK (born > 1000)
);
CREATE TABLE books (
    id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    author_id integer NOT NULL REFERENCES authors (id) ON DELETE CASCADE,
    title     text NOT NULL,
    price     numeric(8, 2) NOT NULL CHECK (price >= 0)
);
{{code}}
```

```sql
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'books'::regclass AND contype <> 'n'   -- 'n' rows are the NOT NULLs
ORDER BY conname;
-- books_author_id_fkey | f
-- books_pkey           | p
-- books_price_check    | c
```

| Error text | Broken rule |
| --- | --- |
| `violates not-null constraint` | `NOT NULL` |
| `duplicate key value violates unique constraint` | `UNIQUE` or `PRIMARY KEY` |
| `violates foreign key constraint` | `REFERENCES` |
| `violates check constraint` | `CHECK` |

### Gotchas

- `UNIQUE` allows many `NULL`s, since `NULL` never equals `NULL`. Add `NULLS NOT DISTINCT` (`UNIQUE NULLS NOT DISTINCT (email)`) to allow only one.
- A `CHECK` passes when its expression is `NULL`. `CHECK (born > 1000)` accepts a `NULL` born, so add `NOT NULL` too.
- Postgres indexes primary keys and unique columns for you, but not foreign key columns. Index `books (author_id)` yourself if you join or delete by it.
- A foreign key needs the parent column to be a `PRIMARY KEY` or `UNIQUE`.
