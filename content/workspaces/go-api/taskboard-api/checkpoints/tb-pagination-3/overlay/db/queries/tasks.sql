-- Tasks.

-- name: GetTask :one
SELECT * FROM tasks WHERE id = @id;

-- ListProjectTasks is the task list: optional filters as sqlc.narg (NULL means "no
-- filter") and a search pattern built by the store.
-- name: ListProjectTasks :many
SELECT * FROM tasks
WHERE project_id = @project_id
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('assignee_id')::bigint IS NULL OR assignee_id = sqlc.narg('assignee_id'))
  AND (NOT @unassigned::boolean OR assignee_id IS NULL)
  AND (sqlc.narg('pattern')::text IS NULL OR title ILIKE sqlc.narg('pattern') OR description ILIKE sqlc.narg('pattern'))
ORDER BY id
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

-- UpdateTask saves a task's fields only if it is still at the version the change was
-- made from. No row back means someone else changed it first (or it is gone).
-- name: UpdateTask :one
UPDATE tasks
SET title = @title,
    description = @description,
    priority = @priority,
    due_on = @due_on,
    assignee_id = @assignee_id,
    version = version + 1,
    updated_at = @updated_at
WHERE id = @id AND version = @version
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
