-- Hardening follow-up to 20261118000000 (Codex pre-push review, round 3, P2): PostgreSQL grants EXECUTE on every new
-- function to PUBLIC by default, so anon/authenticated still inherited it. That default is global (not per schema):
-- `IN SCHEMA public` cannot remove it, so it is revoked without IN SCHEMA, for functions the migration role creates from now on.
-- Additive and safe: the app defines no functions or RPCs; existing objects are untouched. A future function that needs
-- callers must GRANT EXECUTE explicitly.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
