-- After the build: the database goes to the superuser and everything in it to
-- pg_database_owner, so in each clone the clone's owner owns it all, with no
-- REASSIGN per clone. The builder role then owns nothing and is dropped.
-- (REASSIGN OWNED also moves the databases a role owns, so a builder that
-- still owned this database would hand it to whichever clone ran first.)
SELECT count(pg_terminate_backend(pid, 2000)) FROM pg_stat_activity WHERE datname = '{{tpl}}' AND pid <> pg_backend_pid();
ALTER DATABASE {{tpl}} OWNER TO postgres;
\connect {{tpl}}
REASSIGN OWNED BY {{tpl}} TO pg_database_owner;
DROP OWNED BY {{tpl}};
\connect postgres
ALTER DATABASE {{tpl}} IS_TEMPLATE true ALLOW_CONNECTIONS false;
DROP ROLE {{tpl}};
