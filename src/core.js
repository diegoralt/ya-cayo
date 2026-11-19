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

export const PLAZO_CREANDO = 30; // s: un intento sin qr_id más viejo que esto se da por atascado (pey tarda ≤15 s por llamada)
const qrDe = (o) => ({ id: o.qr_id, qrString: o.qr_string, qrImage: o.qr_image });

// Idempotencia propia (pey no la ofrece: experimento-pey.md). `intento` lo genera el cliente y es único en la BD.
// Solo quien gana el INSERT (o el relevo de un intento atascado) llama a pey; un QR cuya respuesta se perdió es
// inalcanzable (nadie lo vio ni se puede consultar), así que recrear es seguro. El guardado es «gana el primero».
// pey: { createQr({amountCents, concept, expiration, numRef, metadata}) -> {id,qrString,qrImage}, listQrTransactions(qrId) -> [{id,status,amountCents,currency,datePaid}] }
// Devuelve { id, qr } (nuevo o ya existente: reutilizada) o { id, creando: true } si otro lo está creando.
export async function crearOrden(db, pey, { concepto, montoCentavos, ttl = 360, now = ahora(), intento = randomUUID(), maxVivos }) {
  let id, c = concepto, m = montoCentavos;
  // Con cupo, cuenta + alta + relevo van bajo la fila 'cupo' de limites (todo lo que deja un cobro vivo se serializa).
  // Un intento exento ya ocupa cupo (vivo, contado en cobrosVivos) o ya tiene QR; uno vencido y atascado lo reclama como nuevo.
  const paso = async (q) => {
    if (maxVivos) {
      await q`INSERT INTO limites(clave, valor, vence_en) VALUES ('cupo', 0, 0) ON CONFLICT (clave) DO UPDATE SET valor=limites.valor`;
      const exento = (await q`SELECT 1 FROM ordenes WHERE intento=${intento} AND (qr_id IS NOT NULL OR (estado='pendiente' AND expira_en>=${now}))`).length;
      if (!exento && (await cobrosVivos(q, now)) >= maxVivos) return { lleno: true };
    }
    const [n] = await q`INSERT INTO ordenes(concepto, monto_centavos, creada_en, expira_en, token, intento, creando_desde)
      VALUES (${c}, ${m}, ${now}, ${now + ttl}, ${randomUUID()}, ${intento}, ${now}) ON CONFLICT (intento) DO NOTHING RETURNING id`;
    if (n) return { id: n.id };
    const [o] = await q`SELECT id, concepto, monto_centavos, qr_id, qr_string, qr_image FROM ordenes WHERE intento=${intento}`;
    if (!o) return { reintentar: true }; // la borró un error de pey entre medias
    if (o.qr_id) return { existente: o };
    const [r] = await q`UPDATE ordenes SET creando_desde=${now}, expira_en=${now + ttl}
      WHERE id=${o.id} AND qr_id IS NULL AND creando_desde <= ${now - PLAZO_CREANDO} RETURNING id`;
    return r ? { id: o.id, relevo: o } : { id: o.id, creando: true }; // creando: otro la está creando (o ya la tomó el relevo)
  };
  const x = await (maxVivos ? db.begin(paso) : paso(db));
  if (x.lleno) return { lleno: true };
  if (x.reintentar) return crearOrden(db, pey, { concepto, montoCentavos, ttl, now, intento, maxVivos });
  if (x.existente) return { id: x.existente.id, qr: qrDe(x.existente), reutilizada: true };
  if (x.creando) return { id: x.id, creando: true };
  id = x.id;
  if (x.relevo) { c = x.relevo.concepto; m = x.relevo.monto_centavos; } // el relevo usa lo guardado, no lo que mande el reintento
  let qr;
  try {
    qr = await pey.createQr({ amountCents: m, concept: c, expiration: ttl, numRef: String(id % 10_000_000), metadata: { intento } });
  } catch (e) {
    await db`DELETE FROM ordenes WHERE id=${id} AND qr_id IS NULL AND creando_desde=${now}`;
    throw e;
  }
  const [g] = await db`UPDATE ordenes SET qr_id=${String(qr.id)}, qr_string=${qr.qrString ?? null}, qr_image=${qr.qrImage ?? null}, creando_desde=NULL
    WHERE id=${id} AND qr_id IS NULL AND creando_desde=${now} RETURNING id`; // creando_desde=now: si otro relevó, este QR ya no es el vigente (su expira_en no coincidiría)
  if (g) return { id, qr };
  const [o] = await db`SELECT qr_id, qr_string, qr_image FROM ordenes WHERE id=${id}`; // otro guardó antes: se descarta el nuestro
  if (!o) throw new Error('la orden desapareció durante la creación');
  if (!o.qr_id) return { id, creando: true }; // relevada y aún sin guardar: el relevo la termina
  return { id, qr: qrDe(o), reutilizada: true };
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

// Evento «recibido» (idempotente por webhook_id) vs «procesado»: un fallo deja procesado_en NULL y el reintento sí procesa.
export async function registrarEvento(db, webhookId, now = ahora()) {
  return (await db`INSERT INTO eventos(webhook_id, recibido_en) VALUES (${webhookId}, ${now}) ON CONFLICT DO NOTHING`).count === 1;
}
export async function eventoProcesado(db, webhookId) {
  return (await db`SELECT procesado_en FROM eventos WHERE webhook_id=${webhookId}`)[0]?.procesado_en != null;
}
export async function marcarProcesado(db, webhookId, now = ahora()) {
  await db`UPDATE eventos SET procesado_en=${now} WHERE webhook_id=${webhookId} AND procesado_en IS NULL`;
}

// PIN por IP: n intentos por ventana en limites. Un solo upsert atómico; devuelve cuántos van (este incluido) y cuándo vence la ventana.
export async function contarFallo(db, ip, ventana, now = ahora()) {
  const [r] = await db`INSERT INTO limites(clave, valor, vence_en) VALUES (${`pin:${ip}`}, 1, ${now + ventana})
    ON CONFLICT (clave) DO UPDATE SET valor = CASE WHEN limites.vence_en <= ${now} THEN 1 ELSE limites.valor + 1 END,
      vence_en = CASE WHEN limites.vence_en <= ${now} THEN ${now + ventana} ELSE limites.vence_en END
    RETURNING valor, vence_en`;
  return { n: Number(r.valor), hasta: Number(r.vence_en) };
}
// Se reserva el intento ANTES de verificar el PIN (así las ráfagas no pasan todas bajo el tope); si el PIN era bueno, se devuelve.
export async function devolverIntento(db, ip, hasta) {
  await db`UPDATE limites SET valor = GREATEST(valor - 1, 0) WHERE clave=${`pin:${ip}`} AND vence_en=${hasta}`; // solo la ventana que emitió la reserva
}

// Reserva atómica con vencimiento: true solo para quien la toma (la fila bloquea a los demás hasta `vence_en`).
export async function reservar(db, clave, ttl, now = ahora()) {
  return (await db`INSERT INTO limites(clave, valor, vence_en) VALUES (${clave}, 1, ${now + ttl})
    ON CONFLICT (clave) DO UPDATE SET valor=1, vence_en=${now + ttl} WHERE limites.vence_en <= ${now} RETURNING 1`).length === 1;
}

// Registro «tarjeta o efectivo»: no cobra, solo mide cuántos aceptan CoDi.
export async function registrarOtroMetodo(db, concepto, montoCentavos, now = ahora()) {
  await db`INSERT INTO registros(concepto, monto_centavos, metodo, creada_en) VALUES (${concepto}, ${montoCentavos}, 'otro', ${now})`;
}

export async function cobrosVivos(db, now = ahora()) {
  return (await db`SELECT COUNT(*) AS n FROM ordenes WHERE estado='pendiente' AND expira_en>=${now}`)[0].n // incluye los que están «creando»;
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
