-- A reset: new connections are refused, open ones closed, and the database
-- set aside under another name, so the fresh clone doesn't wait for the old
-- files to be deleted (the runner drops it right after).
ALTER DATABASE {{db}} ALLOW_CONNECTIONS false;
SELECT count(pg_terminate_backend(pid, 1000)) FROM pg_stat_activity WHERE datname = '{{db}}';
ALTER DATABASE {{db}} RENAME TO {{old}};
CREATE DATABASE {{db}} TEMPLATE {{tpl}} OWNER {{role}};
REVOKE ALL ON DATABASE {{db}} FROM PUBLIC;
