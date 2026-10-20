-- Login sessions. Only the SHA-256 of a token is stored, never the token itself.

-- +goose Up
CREATE TABLE sessions (
    token_hash bytea       PRIMARY KEY CHECK (octet_length(token_hash) = 32),
    user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- +goose Down
DROP TABLE sessions;
