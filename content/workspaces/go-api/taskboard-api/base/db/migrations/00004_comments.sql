-- Comments on tasks. They go away with their task.

-- +goose Up
CREATE TABLE comments (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id    bigint      NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    author_id  bigint      NOT NULL REFERENCES users (id),
    body       text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- The keyset query reads a task's comments in (created_at, id) order after a cursor,
-- which this index answers without sorting.
CREATE INDEX comments_task_created_idx ON comments (task_id, created_at, id);

-- +goose Down
DROP TABLE comments;
