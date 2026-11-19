// State core on Postgres: reconciling records facts; only deliver() moves an order to «delivered».
// The schema lives in supabase/migrations/. Writes to one order are serialized with SELECT … FOR UPDATE.
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

export const nowSec = () => Math.floor(Date.now() / 1000);

// bigint (ids, cents, Unix seconds) and numeric (SUM/AVG) arrive as Number: they fit well within 2^53.
const asNumber = { to: 0, from: [], serialize: String, parse: Number };
const types = { bigint: { ...asNumber, to: 20, from: [20] }, numeric: { ...asNumber, to: 1700, from: [1700] } };

// Pooler: use the SESSION pooler (:5432). On the transaction pooler (:6543) postgres.js pipelining hangs the pool
// (Supabase docs; measured 18-nov, buenas-practicas.md B1); `max_pipeline: 1` is the verified alternative.
// TLS is required for any remote host (S1); the local test Postgres has none.
// query_timeout/queue_timeout turn a stuck query into a fast error instead of a 300 s function timeout (B2).
const isLocal = (url) => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(url).hostname);
export function openDb(url, opts = {}) {
  if (!url) throw new Error('missing database URL');
  return postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10, query_timeout: 20, queue_timeout: 10,
    ssl: isLocal(url) ? false : 'require', onnotice: () => {}, types, ...opts });
}

export const CREATING_TIMEOUT_S = 30; // an attempt with no qr_id older than this is considered stuck (pey takes ≤15 s per call)
const qrOf = (o) => ({ id: o.qr_id, qrString: o.qr_string, qrImage: o.qr_image });

// Own idempotency (pey offers none: experimento-pey.md). The client generates `attempt`; it is unique in the DB.
// Only the INSERT winner (or the takeover of a stuck attempt) calls pey. A QR whose response was lost is
// unreachable (nobody saw it and it cannot be queried), so recreating is safe. Saving is «first one wins».
// pey: { createQr({amountCents, concept, expiration, numRef, metadata}) -> {id,qrString,qrImage}, listQrTransactions(qrId) -> [{id,status,amountCents,currency,datePaid}] }
// Returns { id, qr } (new, or existing with reused: true), { id, creating: true } if someone else is creating it,
// or { full: true } if the live-order quota is exhausted.
export async function createOrder(db, pey, { concept, amountCents, ttl = 360, now = nowSec(), attempt = randomUUID(), maxLive }) {
  let id, c = concept, m = amountCents;
  // Atomic quota: the 'quota' row in limits serializes count + insert; an existing attempt does not consume quota.
  const created = await db.begin(async (t) => {
    if (maxLive) {
      await t`INSERT INTO limits(key, value, expires_at) VALUES ('quota', 0, 0) ON CONFLICT (key) DO UPDATE SET value=limits.value`;
      if (!(await t`SELECT 1 FROM orders WHERE attempt=${attempt}`).length && (await liveCharges(t, now)) >= maxLive) return 'full';
    }
    return (await t`INSERT INTO orders(concept, amount_cents, created_at, expires_at, token, attempt, creating_since)
      VALUES (${c}, ${m}, ${now}, ${now + ttl}, ${randomUUID()}, ${attempt}, ${now}) ON CONFLICT (attempt) DO NOTHING RETURNING id`)[0];
  });
  if (created === 'full') return { full: true };
  if (created) id = created.id;
  else {
    const [o] = await db`SELECT id, concept, amount_cents, qr_id, qr_string, qr_image FROM orders WHERE attempt=${attempt}`;
    if (!o) return createOrder(db, pey, { concept, amountCents, ttl, now, attempt }); // deleted by a pey error in between
    if (o.qr_id) return { id: o.id, qr: qrOf(o), reused: true };
    const [r] = await db`UPDATE orders SET creating_since=${now}, expires_at=${now + ttl}
      WHERE id=${o.id} AND qr_id IS NULL AND creating_since <= ${now - CREATING_TIMEOUT_S} RETURNING id`;
    if (!r) return { id: o.id, creating: true }; // someone else is creating it (or the takeover already happened)
    id = o.id; c = o.concept; m = o.amount_cents; // the takeover uses what was stored, not what the retry sends
  }
  let qr;
  try {
    qr = await pey.createQr({ amountCents: m, concept: c, expiration: ttl, numRef: String(id % 10_000_000), metadata: { attempt } });
  } catch (e) {
    await db`DELETE FROM orders WHERE id=${id} AND qr_id IS NULL AND creating_since=${now}`;
    throw e;
  }
  const [g] = await db`UPDATE orders SET qr_id=${String(qr.id)}, qr_string=${qr.qrString ?? null}, qr_image=${qr.qrImage ?? null}, creating_since=NULL
    WHERE id=${id} AND qr_id IS NULL RETURNING id`;
  if (g) return { id, qr };
  const [o] = await db`SELECT qr_id, qr_string, qr_image FROM orders WHERE id=${id}`; // someone saved first: ours is discarded
  if (!o?.qr_id) throw new Error('the order disappeared during creation');
  return { id, qr: qrOf(o), reused: true };
}

