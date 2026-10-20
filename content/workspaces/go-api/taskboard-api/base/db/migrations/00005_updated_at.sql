-- The database-level hook. Every UPDATE of a task row passes through set_updated_at,
-- whoever runs it. The API bumps version and sets updated_at from its own clock, so
-- this leaves those values alone. Any other UPDATE (psql, a script, a backfill) gets a
-- new version and updated_at = now() from here, so ETags stay honest and updated_at is
-- never stale.

-- +goose Up
-- +goose StatementBegin
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.version IS NOT DISTINCT FROM OLD.version THEN
        NEW.version := OLD.version + 1;
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END;
$$;
-- +goose StatementEnd

CREATE TRIGGER tasks_set_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- +goose Down
DROP TRIGGER tasks_set_updated_at ON tasks;
DROP FUNCTION set_updated_at();
