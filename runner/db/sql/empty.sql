-- An empty database for the role, for a restore or a part that starts from nothing.
CREATE DATABASE {{db}} OWNER {{role}};
REVOKE ALL ON DATABASE {{db}} FROM PUBLIC;
