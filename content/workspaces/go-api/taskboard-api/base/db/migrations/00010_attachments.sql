-- Files uploaded to tasks. The bytes live in the upload folder under stored_name, a
-- random name, and original_name is only ever shown, never used as a path.

-- +goose Up
CREATE TABLE attachments (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id       bigint      NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    stored_name   text        NOT NULL UNIQUE,
    original_name text        NOT NULL,
    content_type  text        NOT NULL,
    size_bytes    bigint      NOT NULL CHECK (size_bytes >= 0),
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX attachments_task_id_idx ON attachments (task_id);

-- +goose Down
DROP TABLE attachments;
