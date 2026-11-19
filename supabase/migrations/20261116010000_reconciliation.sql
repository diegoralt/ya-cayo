-- H3: event «received» vs «processed», atomic reservations (limites) and durable pending reconciliation.
-- Additive. Same security pattern as the initial schema: RLS on, REVOKE from anon/authenticated,
-- grants and policy only for ya_cayo_app.

ALTER TABLE public.eventos ADD COLUMN procesado_en bigint; -- NULL = received and not yet processed (the retry does process)

-- Atomic reservations and counters with expiry (key = 'conc:<order>'; H5 reuses it: PIN by IP, live quota).
CREATE TABLE public.limites (
  clave text PRIMARY KEY,
  valor bigint NOT NULL DEFAULT 0,
  vence_en bigint NOT NULL
);

-- Orders whose reconciliation started and did not end well (pey down, function cut): picked up on the next access.
CREATE TABLE public.conciliacion_pendiente (
  orden_id bigint PRIMARY KEY REFERENCES public.ordenes(id) ON DELETE CASCADE,
  desde bigint NOT NULL
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['limites','conciliacion_pendiente'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO ya_cayo_app', t);
    EXECUTE format('CREATE POLICY servidor ON public.%I FOR ALL TO ya_cayo_app USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
