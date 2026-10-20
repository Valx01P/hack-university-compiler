-- Once per server start, as the superuser in the postgres database. Learner
-- roles reach only the databases they own: the maintenance databases are
-- closed to them too.
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
