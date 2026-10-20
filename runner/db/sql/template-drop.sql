-- A template that is gone from content, or a build that failed halfway.
ALTER DATABASE {{tpl}} IS_TEMPLATE false;
DROP DATABASE {{tpl}} WITH (FORCE);
