-- H4: stable attempt per charge (own idempotency; pey offers none) and an in-flight creation marker.
-- Additive. Existing rows get attempt NULL (UNIQUE allows several NULLs). No grant changes:
-- the table grants already cover the new columns and anon/authenticated still have no access.
ALTER TABLE public.ordenes
  ADD COLUMN intento text UNIQUE,
  ADD COLUMN creando_desde bigint; -- not NULL while qr_id is NULL: «creating»; the takeover requires the timeout to have passed
