-- Attachments.

-- name: CreateAttachment :one
INSERT INTO attachments (task_id, stored_name, original_name, content_type, size_bytes, created_at)
VALUES (@task_id, @stored_name, @original_name, @content_type, @size_bytes, @created_at)
RETURNING *;

-- GetAttachment also returns the task's project, which decides who may download it.
-- name: GetAttachment :one
SELECT a.*, t.project_id
FROM attachments a
JOIN tasks t ON t.id = a.task_id
WHERE a.id = @id;

-- name: ListAttachmentNames :many
SELECT stored_name FROM attachments WHERE task_id = @task_id ORDER BY id;
