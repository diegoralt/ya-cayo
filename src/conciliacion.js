// Webhook firmado y decisión de polling. El webhook solo DISPARA la conciliación; nunca marca pagado.
import sw from 'standardwebhooks';
import { conciliar, registrarEvento } from './core.js';
const { Webhook } = sw;

export const VENTANA_POST = 1800; // 30 min tras vencer para descubrir pagos tardíos o segundos pagos

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
  await registrarEvento(db, cabeceras['webhook-id']);
  // ponytail: el evento puede traer los campos en `data` o en la raíz; confirmar en H1.
  const d = ev?.data ?? ev ?? {};
  const qrId = d.codiQrId;
  if (ev?.type !== 'codi.qr.payment_received' || qrId == null) return 200; // evento ajeno: firmado y ya
  const [o] = await db`SELECT id FROM ordenes WHERE qr_id=${String(qrId)}`;
  if (!o) return 200;
  const r = await conciliar(db, pey, o.id);
  return r.ok ? 200 : 503; // 503 invita al reintento; el polling cubre igualmente
}

// Cada 5 s las órdenes vivas; cada 60 s las vencidas/pagadas/entregadas dentro de la ventana.
export function debeConciliar(o, now, ultima = 0) {
  if (!o.qr_id || now > o.expira_en + VENTANA_POST) return false;
  const viva = o.estado === 'pendiente' && now <= o.expira_en;
  return now - ultima >= (viva ? 5 : 60);
}

export function iniciarPolling({ db, pey, tickMs = 1000, log = console.error }) {
  const ultimo = new Map();
  const t = setInterval(async () => {
    const now = Math.floor(Date.now() / 1000);
    try {
      for (const o of await db`SELECT id, qr_id, estado, expira_en FROM ordenes WHERE qr_id IS NOT NULL`) {
        if (!debeConciliar(o, now, ultimo.get(o.id))) continue;
        ultimo.set(o.id, now);
        const r = await conciliar(db, pey, o.id);
        if (!r.ok) log(`polling orden ${o.id}: ${r.error}`);
      }
    } catch (e) {
      log(`polling: ${e?.message}`); // ponytail: H3 elimina este setInterval (se concilia al consultar)
    }
  }, tickMs);
  t.unref?.();
  return () => clearInterval(t);
}
