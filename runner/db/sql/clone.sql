-- A database cloned from a template, owned by its role and closed to every other.
CREATE DATABASE {{db}} TEMPLATE {{tpl}} OWNER {{role}};
REVOKE ALL ON DATABASE {{db}} FROM PUBLIC;
