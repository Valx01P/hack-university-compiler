-- Once, in template1, so every database the runner makes has the view that
-- query-count checks read (hu_stats.pg_stat_statements). Its own schema keeps
-- it out of a learner's public schema and dumps.
CREATE SCHEMA IF NOT EXISTS hu_stats;
GRANT USAGE ON SCHEMA hu_stats TO PUBLIC;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA hu_stats;
