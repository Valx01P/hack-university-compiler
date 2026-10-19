# Updating and Deleting

`UPDATE` and `DELETE` change every row their `WHERE` matches, and every row in the table when there is no `WHERE`. Run the `WHERE` as a `SELECT` first when you're unsure.

```sql
CREATE TABLE items (
    id       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name     text NOT NULL,
    category text NOT NULL,
    price    numeric(8, 2) NOT NULL,
    stock    integer NOT NULL DEFAULT 0
);
INSERT INTO items (name, category, price, stock) VALUES
    ('Pen', 'office', 1.50, 100),
    ('Desk', 'furniture', 120.00, 4),
    ('Lamp', 'furniture', 35.00, 0),
    ('Stapler', 'office', 8.00, 12);
```

### UPDATE

```sql harness
CREATE TABLE items (
    id       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name     text NOT NULL,
    category text NOT NULL,
    price    numeric(8, 2) NOT NULL,
    stock    integer NOT NULL DEFAULT 0
);
INSERT INTO items (name, category, price, stock) VALUES
    ('Pen', 'office', 1.50, 100),
    ('Desk', 'furniture', 120.00, 4),
    ('Lamp', 'furniture', 35.00, 0),
    ('Stapler', 'office', 8.00, 12);
{{code}}
SELECT * FROM items ORDER BY id;
```

```sql
UPDATE items SET price = 1.75 WHERE name = 'Pen';                 -- UPDATE 1

UPDATE items
SET price = price * 0.9,
    stock = stock + 10
WHERE category = 'furniture';                                     -- UPDATE 2

UPDATE items SET stock = 0 WHERE id = 999;                        -- UPDATE 0, not an error

UPDATE items SET stock = DEFAULT WHERE name = 'Stapler';
```

### UPDATE ... RETURNING

```sql harness
CREATE TABLE items (
    id       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name     text NOT NULL,
    category text NOT NULL,
    price    numeric(8, 2) NOT NULL,
    stock    integer NOT NULL DEFAULT 0
);
INSERT INTO items (name, category, price, stock) VALUES
    ('Pen', 'office', 1.50, 100),
    ('Desk', 'furniture', 120.00, 4),
    ('Lamp', 'furniture', 35.00, 0),
    ('Stapler', 'office', 8.00, 12);
UPDATE items SET price = price * 0.9, stock = stock + 10 WHERE category = 'furniture';
{{code}}
```

```sql
UPDATE items SET stock = stock - 1
WHERE name = 'Desk'
RETURNING name, old.stock AS before, new.stock AS after;
-- Desk | 14 | 13
```

`old` and `new` in `RETURNING` are new in PostgreSQL 18. Plain column names give the new values.

### UPDATE with values from another table

```sql harness
CREATE TABLE items (
    id       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name     text NOT NULL,
    category text NOT NULL,
    price    numeric(8, 2) NOT NULL,
    stock    integer NOT NULL DEFAULT 0
);
INSERT INTO items (name, category, price, stock) VALUES
    ('Pen', 'office', 1.50, 100),
    ('Desk', 'furniture', 120.00, 4),
    ('Lamp', 'furniture', 35.00, 0),
    ('Stapler', 'office', 8.00, 12);
{{code}}
SELECT * FROM items ORDER BY id;
```

```sql
CREATE TABLE price_changes (item_id integer, new_price numeric(8, 2));
INSERT INTO price_changes VALUES (1, 2.00), (2, 99.00), (4, 9.50);

UPDATE items AS i
SET price = c.new_price
FROM price_changes AS c
WHERE i.id = c.item_id;                                           -- UPDATE 3

UPDATE items                                                      -- or set it from a subquery
SET price = (SELECT max(new_price) FROM price_changes)
WHERE name = 'Lamp';
```

### DELETE

```sql harness
CREATE TABLE items (
    id       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name     text NOT NULL,
    category text NOT NULL,
    price    numeric(8, 2) NOT NULL,
    stock    integer NOT NULL DEFAULT 0
);
INSERT INTO items (name, category, price, stock) VALUES
    ('Pen', 'office', 1.50, 100),
    ('Desk', 'furniture', 120.00, 4),
    ('Lamp', 'furniture', 35.00, 0),
    ('Stapler', 'office', 8.00, 12);
UPDATE items SET price = price * 0.9, stock = stock + 10 WHERE category = 'furniture';
UPDATE items SET stock = DEFAULT WHERE name = 'Stapler';
CREATE TABLE price_changes (item_id integer, new_price numeric(8, 2));
INSERT INTO price_changes VALUES (1, 2.00), (2, 99.00), (4, 9.50);
{{code}}
SELECT * FROM items ORDER BY id;
```

```sql
DELETE FROM items WHERE stock = 0;                                -- DELETE 1, the Stapler

DELETE FROM items
WHERE id IN (SELECT item_id FROM price_changes WHERE new_price < 5)
RETURNING name;                                                   -- Pen

DELETE FROM items AS i                                            -- delete with a join
USING price_changes AS c
WHERE i.id = c.item_id;                                           -- DELETE 1, the Desk
```

### Empty a table

```sql harness
CREATE TABLE items (
    id       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name     text NOT NULL,
    category text NOT NULL,
    price    numeric(8, 2) NOT NULL,
    stock    integer NOT NULL DEFAULT 0
);
INSERT INTO items (name, category, price, stock) VALUES
    ('Pen', 'office', 1.50, 100),
    ('Desk', 'furniture', 120.00, 4),
    ('Lamp', 'furniture', 35.00, 0),
    ('Stapler', 'office', 8.00, 12);
CREATE TABLE price_changes (item_id integer, new_price numeric(8, 2));
INSERT INTO price_changes VALUES (1, 2.00), (2, 99.00), (4, 9.50);
{{code}}
INSERT INTO items (name, category, price) VALUES ('Pen', 'office', 1.50) RETURNING id, name;
```

```sql
DELETE FROM price_changes;                                        -- row by row, can have WHERE
TRUNCATE items RESTART IDENTITY;                                  -- instant, ids start at 1 again
```

| Statement | Does |
| --- | --- |
| `UPDATE t SET a = x WHERE ...` | change matching rows |
| `UPDATE t SET ... FROM u WHERE t.id = u.id` | change rows using another table |
| `DELETE FROM t WHERE ...` | remove matching rows |
| `DELETE FROM t USING u WHERE ...` | remove rows that match another table |
| `TRUNCATE t` | remove all rows fast |
| `TRUNCATE t RESTART IDENTITY CASCADE` | also reset ids and empty tables that reference `t` |
| `... RETURNING *` | print the changed rows |

### Gotchas

- `UPDATE items SET price = 0;` with no `WHERE` changes every row. There is no undo outside a transaction.
- `WHERE col = NULL` matches nothing. Write `WHERE col IS NULL`.
- In `SET`, every right side sees the old row. `SET a = b, b = a` swaps the two columns.
- `TRUNCATE` refuses when another table has a foreign key to it. Add `CASCADE` to empty those too.
