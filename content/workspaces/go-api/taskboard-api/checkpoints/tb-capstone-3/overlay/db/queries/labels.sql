-- Labels.

-- name: CreateLabel :one
INSERT INTO labels (project_id, name, color)
VALUES (@project_id, @name, @color)
RETURNING *;

-- ListLabels returns a project's labels by name, each with how many tasks carry it.
-- name: ListLabels :many
SELECT l.id, l.project_id, l.name, l.color, count(tl.task_id) AS task_count
FROM labels l
LEFT JOIN task_labels tl ON tl.label_id = l.id
WHERE l.project_id = @project_id
GROUP BY l.id
ORDER BY l.name, l.id;

-- AddTaskLabel is idempotent: putting a label on a task twice affects no row.
-- name: AddTaskLabel :execrows
INSERT INTO task_labels (task_id, label_id)
VALUES (@task_id, @label_id)
ON CONFLICT DO NOTHING;

-- name: GetLabel :one
SELECT * FROM labels WHERE id = @id;

-- CountTaskLabels counts the labels on a task. Run it after LockTask, inside the same
-- transaction, so two requests cannot both see 4 and both add a fifth.
-- name: CountTaskLabels :one
SELECT count(*) FROM task_labels WHERE task_id = @task_id;

-- LockTask takes the task's row lock until the transaction ends.
-- name: LockTask :one
SELECT id FROM tasks WHERE id = @id FOR UPDATE;

-- name: RemoveTaskLabel :exec
DELETE FROM task_labels WHERE task_id = @task_id AND label_id = @label_id;

-- ListLabelsForTasks loads the labels of a whole page of tasks in one query.
-- name: ListLabelsForTasks :many
SELECT tl.task_id, l.id, l.name, l.color
FROM task_labels tl
JOIN labels l ON l.id = tl.label_id
WHERE tl.task_id = ANY(@task_ids::bigint[])
ORDER BY tl.task_id, l.name, l.id;
