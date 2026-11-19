// Núcleo de estado sobre Postgres: conciliar registra hechos; solo entregar() cambia a «entregada».
// El esquema vive en supabase/migrations/. Las escrituras de una orden se serializan con SELECT … FOR UPDATE.
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

export const ahora = () => Math.floor(Date.now() / 1000);

// bigint (ids, centavos, segundos Unix) y numeric (SUM/AVG) llegan como Number: caben de sobra en 2^53.
const aNumero = { to: 0, from: [], serialize: String, parse: Number };
const types = { bigint: { ...aNumero, to: 20, from: [20] }, numeric: { ...aNumero, to: 1700, from: [1700] } };

// Con el pooler transaccional de Supabase: prepare:false y pocas conexiones por instancia (max:1 por defecto).
export function abrirDb(url, opts = {}) {
  if (!url) throw new Error('falta la URL de la base de datos');
  return postgres(url, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10, onnotice: () => {}, types, ...opts });
}

// pey: { createQr({amountCents, concept, expiration, numRef}) -> {id}, listQrTransactions(qrId) -> [{id,status,amountCents,currency,datePaid}] }
export async function crearOrden(db, pey, { concepto, montoCentavos, ttl = 360, now = ahora() }) {
  const [{ id }] = await db`INSERT INTO ordenes(concepto, monto_centavos, creada_en, expira_en, token)
    VALUES (${concepto}, ${montoCentavos}, ${now}, ${now + ttl}, ${randomUUID()}) RETURNING id`;
  try {
    const qr = await pey.createQr({ amountCents: montoCentavos, concept: concepto, expiration: ttl, numRef: String(id % 10_000_000) });
    await db`UPDATE ordenes SET qr_id=${String(qr.id)}, qr_string=${qr.qrString ?? null}, qr_image=${qr.qrImage ?? null} WHERE id=${id}`;
    return { id, qr };
  } catch (e) {
    await db`DELETE FROM ordenes WHERE id=${id}`;
    throw e;
  }
}

// Aplica transacciones ya consultadas. Nunca degrada ni reabre una orden; solo añade hechos.
// FOR UPDATE serializa a quien concilie la misma orden desde cualquier conexión; la clasificación sigue la transición ganadora.
export async function aplicarTransacciones(db, ordenId, txs) {
  return db.begin(async (t) => {
    const [o] = await t`SELECT * FROM ordenes WHERE id=${ordenId} FOR UPDATE`;
    if (!o) return { nuevas: [] };
    let estado = o.estado;
    const nuevas = [];
    const pagadas = txs.filter((x) => x.status === 'PAID').sort((a, b) => a.datePaid - b.datePaid);
    for (const x of pagadas) {
      if ((await t`SELECT 1 FROM transacciones WHERE transaction_id=${String(x.id)}`).length) continue;
      let c;
      if (x.amountCents !== o.monto_centavos || x.currency !== 'MXN') c = 'invalida';
      else if (x.datePaid > o.expira_en) c = 'tardio';
      else if (estado === 'pendiente') {
        c = 'valida';
        estado = 'pagada';
        await t`UPDATE ordenes SET estado='pagada', pagada_en=${x.datePaid}, confirmada_en=${ahora()} WHERE id=${ordenId} AND estado='pendiente'`;
      } else c = 'duplicada';
      await t`INSERT INTO transacciones(transaction_id, orden_id, monto_centavos, date_paid, clasificacion)
        VALUES (${String(x.id)}, ${ordenId}, ${x.amountCents}, ${x.datePaid ?? null}, ${c})`;
      nuevas.push({ id: x.id, clasificacion: c });
    }
    return { nuevas };
  });
}