// Applies already-fetched transactions. Never downgrades or reopens an order; it only adds facts.
// FOR UPDATE serializes whoever reconciles the same order from any connection; the classification follows the winning transition.
export async function applyTransactions(db, orderId, txs) {
  return db.begin(async (t) => {
    const [o] = await t`SELECT * FROM orders WHERE id=${orderId} FOR UPDATE`;
    if (!o) return { added: [] };
    let status = o.status;
    const added = [];
    const paid = txs.filter((x) => x.status === 'PAID').sort((a, b) => a.datePaid - b.datePaid);
    for (const x of paid) {
      if ((await t`SELECT 1 FROM transactions WHERE transaction_id=${String(x.id)}`).length) continue;
      let c;
      if (x.amountCents !== o.amount_cents || x.currency !== 'MXN') c = 'invalid';
      else if (x.datePaid > o.expires_at) c = 'late';
      else if (status === 'pending') {
        c = 'valid';
        status = 'paid';
        await t`UPDATE orders SET status='paid', paid_at=${x.datePaid}, confirmed_at=${nowSec()} WHERE id=${orderId} AND status='pending'`;
      } else c = 'duplicate';
      await t`INSERT INTO transactions(transaction_id, order_id, amount_cents, date_paid, classification)
        VALUES (${String(x.id)}, ${orderId}, ${x.amountCents}, ${x.datePaid ?? null}, ${c})`;
      added.push({ id: x.id, classification: c });
    }
    return { added };
  });
}

