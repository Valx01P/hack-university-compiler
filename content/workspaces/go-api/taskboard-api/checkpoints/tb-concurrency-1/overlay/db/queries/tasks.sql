-- Tasks.

-- name: GetTask :one
SELECT * FROM tasks WHERE id = @id;

-- ListProjectTasks is the task list: optional filters as sqlc.narg (NULL means "no
-- filter"), a search pattern built by the store, and a sort key from an allow-list
-- (created, due, priority, or title) that picks a CASE branch, so no request text
-- ever becomes SQL. Ties break by id, so pages never overlap.
-- name: ListProjectTasks :many
SELECT * FROM tasks
WHERE project_id = @project_id
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('assignee_id')::bigint IS NULL OR assignee_id = sqlc.narg('assignee_id'))
  AND (NOT @unassigned::boolean OR assignee_id IS NULL)
  AND (sqlc.narg('pattern')::text IS NULL OR title ILIKE sqlc.narg('pattern') OR description ILIKE sqlc.narg('pattern'))
ORDER BY
  CASE WHEN @sort::text = 'due'      AND NOT @descending::boolean THEN due_on END ASC NULLS LAST,
  CASE WHEN @sort::text = 'due'      AND @descending::boolean     THEN due_on END DESC NULLS LAST,
  CASE WHEN @sort::text = 'priority' AND NOT @descending::boolean THEN priority END ASC,
  CASE WHEN @sort::text = 'priority' AND @descending::boolean     THEN priority END DESC,
  CASE WHEN @sort::text = 'title'    AND NOT @descending::boolean THEN lower(title) END ASC,
  CASE WHEN @sort::text = 'title'    AND @descending::boolean     THEN lower(title) END DESC,
  CASE WHEN @sort::text = 'created'  AND NOT @descending::boolean THEN created_at END ASC,
  CASE WHEN @sort::text = 'created'  AND @descending::boolean     THEN created_at END DESC,
  id
LIMIT @row_limit OFFSET @row_offset;

-- CountProjectTasks counts what ListProjectTasks would return without LIMIT and
-- OFFSET: the list's total.
-- name: CountProjectTasks :one
SELECT count(*) FROM tasks
WHERE project_id = @project_id
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('assignee_id')::bigint IS NULL OR assignee_id = sqlc.narg('assignee_id'))
  AND (NOT @unassigned::boolean OR assignee_id IS NULL)
  AND (sqlc.narg('pattern')::text IS NULL OR title ILIKE sqlc.narg('pattern') OR description ILIKE sqlc.narg('pattern'));

-- name: CountTasksByStatus :many
SELECT status, count(*) AS count
FROM tasks
WHERE project_id = @project_id
GROUP BY status
ORDER BY status;

-- name: CreateTask :one
INSERT INTO tasks (project_id, title, description, status, priority, due_on, assignee_id,
                   version, completed_at, created_at, updated_at)
VALUES (@project_id, @title, @description, @status, @priority, @due_on, @assignee_id,
        @version, @completed_at, @created_at, @updated_at)
RETURNING *;

-- UpdateTask saves a task's fields and moves it to its next version.
-- name: UpdateTask :one
UPDATE tasks
SET title = @title,
    description = @description,
    priority = @priority,
    due_on = @due_on,
    assignee_id = @assignee_id,
    version = version + 1,
    updated_at = @updated_at
WHERE id = @id
RETURNING *;

-- name: TransitionTask :one
UPDATE tasks
SET status = @status,
    completed_at = @completed_at,
    version = version + 1,
    updated_at = @updated_at
WHERE id = @id AND version = @version
RETURNING *;

-- name: DeleteTask :execrows
DELETE FROM tasks WHERE id = @id;
