-- Projects and who belongs to them. A project's name is unique among its owner's
-- projects in any letter case, and its members each have a role there.

-- +goose Up
CREATE TABLE projects (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id    bigint      NOT NULL REFERENCES users (id),
    name        text        NOT NULL CHECK (char_length(name) BETWEEN 3 AND 100),
    description text        CHECK (char_length(description) <= 500),
    color       text        NOT NULL DEFAULT '#64748b' CHECK (color ~ '^#[0-9a-f]{6}$'),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX projects_owner_name_key ON projects (owner_id, lower(name));

CREATE TABLE project_members (
    project_id bigint      NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role       text        NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);

-- "My projects" looks members up by user, which the primary key cannot serve.
CREATE INDEX project_members_user_id_idx ON project_members (user_id);

-- +goose Down
DROP TABLE project_members;
DROP TABLE projects;
