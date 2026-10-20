-- What the job handlers write instead of sending email: one row per message to a user.

-- +goose Up
CREATE TABLE notifications (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind       text        NOT NULL,
    payload    jsonb       NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at    timestamptz
);

CREATE INDEX notifications_user_unread_idx ON notifications (user_id, created_at) WHERE read_at IS NULL;

-- +goose Down
DROP TABLE notifications;
