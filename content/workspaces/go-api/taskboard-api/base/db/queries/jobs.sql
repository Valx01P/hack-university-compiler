-- The job queue, and the notifications job handlers write.

-- name: EnqueueJob :exec
INSERT INTO jobs (kind, payload, run_at, created_at)
VALUES (@kind, @payload, @run_at, @run_at);

-- ClaimJobs hands each due job to exactly one worker. FOR UPDATE locks the rows it
-- picks, and SKIP LOCKED makes other workers pass over them instead of waiting, so
-- many workers can claim at once without taking the same job.
-- name: ClaimJobs :many
UPDATE jobs
SET status = 'running', locked_at = @now::timestamptz, attempts = attempts + 1
WHERE id IN (
    SELECT id FROM jobs
    WHERE status = 'queued' AND run_at <= @now::timestamptz
    ORDER BY run_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT @max_jobs
)
RETURNING *;

-- name: CompleteJob :exec
UPDATE jobs SET status = 'completed', locked_at = NULL, last_error = NULL WHERE id = @id;

-- name: RetryJob :exec
UPDATE jobs SET status = 'queued', run_at = @run_at, locked_at = NULL, last_error = @last_error::text WHERE id = @id;

-- name: KillJob :exec
UPDATE jobs SET status = 'dead', locked_at = NULL, last_error = @last_error::text WHERE id = @id;

-- name: CreateNotification :exec
INSERT INTO notifications (user_id, kind, payload, created_at)
VALUES (@user_id, @kind, @payload, @created_at);
