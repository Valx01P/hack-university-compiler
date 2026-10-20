-- Comments.

-- ListComments returns every comment of a task, oldest first.
-- name: ListComments :many
SELECT c.id, c.task_id, c.author_id, u.name AS author_name, c.body, c.created_at
FROM comments c
JOIN users u ON u.id = c.author_id
WHERE c.task_id = @task_id
ORDER BY c.created_at, c.id;

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
