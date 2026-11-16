// Webhook firmado y conciliación al consultar. El webhook solo DISPARA la conciliación; nunca marca pagado.
// Sin proceso de fondo (Vercel): el respaldo del webhook ocurre cuando alguien consulta (listado de caja, página del pagador).
import sw from 'standardwebhooks';
import { ahora, conciliar, registrarEvento, eventoProcesado, marcarProcesado, reservar } from './core.js';
const { Webhook } = sw;

export const VENTANA_POST = 1800; // 30 min tras vencer para descubrir pagos tardíos o segundos pagos
export const MAX_POR_CONSULTA = 5; // órdenes que una sola consulta puede conciliar; el resto toca en la siguiente
export const ARRENDAMIENTO = 5; // segundos que dura la reserva de un intento antes de saber si salió bien
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
  const [o] = await db`SELECT id FROM ordenes WHERE qr_id=${String(qrId)}`;
  if (!o) return 200; // sin orden (aún): queda recibido sin procesar; H4 lo concilia al enlazar el qr_id
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
export async function conciliarAlConsultar(db, pey, ordenes, { now = ahora(), log = console.error } = {}) {
  const candidatas = ordenes.filter((o) => enVentana(o, now));
  if (!candidatas.length) return;
  const tomadas = [];
  for (const o of candidatas) {
    if (tomadas.length >= MAX_POR_CONSULTA) break;
    if (await reservar(db, `conc:${o.id}`, ARRENDAMIENTO, now)) tomadas.push(o); // reserva corta: si algo falla o se corta, se reintenta pronto
  }
  const trabajo = Promise.allSettled(tomadas.map(async (o) => {
    const r = await conciliarMarcando(db, pey, o.id, now);
    if (!r.ok) return log(`conciliar orden ${o.id}: ${r.error}`);
    const espera = intervalo(o, now); // éxito: se extiende la reserva al intervalo normal de la orden
    if (espera > ARRENDAMIENTO) await db`UPDATE limites SET vence_en=${now + espera} WHERE clave=${`conc:${o.id}`}`;
  }));
  let t;
  await Promise.race([trabajo, new Promise((r) => { t = setTimeout(r, PRESUPUESTO_MS); })]);
  clearTimeout(t);
}