// Consulta a pey (fuera de la transacción) y aplica. Un error de consulta no cambia nada.
export async function conciliar(db, pey, ordenId) {
  const [o] = await db`SELECT qr_id FROM ordenes WHERE id=${ordenId}`;
  if (!o?.qr_id) return { ok: false, error: 'sin_qr' };
  let txs;
  try {
    txs = await pey.listQrTransactions(o.qr_id);
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
  return { ok: true, ...(await aplicarTransacciones(db, ordenId, txs)) };
}

// Única vía a «entregada»: UPDATE condicionado + INSERT en la misma transacción (entregas.orden_id es PK).
export async function entregar(db, ordenId, now = ahora()) {
  return db.begin(async (t) => {
    const r = await t`UPDATE ordenes SET estado='entregada' WHERE id=${ordenId} AND estado='pagada' RETURNING id`;
    if (r.length !== 1) return { ok: false };
    await t`INSERT INTO entregas(orden_id, entregada_en) VALUES (${ordenId}, ${now})`;
    return { ok: true };
  });
}

export async function contarEntregas(db, ordenId) {
  return (await db`SELECT COUNT(*) AS n FROM entregas WHERE orden_id=${ordenId}`)[0].n;
}

export async function vista(db, ordenId, now = ahora()) {
  const [o] = await db`SELECT * FROM ordenes WHERE id=${ordenId}`;
  if (!o) return null;
  const transacciones = await db`SELECT transaction_id, monto_centavos, date_paid, clasificacion FROM transacciones WHERE orden_id=${ordenId}`;
  return {
    ...o,
    vencida: o.estado === 'pendiente' && now > o.expira_en,
    tardio: transacciones.some((t) => t.clasificacion === 'tardio'),
    duplicado: transacciones.some((t) => t.clasificacion === 'duplicada'),
    entregas: await contarEntregas(db, ordenId),
    transacciones: [...transacciones],
  };
}

export async function registrarEvento(db, webhookId, now = ahora()) {
  return (await db`INSERT INTO eventos(webhook_id, recibido_en) VALUES (${webhookId}, ${now}) ON CONFLICT DO NOTHING`).count === 1;
}

// Registro «tarjeta o efectivo»: no cobra, solo mide cuántos aceptan CoDi.
export async function registrarOtroMetodo(db, concepto, montoCentavos, now = ahora()) {
  await db`INSERT INTO registros(concepto, monto_centavos, metodo, creada_en) VALUES (${concepto}, ${montoCentavos}, 'otro', ${now})`;
}

export async function cobrosVivos(db, now = ahora()) {
  return (await db`SELECT COUNT(*) AS n FROM ordenes WHERE estado='pendiente' AND expira_en>=${now} AND qr_id IS NOT NULL`)[0].n;
}

// Métricas «después» que salen del servidor. Clics y cambios de app no se miden aquí (ver docs).
export async function metricas(db, comision = 0.03) {
  const [o] = await db`SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE estado IN ('pagada','entregada')) AS pagadas,
      COUNT(*) FILTER (WHERE estado='entregada') AS entregadas,
      AVG(CASE WHEN pagada_en IS NOT NULL THEN pagada_en - creada_en END) AS seg_cobro,
      AVG(CASE WHEN pagada_en IS NOT NULL THEN confirmada_en - pagada_en END) AS seg_latencia,
      SUM(CASE WHEN estado IN ('pagada','entregada') THEN monto_centavos ELSE 0 END) AS centavos_codi
    FROM ordenes WHERE qr_id IS NOT NULL`;
  const [{ n: otros }] = await db`SELECT COUNT(*) AS n FROM registros WHERE metodo='otro'`;
  const [{ n: maxEntregas }] = await db`SELECT COALESCE(MAX(n),0) AS n FROM (SELECT COUNT(*) AS n FROM entregas GROUP BY orden_id) e`;
  return {
    cobros: o.total, pagadas: o.pagadas, entregadas: o.entregadas,
    segundosCobro: o.seg_cobro, segundosLatencia: o.seg_latencia,
    aceptacionCodi: { codi: o.total, otros },
    maxEntregasPorOrden: maxEntregas,
    comisionEvitadaCentavos: Math.round((o.centavos_codi ?? 0) * comision), // supuesto, no medido
  };
}
