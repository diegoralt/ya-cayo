// Signed webhook and reconcile-on-read. The webhook only TRIGGERS reconciliation; it never marks anything paid.
// No background process (Vercel): the webhook's backup happens when someone reads (cashier list, payer page).
import sw from 'standardwebhooks';
import { nowSec, reconcile, recordEvent, isEventProcessed, markProcessed, reserve } from './core.js';
const { Webhook } = sw;

export const POST_WINDOW = 1800; // 30 min after expiry to discover late payments or second payments
export const MAX_PER_QUERY = 5; // orders a single read may reconcile; the rest wait for the next one
export const LEASE = 30; // reservation while the attempt runs: covers pey's worst case so another read does not overlap
export const RETRY = 5; // if the attempt fails, the reservation is shortened to this; a cut process keeps the full lease
export const BUDGET_MS = 8000; // wait cap per read; whatever does not finish stays «pending» and is picked up later

// Reconcile leaving a durable trace: «pending» from before calling pey until it finishes successfully.
export async function reconcileMarking(db, pey, orderId, now = nowSec()) {
  await db`INSERT INTO pending_reconciliation(order_id, since) VALUES (${orderId}, ${now}) ON CONFLICT DO NOTHING`;
  const r = await reconcile(db, pey, orderId);
  if (r.ok) await db`DELETE FROM pending_reconciliation WHERE order_id=${orderId}`;
  return r;
}

// Returns the HTTP code. Missing/incorrect/altered signature => 401 without touching the database.
export async function handleWebhook({ db, pey, secret }, rawBody, headers) {
  let ev;
  try {
    ev = new Webhook(secret).verify(rawBody, {
      'webhook-id': headers['webhook-id'] ?? '',
      'webhook-timestamp': headers['webhook-timestamp'] ?? '',
      'webhook-signature': headers['webhook-signature'] ?? '',
    });
  } catch {
    return 401;
  }
  const id = headers['webhook-id'];
  await recordEvent(db, id); // «received»
  if (await isEventProcessed(db, id)) return 200; // resend of something already resolved
  // ponytail: the event may carry fields in `data` or at the root; confirm with a real payment.
  const d = ev?.data ?? ev ?? {};
  const qrId = d.codiQrId;
  if (ev?.type !== 'codi.qr.payment_received' || qrId == null) { await markProcessed(db, id); return 200; } // foreign event: signed and done
  let [o] = await db`SELECT id FROM orders WHERE qr_id=${String(qrId)}`;
  if (!o) {
    // No order with that QR: correlation is ours, via metadata.attempt (pey returns it in the event).
    let md = d.metadata; if (typeof md === 'string') { try { md = JSON.parse(md); } catch { md = null; } }
    const attempt = md?.attempt ?? md?.externalMetadata?.attempt; // real pey events (18-nov payment) nest it in externalMetadata
    if (!attempt) return 200; // no order (yet): stays received-unprocessed; reconcile-on-read covers it
    const [p] = await db`SELECT id, qr_id FROM orders WHERE attempt=${String(attempt)}`;
    if (!p) return 200;
    if (p.qr_id == null) {
      // function cut after pey accepted, or event ahead of the qr_id save: adopt the QR and reconcile
      const [a] = await db`UPDATE orders SET qr_id=${String(qrId)}, creating_since=NULL WHERE id=${p.id} AND qr_id IS NULL RETURNING id`;
      if (a) o = a; else [o] = await db`SELECT id FROM orders WHERE qr_id=${String(qrId)}`;
      if (!o) return 503; // someone saved a different QR in between: let pey retry and fall into the next case
    } else {
      // payment to a QR that is no longer the order's current one: record it, no delivery; manual review
      await db`INSERT INTO transactions(transaction_id, order_id, amount_cents, date_paid, classification)
        VALUES (${String(d.transactionId)}, ${p.id}, ${Math.round(Number(d.amount) * 100)}, ${d.datePaid ?? null}, 'invalid') ON CONFLICT DO NOTHING`;
      await markProcessed(db, id);
      return 200;
    }
  }
  const r = await reconcileMarking(db, pey, o.id);
  if (!r.ok) return 503; // 503 invites a retry (still unprocessed); reconcile-on-read covers it too
  await markProcessed(db, id);
  return 200;
}

export const inWindow = (o, now) => !!o.qr_id && now <= o.expires_at + POST_WINDOW;
// After a success: live every 5 s; expired/paid/delivered inside the window every 60 s. A failed or cut attempt only holds 5 s.
export const interval = (o, now) => (o.status === 'pending' && now <= o.expires_at ? 5 : 60);

// Reconciles the orders that are due (same window as before), with an atomic reservation shared across instances.
// Total budget per read: cap on orders and on wait; a failure or cut leaves the order «pending».
export async function reconcileOnRead(db, pey, orders, { now = nowSec(), log = console.error, budgetMs = BUDGET_MS } = {}) {
  const candidates = orders.filter((o) => inWindow(o, now));
  if (!candidates.length) return;
  const deadline = Date.now() + budgetMs; // the clock runs from before reserving: reservations count too
  const taken = [];
  for (const o of candidates) {
    if (taken.length >= MAX_PER_QUERY || Date.now() >= deadline) break;
    if (await reserve(db, `recon:${o.id}`, LEASE, now)) taken.push(o);
  }
  // Only if the reservation is still ours (same expiry) is it shortened or extended: it does not overwrite another instance's.
  const adjust = (o, sec) => db`UPDATE limits SET expires_at=${now + sec} WHERE key=${`recon:${o.id}`} AND expires_at=${now + LEASE}`;
  const work = Promise.allSettled(taken.map(async (o) => {
    const r = await reconcileMarking(db, pey, o.id, now);
    if (!r.ok) { log(`reconcile order ${o.id}: ${r.error}`); return adjust(o, RETRY); }
    return adjust(o, interval(o, now)); // success: the reservation moves to the order's normal interval
  }));
  let t;
  await Promise.race([work, new Promise((r) => { t = setTimeout(r, Math.max(0, deadline - Date.now())); })]);
  clearTimeout(t);
}
