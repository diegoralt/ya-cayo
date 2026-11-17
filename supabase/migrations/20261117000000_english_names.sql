-- Rename the Spanish schema names to English (project convention: technical names in English).
-- Pure rename plus enum-like value translation; no data is lost. Grants, RLS and policies follow the renamed
-- objects (they bind to the table/sequence OID), so the security model is unchanged.
-- Dictionary (old -> new). Tables: ordenes->orders, transacciones->transactions, registros->records,
--   eventos->events, entregas->deliveries, limites->limits, conciliacion_pendiente->pending_reconciliation.
-- Columns: concepto->concept, monto_centavos->amount_cents, pagada_en->paid_at, confirmada_en->confirmed_at,
--   creada_en->created_at, expira_en->expires_at, estado->status, intento->attempt, creando_desde->creating_since,
--   orden_id->order_id, clasificacion->classification, metodo->method, recibido_en->received_at,
--   procesado_en->processed_at, entregada_en->delivered_at, clave->key, valor->value, vence_en->expires_at,
--   desde->since.
-- Values: pendiente/pagada/entregada->pending/paid/delivered; valida/tardio/duplicada/invalida->valid/late/duplicate/invalid;
--   otro->other. Constraint and index names keep their old prefixes (cosmetic only).

ALTER TABLE public.ordenes RENAME TO orders;
ALTER TABLE public.transacciones RENAME TO transactions;
ALTER TABLE public.registros RENAME TO records;
ALTER TABLE public.eventos RENAME TO events;
ALTER TABLE public.entregas RENAME TO deliveries;
ALTER TABLE public.limites RENAME TO limits;
ALTER TABLE public.conciliacion_pendiente RENAME TO pending_reconciliation;

ALTER SEQUENCE public.ordenes_id_seq RENAME TO orders_id_seq;
ALTER SEQUENCE public.registros_id_seq RENAME TO records_id_seq;

ALTER TABLE public.orders RENAME COLUMN concepto TO concept;
ALTER TABLE public.orders RENAME COLUMN monto_centavos TO amount_cents;
ALTER TABLE public.orders RENAME COLUMN pagada_en TO paid_at;
ALTER TABLE public.orders RENAME COLUMN confirmada_en TO confirmed_at;
ALTER TABLE public.orders RENAME COLUMN creada_en TO created_at;
ALTER TABLE public.orders RENAME COLUMN expira_en TO expires_at;
ALTER TABLE public.orders RENAME COLUMN estado TO status;
ALTER TABLE public.orders RENAME COLUMN intento TO attempt;
ALTER TABLE public.orders RENAME COLUMN creando_desde TO creating_since;

ALTER TABLE public.transactions RENAME COLUMN orden_id TO order_id;
ALTER TABLE public.transactions RENAME COLUMN monto_centavos TO amount_cents;
ALTER TABLE public.transactions RENAME COLUMN clasificacion TO classification;

ALTER TABLE public.records RENAME COLUMN concepto TO concept;
ALTER TABLE public.records RENAME COLUMN monto_centavos TO amount_cents;
ALTER TABLE public.records RENAME COLUMN metodo TO method;
ALTER TABLE public.records RENAME COLUMN creada_en TO created_at;

ALTER TABLE public.events RENAME COLUMN recibido_en TO received_at;
ALTER TABLE public.events RENAME COLUMN procesado_en TO processed_at;

ALTER TABLE public.deliveries RENAME COLUMN orden_id TO order_id;
ALTER TABLE public.deliveries RENAME COLUMN entregada_en TO delivered_at;

ALTER TABLE public.limits RENAME COLUMN clave TO key;
ALTER TABLE public.limits RENAME COLUMN valor TO value;
ALTER TABLE public.limits RENAME COLUMN vence_en TO expires_at;

ALTER TABLE public.pending_reconciliation RENAME COLUMN orden_id TO order_id;
ALTER TABLE public.pending_reconciliation RENAME COLUMN desde TO since;

-- Enum-like values: swap the CHECK, translate the rows, add the new CHECK.
ALTER TABLE public.orders DROP CONSTRAINT ordenes_estado_check;
UPDATE public.orders SET status = CASE status WHEN 'pendiente' THEN 'pending' WHEN 'pagada' THEN 'paid' ELSE 'delivered' END;
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending','paid','delivered'));

ALTER TABLE public.transactions DROP CONSTRAINT transacciones_clasificacion_check;
UPDATE public.transactions SET classification = CASE classification
  WHEN 'valida' THEN 'valid' WHEN 'tardio' THEN 'late' WHEN 'duplicada' THEN 'duplicate' ELSE 'invalid' END;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_classification_check
  CHECK (classification IN ('valid','late','duplicate','invalid'));

UPDATE public.records SET method = 'other' WHERE method = 'otro';

-- Policy name (cosmetic): servidor -> server.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders','transactions','records','events','deliveries','limits','pending_reconciliation'] LOOP
    EXECUTE format('ALTER POLICY servidor ON public.%I RENAME TO server', t);
  END LOOP;
END $$;
