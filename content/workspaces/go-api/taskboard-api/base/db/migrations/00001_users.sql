-- Accounts. Emails are stored trimmed and lowercased by the app, and the unique index
-- on lower(email) makes "Ada@Example.com" and "ada@example.com" one account even for
-- rows written some other way.

-- +goose Up
CREATE TABLE users (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         text        NOT NULL,
    name          text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
    password_hash text        NOT NULL,
    role          text        NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- +goose Down
DROP TABLE users;
