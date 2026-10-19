# Changing Tables

`ALTER TABLE` changes a table that already has data: add, drop, rename, or retype columns, and add or drop constraints. `DROP` removes a whole object.

```sql
CREATE TABLE contacts (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  text NOT NULL,
    phone integer
);
INSERT INTO contacts (name, phone) VALUES ('Ana', 5551234), ('Bo', NULL);
```

### Columns

```sql harness
CREATE TABLE contacts (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  text NOT NULL,
    phone integer
);
INSERT INTO contacts (name, phone) VALUES ('Ana', 5551234), ('Bo', NULL);
{{code}}
SELECT * FROM contacts ORDER BY id;
```

```sql
ALTER TABLE contacts ADD COLUMN email text;                           -- NULL in old rows
ALTER TABLE contacts ADD COLUMN active boolean NOT NULL DEFAULT true;  -- old rows get true
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email text;             -- NOTICE, no error
ALTER TABLE contacts DROP COLUMN IF EXISTS active;
```

### Change a column

```sql harness
CREATE TABLE contacts (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  text NOT NULL,
    phone integer
);
INSERT INTO contacts (name, phone) VALUES ('Ana', 5551234), ('Bo', NULL);
ALTER TABLE contacts ADD COLUMN email text;
{{code}}
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
WHERE table_name = 'contacts' ORDER BY ordinal_position;
```

```sql
ALTER TABLE contacts ALTER COLUMN phone TYPE text;                    -- int to text: automatic
ALTER TABLE contacts ALTER COLUMN phone TYPE bigint USING phone::bigint;   -- text to int: needs USING
ALTER TABLE contacts ALTER COLUMN email SET DEFAULT 'none';
ALTER TABLE contacts ALTER COLUMN email DROP DEFAULT;
ALTER TABLE contacts ALTER COLUMN name DROP NOT NULL;
ALTER TABLE contacts ALTER COLUMN name SET NOT NULL;
```

### Constraints

```sql harness
CREATE TABLE contacts (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  text NOT NULL,
    phone integer
);
INSERT INTO contacts (name, phone) VALUES ('Ana', 5551234), ('Bo', NULL);
ALTER TABLE contacts ADD COLUMN email text;
{{code}}
SELECT conname, contype FROM pg_constraint
WHERE conrelid = 'contacts'::regclass AND contype <> 'n' ORDER BY conname;
```

```sql
ALTER TABLE contacts ADD CONSTRAINT email_has_at CHECK (email LIKE '%@%');
ALTER TABLE contacts ADD CONSTRAINT contacts_email_key UNIQUE (email);
ALTER TABLE contacts DROP CONSTRAINT email_has_at;
```

### Rename

```sql harness
CREATE TABLE contacts (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  text NOT NULL,
    phone integer
);
INSERT INTO contacts (name, phone) VALUES ('Ana', 5551234), ('Bo', NULL);
ALTER TABLE contacts ADD COLUMN email text;
ALTER TABLE contacts ADD CONSTRAINT contacts_email_key UNIQUE (email);
{{code}}
SELECT * FROM clients ORDER BY id;
```

```sql
ALTER TABLE contacts RENAME COLUMN phone TO phone_number;
ALTER TABLE contacts RENAME TO clients;
ALTER TABLE clients RENAME CONSTRAINT contacts_email_key TO clients_email_key;
```

Several changes can go in one statement, separated by commas:

```sql harness
CREATE TABLE contacts (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  text NOT NULL,
    phone integer
);
INSERT INTO contacts (name, phone) VALUES ('Ana', 5551234), ('Bo', NULL);
ALTER TABLE contacts ADD COLUMN email text;
ALTER TABLE contacts RENAME COLUMN phone TO phone_number;
ALTER TABLE contacts RENAME TO clients;
{{code}}
SELECT * FROM clients ORDER BY id;
```

```sql
ALTER TABLE clients
    ADD COLUMN city text,
    ADD COLUMN country text NOT NULL DEFAULT 'US',
    DROP COLUMN phone_number;
```

### DROP

```sql harness
CREATE TABLE contacts (
    id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name  text NOT NULL,
    phone integer
);
INSERT INTO contacts (name, phone) VALUES ('Ana', 5551234), ('Bo', NULL);
ALTER TABLE contacts RENAME TO clients;
{{code}}
SELECT to_regclass('clients') AS clients, to_regclass('invoices') AS invoices;
```

```sql
CREATE TABLE invoices (id integer PRIMARY KEY, client_id integer REFERENCES clients (id));

DROP TABLE IF EXISTS no_such_table;          -- NOTICE, no error
DROP TABLE clients CASCADE;                  -- also drops the foreign key in invoices
DROP TABLE invoices;
```

| Statement | Does |
| --- | --- |
| `ADD COLUMN c type [DEFAULT x]` | new column, `NULL` or `x` in old rows |
| `DROP COLUMN c` | remove a column and its data |
| `ALTER COLUMN c TYPE t [USING expr]` | change a column's type |
| `ALTER COLUMN c SET DEFAULT x` / `DROP DEFAULT` | change the default |
| `ALTER COLUMN c SET NOT NULL` / `DROP NOT NULL` | require a value or not |
| `ADD CONSTRAINT name ...` / `DROP CONSTRAINT name` | rules |
| `RENAME COLUMN a TO b` / `RENAME TO t2` | rename a column or the table |
| `DROP TABLE t [CASCADE]` | remove the table, `CASCADE` removes what depends on it |
| `DROP VIEW`, `DROP INDEX`, `DROP FUNCTION` | the same for other objects |

### Gotchas

- `DROP TABLE` and `DROP COLUMN` take the data with them. There is no undo outside a transaction.
- `DROP TABLE` fails while a view or foreign key depends on the table. `CASCADE` drops the view and the foreign key constraint, not the other table.
- `ADD COLUMN c type NOT NULL` with no `DEFAULT` fails on a table that has rows.
- `SET NOT NULL`, `ADD CONSTRAINT ... CHECK`, and `TYPE` changes check every existing row and fail if one breaks the rule.
