-- Tasks. The database guards what must always hold, whatever code writes the row:
-- the status and priority are known values, a task is done exactly when it has a
-- completed_at, and the assignee is a member of the task's project.

-- +goose Up
CREATE TABLE tasks (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id   bigint      NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    title        text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    description  text        CHECK (char_length(description) <= 2000),
    status       text        NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
    priority     smallint    NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
    due_on       date,
    assignee_id  bigint,
    version      bigint      NOT NULL DEFAULT 1 CHECK (version >= 1),
    completed_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tasks_completed_at_check CHECK ((status = 'done') = (completed_at IS NOT NULL)),
    -- A composite key to project_members, so only a member can be assigned. When a
    -- member leaves, their tasks become unassigned (SET NULL of that column only).
    CONSTRAINT tasks_assignee_id_fkey FOREIGN KEY (project_id, assignee_id)
        REFERENCES project_members (project_id, user_id) ON DELETE SET NULL (assignee_id)
);

-- Serves the board (a project's tasks by status) and due-date filters.
CREATE INDEX tasks_project_status_due_idx ON tasks (project_id, status, due_on);

-- +goose Down
DROP TABLE tasks;
