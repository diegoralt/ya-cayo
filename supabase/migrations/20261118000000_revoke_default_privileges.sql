-- Hardening (buenas-practicas.md S2): Supabase gives anon/authenticated ALL on every new object in `public` by default.
-- The app never uses the Data API (disabled), so future tables/sequences/functions must not be exposed by accident.
-- Additive and safe: it only changes the defaults for objects created from now on by the migration role;
-- existing tables keep the explicit grants (and RLS) set in 20261116000000_initial_schema.sql.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
