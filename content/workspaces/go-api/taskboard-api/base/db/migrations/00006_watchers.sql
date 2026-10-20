-- Who watches which task: a many-to-many join table. The composite primary key makes
-- watching twice impossible, and both sides cascade, so a deleted task or user leaves
-- no rows behind.

-- +goose Up
CREATE TABLE task_watchers (
    task_id    bigint      NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, user_id)
);

CREATE INDEX task_watchers_user_id_idx ON task_watchers (user_id);

-- +goose Down
DROP TABLE task_watchers;
