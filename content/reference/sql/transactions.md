# Transactions

A transaction groups statements so they all happen or none do. Without `BEGIN`, every statement is its own transaction and commits as soon as it finishes.

```sql
CREATE TABLE accounts (
    id      integer PRIMARY KEY,
    owner   text NOT NULL,
    balance numeric(10, 2) NOT NULL CHECK (balance >= 0)
);
INSERT INTO accounts VALUES (1, 'Ana', 100), (2, 'Bo', 50);
```

### BEGIN and COMMIT

```sql
BEGIN;
UPDATE accounts SET balance = balance - 30 WHERE id = 1;
UPDATE accounts SET balance = balance + 30 WHERE id = 2;
COMMIT;

SELECT owner, balance FROM accounts ORDER BY id;
-- Ana | 70.00
-- Bo  | 80.00
```

### ROLLBACK: undo everything since BEGIN

```sql
BEGIN;
DELETE FROM accounts;
SELECT count(*) FROM accounts;          -- 0, inside the transaction
ROLLBACK;

SELECT count(*) FROM accounts;          -- 2, the delete never happened
```

### SAVEPOINT: undo part of a transaction

```sql
BEGIN;
UPDATE accounts SET balance = balance + 5 WHERE id = 1;     -- keep this
SAVEPOINT before_bonus;
UPDATE accounts SET balance = balance + 1000 WHERE id = 2;  -- oops
ROLLBACK TO SAVEPOINT before_bonus;
COMMIT;

SELECT owner, balance FROM accounts ORDER BY id;
-- Ana | 75.00
-- Bo  | 80.00
```

### An error aborts the transaction

```sql
BEGIN;
UPDATE accounts SET balance = balance - 500 WHERE id = 1;
-- ERROR:  new row for relation "accounts" violates check constraint "accounts_balance_check"
-- every later statement fails until ROLLBACK:
-- ERROR:  current transaction is aborted, commands ignored until end of transaction block
ROLLBACK;
```

In an app, wrap the steps in `BEGIN` and `COMMIT`, and send `ROLLBACK` from your error handler. In the compiler, the first error stops the program, so the statements after it never run.

### Lock the rows you are about to change

```sql
BEGIN;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;   -- other sessions wait on this row
UPDATE accounts SET balance = balance - 10 WHERE id = 1;
COMMIT;
```

| Statement | Does |
| --- | --- |
| `BEGIN` (or `START TRANSACTION`) | start a transaction |
| `COMMIT` | make every change permanent and visible |
| `ROLLBACK` | throw away every change since `BEGIN` |
| `SAVEPOINT name` | mark a point inside the transaction |
| `ROLLBACK TO SAVEPOINT name` | undo back to the mark, stay in the transaction |
| `RELEASE SAVEPOINT name` | forget the mark, keep the changes |
| `SELECT ... FOR UPDATE` | lock the selected rows until the transaction ends |
| `BEGIN ISOLATION LEVEL SERIALIZABLE` | the strictest isolation, default is `READ COMMITTED` |

### Gotchas

- `COMMIT` with no `BEGIN` does nothing (PostgreSQL only warns). Each earlier statement already committed itself.
- After an error inside `BEGIN`, nothing works until `ROLLBACK` (or `ROLLBACK TO SAVEPOINT`). `COMMIT` on an aborted transaction rolls back instead.
- `CREATE TABLE`, `DROP TABLE`, and `ALTER TABLE` are transactional in Postgres, so a `ROLLBACK` undoes them too. Sequence and identity counters are not rolled back.
- Keep transactions short. Rows you changed stay locked against other writers until you commit.
