-- A custom migration (drizzle-kit generate --custom): a rule drizzle-kit cannot express.
-- The trigger is a database-level pre-write hook. Whoever writes to users (the API, a script,
-- psql), PostgreSQL lowercases the email before the row is stored.
CREATE OR REPLACE FUNCTION lowercase_email() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.email := lower(NEW.email);
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER users_lowercase_email
BEFORE INSERT OR UPDATE OF email ON "users"
FOR EACH ROW EXECUTE FUNCTION lowercase_email();--> statement-breakpoint

-- Rows stored before the trigger existed.
UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");
