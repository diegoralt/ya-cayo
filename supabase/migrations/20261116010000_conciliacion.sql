-- H3: evento «recibido» vs «procesado», reservas atómicas (limites) y conciliación pendiente durable.
-- Aditiva. Mismo patrón de seguridad que el esquema inicial: RLS activo, REVOKE a anon/authenticated,
-- grants y política solo para ya_cayo_app.

ALTER TABLE public.eventos ADD COLUMN procesado_en bigint; -- NULL = recibido y aún no procesado (el reintento sí procesa)

-- Reservas y contadores atómicos con vencimiento (clave = 'conc:<orden>'; H5 reutiliza: PIN por IP, cupo de vivos).
CREATE TABLE public.limites (
  clave text PRIMARY KEY,
  valor bigint NOT NULL DEFAULT 0,
  vence_en bigint NOT NULL
);

-- Órdenes cuya conciliación empezó y no terminó bien (pey caído, función cortada): se retoman en el siguiente acceso.
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
