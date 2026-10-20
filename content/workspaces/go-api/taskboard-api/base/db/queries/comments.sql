-- Comments.

-- ListComments is keyset pagination: the page starts after the cursor's
-- (created_at, id), which comments_task_created_idx finds directly, however deep the
-- page. OFFSET would read and throw away every earlier comment.
-- name: ListComments :many
SELECT c.id, c.task_id, c.author_id, u.name AS author_name, c.body, c.created_at
FROM comments c
JOIN users u ON u.id = c.author_id
WHERE c.task_id = @task_id
  AND (sqlc.narg('after_created_at')::timestamptz IS NULL
       OR (c.created_at, c.id) > (sqlc.narg('after_created_at')::timestamptz, sqlc.narg('after_id')::bigint))
ORDER BY c.created_at, c.id
LIMIT @row_limit;

-- name: GetComment :one
SELECT c.id, c.task_id, c.author_id, u.name AS author_name, c.body, c.created_at
FROM comments c
JOIN users u ON u.id = c.author_id
WHERE c.id = @id;

-- name: CreateComment :one
WITH inserted AS (
    INSERT INTO comments (task_id, author_id, body, created_at)
    VALUES (@task_id, @author_id, @body, @created_at)
    RETURNING *
)
SELECT inserted.id, inserted.task_id, inserted.author_id, u.name AS author_name, inserted.body, inserted.created_at
FROM inserted
JOIN users u ON u.id = inserted.author_id;

-- name: DeleteComment :execrows
DELETE FROM comments WHERE id = @id;
