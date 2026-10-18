# Indexes and EXPLAIN

An index is a sorted lookup structure on some columns, so a query can jump to matching rows instead of reading the whole table. `EXPLAIN` shows which one the planner chose.

```sql
CREATE TABLE purchases (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id integer NOT NULL,
    status      text NOT NULL,
    total       numeric(10, 2) NOT NULL,
    created_at  date NOT NULL
);
INSERT INTO purchases (customer_id, status, total, created_at)
SELECT n % 500,
       CASE WHEN n % 10 = 0 THEN 'open' ELSE 'shipped' END,
       n % 97,
       DATE '2025-01-01' + n % 365
FROM generate_series(1, 20000) AS n;
ANALYZE purchases;                               -- refresh the planner's statistics
```

### Create

```sql
CREATE INDEX purchases_customer_id_idx ON purchases (customer_id);
CREATE INDEX ON purchases (customer_id, created_at);              -- name picked for you
CREATE INDEX purchases_open_idx ON purchases (created_at) WHERE status = 'open';   -- partial
CREATE INDEX purchases_lower_status_idx ON purchases (lower(status));              -- expression
CREATE INDEX IF NOT EXISTS purchases_customer_id_idx ON purchases (customer_id);
```

The default index type is a B-tree, for `=`, `<`, `>`, ranges, and sorting. Arrays and `jsonb` need a GIN index for `@>`, `?`, and `&&`: `CREATE INDEX ON posts USING gin (tags);`.

### Unique indexes

```sql
CREATE TABLE accounts (id integer PRIMARY KEY, email text NOT NULL);
CREATE UNIQUE INDEX accounts_email_lower_key ON accounts (lower(email));

INSERT INTO accounts VALUES (1, 'Ana@x.io');
-- INSERT INTO accounts VALUES (2, 'ana@x.io');
-- ERROR:  duplicate key value violates unique constraint "accounts_email_lower_key"
```

A `PRIMARY KEY` or `UNIQUE` constraint builds a unique index for you. A unique index on an expression, like `lower(email)` here, is something a constraint can't do.

### Read EXPLAIN

```sql
EXPLAIN SELECT * FROM purchases WHERE id = 7;
EXPLAIN (COSTS OFF) SELECT * FROM purchases WHERE customer_id = 42 ORDER BY created_at;
EXPLAIN (COSTS OFF) SELECT * FROM purchases WHERE customer_id + 0 = 42;
```

```text
 Index Scan using purchases_pkey on purchases  (cost=0.29..8.30 rows=1 width=23)
   Index Cond: (id = 7)

 Sort
   Sort Key: created_at
   ->  Bitmap Heap Scan on purchases
         Recheck Cond: (customer_id = 42)
         ->  Bitmap Index Scan on purchases_customer_id_created_at_idx
               Index Cond: (customer_id = 42)

 Seq Scan on purchases
   Filter: ((customer_id + 0) = 42)
```

Read a plan from the most indented line up: each `->` node feeds the one above it. `cost=start..total` is in made-up units, `rows` is the planner's guess. `EXPLAIN ANALYZE` actually runs the query and adds the real time and row counts.

| Plan node | Means |
| --- | --- |
| `Seq Scan` | reads every row, fine for small tables or most of a table |
| `Index Scan` | walks the index, then fetches each row |
| `Index Only Scan` | answers from the index alone |
| `Bitmap Index Scan` + `Bitmap Heap Scan` | collects matches from an index, then reads them in table order |
| `Filter:` | a condition checked row by row, no index helped |
| `Index Cond:` | a condition the index answered |
| `Sort`, `Hash Join`, `Nested Loop` | sorting and the join strategies |

### List and drop

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'purchases' ORDER BY indexname;
-- purchases_customer_id_created_at_idx, purchases_customer_id_idx,
-- purchases_lower_status_idx, purchases_open_idx, purchases_pkey

DROP INDEX purchases_customer_id_idx;
DROP INDEX IF EXISTS no_such_idx;
```

### Gotchas

- An expression on the column hides it from the index. `WHERE customer_id + 0 = 42` and `WHERE lower(status) = 'open'` can't use an index on the plain column. Index the expression instead.
- A multicolumn index on `(a, b)` helps `WHERE a = ...` and `WHERE a = ... AND b = ...`, but usually not `WHERE b = ...` alone.
- On a tiny table the planner picks `Seq Scan` even when an index exists. That is the right call, not a bug.
- Every index slows down `INSERT`, `UPDATE`, and `DELETE` a little. Index the columns you filter, join, and sort on, not every column.
