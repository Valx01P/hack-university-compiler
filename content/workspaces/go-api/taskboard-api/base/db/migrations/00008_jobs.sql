-- The job queue. A job is queued, then running while a worker has it, and ends
-- completed, or dead after max_attempts failures (last_error says why).

-- +goose Up
CREATE TABLE jobs (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind         text        NOT NULL,
    payload      jsonb       NOT NULL DEFAULT '{}',
    status       text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'dead')),
    run_at       timestamptz NOT NULL DEFAULT now(),
    attempts     integer     NOT NULL DEFAULT 0,
    max_attempts integer     NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
    last_error   text,
    locked_at    timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- Workers only ever look for queued jobs that are due. A partial index holds just
-- those rows, so it stays small however many completed jobs pile up.
CREATE INDEX jobs_claim_idx ON jobs (run_at, id) WHERE status = 'queued';

-- +goose Down
DROP TABLE jobs;
