// Webhook firmado y conciliación al consultar. El webhook solo DISPARA la conciliación; nunca marca pagado.
// Sin proceso de fondo (Vercel): el respaldo del webhook ocurre cuando alguien consulta (listado de caja, página del pagador).
import sw from 'standardwebhooks';
import { ahora, conciliar, registrarEvento, eventoProcesado, marcarProcesado, reservar } from './core.js';
const { Webhook } = sw;

export const VENTANA_POST = 1800; // 30 min tras vencer para descubrir pagos tardíos o segundos pagos
export const MAX_POR_CONSULTA = 5; // órdenes que una sola consulta puede conciliar; el resto toca en la siguiente
export const ARRENDAMIENTO = 30; // reserva mientras el intento corre: cubre el peor caso de pey, para que otra consulta no se solape
export const REINTENTO = 5; // si el intento falla, la reserva se acorta a esto; un proceso cortado retiene el arrendamiento completo
export const PRESUPUESTO_MS = 8000; // tope de espera por consulta; lo que no termine queda «pendiente» y se retoma

// Conciliar dejando rastro durable: «pendiente» desde antes de llamar a pey hasta que termina bien.
export async function conciliarMarcando(db, pey, ordenId, now = ahora()) {
  await db`INSERT INTO conciliacion_pendiente(orden_id, desde) VALUES (${ordenId}, ${now}) ON CONFLICT DO NOTHING`;
  const r = await conciliar(db, pey, ordenId);
  if (r.ok) await db`DELETE FROM conciliacion_pendiente WHERE orden_id=${ordenId}`;
  return r;
}

// Devuelve el código HTTP. Firma ausente/incorrecta/alterada => 401 sin tocar la base.
export async function manejarWebhook({ db, pey, secret }, cuerpoCrudo, cabeceras) {
  let ev;
  try {
    ev = new Webhook(secret).verify(cuerpoCrudo, {
      'webhook-id': cabeceras['webhook-id'] ?? '',
      'webhook-timestamp': cabeceras['webhook-timestamp'] ?? '',
      'webhook-signature': cabeceras['webhook-signature'] ?? '',
    });
  } catch {
    return 401;
  }
  const id = cabeceras['webhook-id'];
  await registrarEvento(db, id); // «recibido»
  if (await eventoProcesado(db, id)) return 200; // reenvío de algo ya resuelto
  // ponytail: el evento puede traer los campos en `data` o en la raíz; confirmar con un pago real.
  const d = ev?.data ?? ev ?? {};
  const qrId = d.codiQrId;
  if (ev?.type !== 'codi.qr.payment_received' || qrId == null) { await marcarProcesado(db, id); return 200; } // evento ajeno: firmado y ya
  let [o] = await db`SELECT id FROM ordenes WHERE qr_id=${String(qrId)}`;
  if (!o) {
    // Sin orden con ese QR: la correlación es nuestra, por metadata.intento (pey la devuelve en el evento).
    let md = d.metadata; if (typeof md === 'string') { try { md = JSON.parse(md); } catch { md = null; } }
    const intento = md?.intento;
    if (!intento) return 200; // sin orden (aún): queda recibido sin procesar; la conciliación al consultar lo cubre
    const [p] = await db`SELECT id, qr_id FROM ordenes WHERE intento=${String(intento)}`;
    if (!p) return 200;
    if (p.qr_id == null) {
      // función cortada tras aceptar pey, o evento adelantado al guardado del qr_id: se adopta el QR y se concilia
      const [a] = await db`UPDATE ordenes SET qr_id=${String(qrId)}, creando_desde=NULL WHERE id=${p.id} AND qr_id IS NULL RETURNING id`;
      if (a) o = a; else [o] = await db`SELECT id FROM ordenes WHERE qr_id=${String(qrId)}`;
      if (!o) return 503; // otro guardó un QR distinto entre medias: que pey reintente y caiga en el caso siguiente
    } else {
      // pago a un QR que ya no es el vigente de la orden: se registra, sin entrega; revisión manual
      await db`INSERT INTO transacciones(transaction_id, orden_id, monto_centavos, date_paid, clasificacion)
        VALUES (${String(d.transactionId)}, ${p.id}, ${Math.round(Number(d.amount) * 100)}, ${d.datePaid ?? null}, 'invalida') ON CONFLICT DO NOTHING`;
      await marcarProcesado(db, id);
      return 200;
    }
  }
  const r = await conciliarMarcando(db, pey, o.id);
  if (!r.ok) return 503; // 503 invita al reintento (sigue sin procesar); la conciliación al consultar también lo cubre
  await marcarProcesado(db, id);
  return 200;
}

export const enVentana = (o, now) => !!o.qr_id && now <= o.expira_en + VENTANA_POST;
// Tras un éxito: viva cada 5 s; vencida/pagada/entregada dentro de la ventana, cada 60 s. Un intento fallido o cortado solo retiene 5 s.
export const intervalo = (o, now) => (o.estado === 'pendiente' && now <= o.expira_en ? 5 : 60);

// Concilia las órdenes a las que les toca (misma ventana que antes), con reserva atómica compartida entre instancias.
// Presupuesto total por consulta: tope de órdenes y de espera; un fallo o corte deja la orden «pendiente».
export async function conciliarAlConsultar(db, pey, ordenes, { now = ahora(), log = console.error, presupuestoMs = PRESUPUESTO_MS } = {}) {
  const candidatas = ordenes.filter((o) => enVentana(o, now));
  if (!candidatas.length) return;
  const limite = Date.now() + presupuestoMs; // el plazo corre desde antes de reservar: las reservas también cuentan
  const tomadas = [];
  for (const o of candidatas) {
    if (tomadas.length >= MAX_POR_CONSULTA || Date.now() >= limite) break;
    if (await reservar(db, `conc:${o.id}`, ARRENDAMIENTO, now)) tomadas.push(o);
  }
  // Solo si la reserva sigue siendo nuestra (mismo vencimiento) se acorta o se extiende: no pisa la de otra instancia.
  const reajustar = (o, seg) => db`UPDATE limites SET vence_en=${now + seg} WHERE clave=${`conc:${o.id}`} AND vence_en=${now + ARRENDAMIENTO}`;
  const trabajo = Promise.allSettled(tomadas.map(async (o) => {
    const r = await conciliarMarcando(db, pey, o.id, now);
    if (!r.ok) { log(`conciliar orden ${o.id}: ${r.error}`); return reajustar(o, REINTENTO); }
    return reajustar(o, intervalo(o, now)); // éxito: la reserva pasa al intervalo normal de la orden
  }));
  let t;
  await Promise.race([trabajo, new Promise((r) => { t = setTimeout(r, Math.max(0, limite - Date.now())); })]);
  clearTimeout(t);
}
