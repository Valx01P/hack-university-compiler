-- Watchers, the many-to-many feature the capstone's labels copy.

-- AddWatcher is idempotent: watching twice changes nothing and affects no row.
-- name: AddWatcher :execrows
INSERT INTO task_watchers (task_id, user_id, created_at)
VALUES (@task_id, @user_id, @created_at)
ON CONFLICT DO NOTHING;

-- name: RemoveWatcher :exec
DELETE FROM task_watchers WHERE task_id = @task_id AND user_id = @user_id;

-- name: ListWatchers :many
SELECT u.id, u.name
FROM task_watchers w
JOIN users u ON u.id = w.user_id
WHERE w.task_id = @task_id
ORDER BY u.id;

-- ListWatchersForTasks loads the watchers of a whole page of tasks at once, so the
-- task list does not run one query per task (the N+1 problem).
-- name: ListWatchersForTasks :many
SELECT w.task_id, u.id, u.name
FROM task_watchers w
JOIN users u ON u.id = w.user_id
WHERE w.task_id = ANY(@task_ids::bigint[])
ORDER BY w.task_id, u.id;
