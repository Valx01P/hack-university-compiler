-- A template database starts empty, owned by a builder role of its own that
-- the build (migrations, then seed) connects as. Not a superuser.
CREATE ROLE {{tpl}} LOGIN PASSWORD '{{password}}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 10;
ALTER ROLE {{tpl}} SET statement_timeout = '120s';
CREATE DATABASE {{tpl}} OWNER {{tpl}};
REVOKE ALL ON DATABASE {{tpl}} FROM PUBLIC;
