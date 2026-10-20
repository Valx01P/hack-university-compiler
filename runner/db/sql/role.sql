-- A learner role: a workspace's, a check's, or a run's. Never a superuser, so
-- no COPY ... TO PROGRAM, no untrusted language, no pg_read_file, and no
-- ALTER SYSTEM. temp_file_limit can only be set by a superuser, so the role
-- can't raise it.
CREATE ROLE {{role}} LOGIN PASSWORD '{{password}}' NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 20;
ALTER ROLE {{role}} SET statement_timeout = '30s';
ALTER ROLE {{role}} SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE {{role}} SET temp_file_limit = '256MB';
