-- Labels a project's members put on its tasks: a project's own set of names, and a
-- many-to-many join to tasks, built the way watchers are (00006_watchers.sql).

-- +goose Up
CREATE TABLE labels (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id bigint  NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name       text    NOT NULL CHECK (char_length(name) BETWEEN 1 AND 30),
    color      char(7) NOT NULL DEFAULT '#6b7280' CHECK (color ~ '^#[0-9a-f]{6}$')
);

-- A name is unique within its project in any letter case.
CREATE UNIQUE INDEX labels_project_name_key ON labels (project_id, lower(name));

CREATE TABLE task_labels (
    task_id  bigint NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    label_id bigint NOT NULL REFERENCES labels (id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);

-- Finding the tasks that carry a label (the ?label= filter, a label's task count).
CREATE INDEX task_labels_label_id_idx ON task_labels (label_id);

-- +goose Down
DROP TABLE task_labels;
DROP TABLE labels;
