-- The size watch's hard stop: the role can't connect to this database again
-- until a reset makes it a new one.
REVOKE CONNECT ON DATABASE {{db}} FROM {{role}};
SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity WHERE datname = '{{db}}';