// Queries pey (outside the transaction) and applies. A failed query changes nothing.
export async function reconcile(db, pey, orderId) {
  const [o] = await db`SELECT qr_id FROM orders WHERE id=${orderId}`;
  if (!o?.qr_id) return { ok: false, error: 'no_qr' };
  let txs;
  try {
    txs = await pey.listQrTransactions(o.qr_id);
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
  return { ok: true, ...(await applyTransactions(db, orderId, txs)) };
}

// The only path to «delivered»: conditional UPDATE + INSERT in the same transaction (deliveries.order_id is the PK).
export async function deliver(db, orderId, now = nowSec()) {
  return db.begin(async (t) => {
    const r = await t`UPDATE orders SET status='delivered' WHERE id=${orderId} AND status='paid' RETURNING id`;
    if (r.length !== 1) return { ok: false };
    await t`INSERT INTO deliveries(order_id, delivered_at) VALUES (${orderId}, ${now})`;
    return { ok: true };
  });
}

export async function countDeliveries(db, orderId) {
  return (await db`SELECT COUNT(*) AS n FROM deliveries WHERE order_id=${orderId}`)[0].n;
}

export async function orderView(db, orderId, now = nowSec()) {
  const [o] = await db`SELECT * FROM orders WHERE id=${orderId}`;
  if (!o) return null;
  const transactions = await db`SELECT transaction_id, amount_cents, date_paid, classification FROM transactions WHERE order_id=${orderId}`;
  return {
    ...o,
    expired: o.status === 'pending' && now > o.expires_at,
    late: transactions.some((t) => t.classification === 'late'),
    duplicate: transactions.some((t) => t.classification === 'duplicate'),
    deliveries: await countDeliveries(db, orderId),
    transactions: [...transactions],
  };
}

// Event «received» (idempotent by webhook_id) vs «processed»: a failure leaves processed_at NULL and the retry does process.
export async function recordEvent(db, webhookId, now = nowSec()) {
  return (await db`INSERT INTO events(webhook_id, received_at) VALUES (${webhookId}, ${now}) ON CONFLICT DO NOTHING`).count === 1;
}
export async function isEventProcessed(db, webhookId) {
  return (await db`SELECT processed_at FROM events WHERE webhook_id=${webhookId}`)[0]?.processed_at != null;
}
export async function markProcessed(db, webhookId, now = nowSec()) {
  await db`UPDATE events SET processed_at=${now} WHERE webhook_id=${webhookId} AND processed_at IS NULL`;
}

// PIN by IP: n failures per window in limits. A single atomic upsert; returns the count and when the window ends.
export async function countFailure(db, ip, windowSec, now = nowSec()) {
  const [r] = await db`INSERT INTO limits(key, value, expires_at) VALUES (${`pin:${ip}`}, 1, ${now + windowSec})
    ON CONFLICT (key) DO UPDATE SET value = CASE WHEN limits.expires_at <= ${now} THEN 1 ELSE limits.value + 1 END,
      expires_at = CASE WHEN limits.expires_at <= ${now} THEN ${now + windowSec} ELSE limits.expires_at END
    RETURNING value, expires_at`;
  return { n: Number(r.value), until: Number(r.expires_at) };
}
export async function pinFailures(db, ip, now = nowSec()) {
  const [r] = await db`SELECT value, expires_at FROM limits WHERE key=${`pin:${ip}`} AND expires_at>${now}`;
  return r ? { n: Number(r.value), until: Number(r.expires_at) } : { n: 0, until: 0 };
}

// Atomic reservation with expiry: true only for whoever takes it (the row blocks the rest until `expires_at`).
export async function reserve(db, key, ttl, now = nowSec()) {
  return (await db`INSERT INTO limits(key, value, expires_at) VALUES (${key}, 1, ${now + ttl})
    ON CONFLICT (key) DO UPDATE SET value=1, expires_at=${now + ttl} WHERE limits.expires_at <= ${now} RETURNING 1`).length === 1;
}

// «Card or cash» record: it does not charge, it only measures how many accept CoDi.
export async function recordOtherMethod(db, concept, amountCents, now = nowSec()) {
  await db`INSERT INTO records(concept, amount_cents, method, created_at) VALUES (${concept}, ${amountCents}, 'other', ${now})`;
}

// Live = pending and not expired; includes those still «creating» (no qr_id yet).
export async function liveCharges(db, now = nowSec()) {
  return (await db`SELECT COUNT(*) AS n FROM orders WHERE status='pending' AND expires_at>=${now}`)[0].n;
}

// «After» metrics computed by the server. Clicks and app switches are not measured here (see docs).
export async function metrics(db, fee = 0.03) {
  const [o] = await db`SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status IN ('paid','delivered')) AS paid,
      COUNT(*) FILTER (WHERE status='delivered') AS delivered,
      AVG(CASE WHEN paid_at IS NOT NULL THEN paid_at - created_at END) AS charge_seconds,
      AVG(CASE WHEN paid_at IS NOT NULL THEN confirmed_at - paid_at END) AS latency_seconds,
      SUM(CASE WHEN status IN ('paid','delivered') THEN amount_cents ELSE 0 END) AS codi_cents
    FROM orders WHERE qr_id IS NOT NULL`;
  const [{ n: other }] = await db`SELECT COUNT(*) AS n FROM records WHERE method='other'`;
  const [{ n: maxDeliveries }] = await db`SELECT COALESCE(MAX(n),0) AS n FROM (SELECT COUNT(*) AS n FROM deliveries GROUP BY order_id) e`;
  return {
    charges: o.total, paid: o.paid, delivered: o.delivered,
    chargeSeconds: o.charge_seconds, latencySeconds: o.latency_seconds,
    codiAcceptance: { codi: o.total, other },
    maxDeliveriesPerOrder: maxDeliveries,
    avoidedFeeCents: Math.round((o.codi_cents ?? 0) * fee), // assumption, not measured
  };
}
