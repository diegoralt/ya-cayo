-- H4: intento estable por cobro (idempotencia propia; pey no ofrece ninguna) y marca de creación en vuelo.
-- Aditiva. Las filas existentes quedan con intento NULL (UNIQUE admite varios NULL). Sin cambios de grants:
-- los de tabla ya cubren las columnas nuevas y anon/authenticated siguen sin acceso.
ALTER TABLE public.ordenes
  ADD COLUMN intento text UNIQUE,
  ADD COLUMN creando_desde bigint; -- no NULL mientras qr_id es NULL: «creando»; el relevo exige que haya pasado el plazo
