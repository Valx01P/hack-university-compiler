# Views

A view is a saved `SELECT` you query like a table. It stores no rows: every read runs the query again. A materialized view stores the result and only changes when you refresh it. Examples use the sample tables.

### Create and query

```sql
CREATE VIEW engineers AS
SELECT id, name, salary, hired_on
FROM employees
WHERE department_id = 1;

SELECT name, salary FROM engineers WHERE salary > 140000 ORDER BY name;
-- Ada Lovelace      | 185000
-- Grace Hopper      | 160000
-- Margaret Hamilton | 145000
```

### Change and drop

```sql
CREATE OR REPLACE VIEW engineers AS
SELECT id, name, salary, hired_on, salary / 12 AS monthly   -- may add columns at the end
FROM employees
WHERE department_id = 1;

ALTER VIEW engineers RENAME TO engineering_team;
DROP VIEW IF EXISTS engineering_team;
```

### Views over joins and aggregates

```sql
CREATE VIEW dept_stats AS
SELECT d.name AS department,
       count(e.id) AS headcount,
       round(avg(e.salary)) AS avg_salary
FROM departments AS d
LEFT JOIN employees AS e ON e.department_id = d.id
GROUP BY d.id;

SELECT * FROM dept_stats ORDER BY headcount DESC, department LIMIT 3;
-- Engineering | 5 | 150000
-- Research    | 3 | 143000
-- Sales       | 3 | 116667
```

### Updatable views

A view over one table, with no `GROUP BY`, `DISTINCT`, or aggregates, takes `INSERT`, `UPDATE`, and `DELETE` and passes them to the table.

```sql
CREATE VIEW support_staff AS
SELECT id, name, department_id, salary
FROM employees
WHERE department_id = 4
WITH CHECK OPTION;                              -- reject rows the view couldn't see

UPDATE support_staff SET salary = salary + 1000 WHERE name = 'Annie Easley';   -- UPDATE 1
-- UPDATE support_staff SET department_id = 2 WHERE name = 'Annie Easley';
-- ERROR:  new row violates check option for view "support_staff"
```

### Materialized views

```sql
CREATE MATERIALIZED VIEW payroll AS
SELECT department_id, sum(salary) AS total
FROM employees
GROUP BY department_id;

UPDATE employees SET salary = salary + 10000 WHERE id = 1;
SELECT total FROM payroll WHERE department_id = 1;    -- 750000, stale

REFRESH MATERIALIZED VIEW payroll;
SELECT total FROM payroll WHERE department_id = 1;    -- 760000

CREATE INDEX ON payroll (department_id);              -- can be indexed like a table
DROP MATERIALIZED VIEW payroll;
```

| | `VIEW` | `MATERIALIZED VIEW` |
| --- | --- | --- |
| Stores rows | no | yes |
| Always current | yes | only after `REFRESH` |
| Speed | as fast as its query | as fast as reading a table |
| Indexes | no | yes |

### Gotchas

- `CREATE OR REPLACE VIEW` can only add columns at the end. Renaming, removing, or retyping a column needs `DROP VIEW` then `CREATE VIEW`.
- `SELECT *` in a view is expanded when the view is created. Columns added to the table later don't show up.
- A table with views on it can't be dropped without `DROP TABLE ... CASCADE`, which drops the views too.
- `REFRESH MATERIALIZED VIEW CONCURRENTLY` keeps the old rows readable during a refresh, but needs a unique index on the view.
