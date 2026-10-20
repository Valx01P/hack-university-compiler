-- A table to experiment with. Load it with:
--
--   psql "$DATABASE_URL" -f scratch.sql
--
-- Loading it again starts it over. Then try GET /notes, or psql "$DATABASE_URL" and
-- SELECT * FROM notes;

DROP TABLE IF EXISTS notes;

CREATE TABLE notes (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title      text        NOT NULL CHECK (title <> ''),
    done       boolean     NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO notes (title, done, created_at) VALUES
    ('Read the Go 1.27 release notes', true, '2026-09-01T09:00:00Z'),
    ('Try range over a function', false, '2026-09-02T17:30:00Z'),
    ('Write a table test', false, '2026-09-03T08:15:00Z');
