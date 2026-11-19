// Recoverable QR: own idempotency by `attempt` (pey offers none), takeover of stuck attempts and correlation by metadata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sw from 'standardwebhooks';
import { newDb } from './helpers/pg.js';
import { createOrder, orderView, nowSec, CREATING_TIMEOUT_S } from '../src/core.js';
import { handleWebhook } from '../src/reconciliation.js';
const { Webhook } = sw;

const T0 = 1_000_000;
let n = 0;
// pey double: counts creations; `hang` leaves a creation unresolved until you release it.
function pey({ txs = [], falla = false, demora = 0 } = {}) {
  const p = { creados: [], txs, release: [] };
  p.createQr = async (args) => {
    p.creados.push(args);
    const id = `QR${++n}`;
    if (falla) throw new Error('503');
    if (demora) await new Promise((r) => setTimeout(r, demora));
    if (p.hang) await new Promise((r) => p.release.push(r));
    return { id, qrString: `cadena-${id}`, qrImage: 'AAAA' };
  };
  p.listQrTransactions = async () => (typeof p.txs === 'function' ? p.txs() : p.txs);
  return p;
}
const base = { concept: 't', amountCents: 1, now: T0 };
const orders = async (db) => (await db`SELECT count(*) n FROM orders`)[0].n;

test('same attempt after success: same order and same QR, pey is called once', async () => {
  const { db } = await newDb();
  const p = pey();
  const a = await createOrder(db, p, { ...base, attempt: 'i-1' });
  const b = await createOrder(db, p, { ...base, attempt: 'i-1' });
  assert.equal(b.id, a.id);
  assert.equal(b.qr.id, a.qr.id);
  assert.equal(b.qr.qrString, a.qr.qrString);
  assert.equal(b.reused, true);
  assert.equal(p.creados.length, 1);
  assert.equal(await orders(db), 1);
});

test('simultaneous retries of the same attempt (different instances): one order and a single QR', async () => {
  const { db, openConn } = await newDb();
  const p = pey({ demora: 60 });
  const rs = await Promise.all([createOrder(db, p, { ...base, attempt: 'i-2' }), createOrder(openConn(), p, { ...base, attempt: 'i-2' }), createOrder(openConn(), p, { ...base, attempt: 'i-2' })]);
  assert.equal(p.creados.length, 1);
  assert.equal(await orders(db), 1);
  assert.equal(rs.filter((r) => r.qr && !r.reused).length, 1); // only one created; the rest see «creating» or reuse it
  assert.ok(rs.every((r) => r.id === rs[0].id));
  const otra = await createOrder(db, p, { ...base, attempt: 'i-2' });
  assert.equal(otra.reused, true);
});

test('in flight (< timeout): a retry gets «creating» and does not call pey again', async () => {
  const { db } = await newDb();
  const p = pey(); p.hang = true;
  createOrder(db, p, { ...base, attempt: 'i-3' }); // the function «stays waiting» on pey
  await new Promise((r) => setTimeout(r, 100));
  const r = await createOrder(db, p, { ...base, attempt: 'i-3', now: T0 + CREATING_TIMEOUT_S - 1 });
  assert.equal(r.creating, true);
  assert.equal(p.creados.length, 1);
  p.release.forEach((f) => f());
});

test('function dead after pey accepted: after the timeout the QR of the same order is recreated; the late one does not overwrite the current one', async () => {
  const { db, openConn } = await newDb();
  const p = pey(); p.hang = true;
  const first = createOrder(db, p, { ...base, attempt: 'i-4' }); // pey accepts QR 1 but the function never saves (hung)
  await new Promise((r) => setTimeout(r, 100));
  const [{ id }] = await db`SELECT id FROM orders WHERE attempt='i-4'`;
  const q = pey(); // retry without hanging
  const r = await createOrder(openConn(), q, { ...base, attempt: 'i-4', now: T0 + CREATING_TIMEOUT_S + 1 });
  assert.equal(r.id, id);
  assert.ok(r.qr && !r.creating);
  assert.equal(q.creados.length, 1);
  assert.equal(await orders(db), 1);
  assert.equal(q.creados[0].metadata.attempt, 'i-4');
  assert.equal((await orderView(db, id, T0)).qr_id, r.qr.id);
  p.release.forEach((f) => f()); // the «dead» function wakes up late: its QR is discarded, it does not overwrite
  const late = await first;
  assert.equal(late.qr.id, r.qr.id);
  assert.equal((await orderView(db, id, T0)).qr_id, r.qr.id);
  assert.equal(await orders(db), 1);
});

test('the takeover uses the stored concept and amount, not those of the retry', async () => {
  const { db } = await newDb();
  const p = pey(); p.hang = true;
  createOrder(db, p, { concept: 'café', amountCents: 3000, now: T0, attempt: 'i-5' });
  await new Promise((r) => setTimeout(r, 100));
  const q = pey();
  await createOrder(db, q, { concept: 'otra cosa', amountCents: 1, now: T0 + 40, attempt: 'i-5' });
  assert.deepEqual([q.creados[0].concept, q.creados[0].amountCents], ['café', 3000]);
  p.release.forEach((f) => f());
});

test('pey error: leaves no order and the same attempt can be retried', async () => {
  const { db } = await newDb();
  await assert.rejects(createOrder(db, pey({ falla: true }), { ...base, attempt: 'i-6' }));
  assert.equal(await orders(db), 0);
  const r = await createOrder(db, pey(), { ...base, attempt: 'i-6' });
  assert.ok(r.qr);
  assert.equal(await orders(db), 1);
});

// ---- webhook and correlation by metadata.attempt
const SECRET = 'whsec_' + Buffer.from('secreto-de-prueba-0123456789abcdef').toString('base64');
const wh = new Webhook(SECRET);
const sign = (body, id) => { const ts = new Date(); return { 'webhook-id': id, 'webhook-timestamp': String(Math.floor(ts.getTime() / 1000)), 'webhook-signature': wh.sign(id, ts, body) }; };
const evento = (qr, attempt, tid = 'TX1') => JSON.stringify({ type: 'codi.qr.payment_received', codiQrId: qr, transactionId: tid, amount: 0.01, datePaid: nowSec() + 1, numRef: '1', metadata: { attempt } });
const paidTx = (id = 'TX1') => ({ id, status: 'PAID', amountCents: 1, currency: 'MXN', datePaid: nowSec() + 1 });

test('webhook ahead of the save (order creating): adopts the QR by metadata.attempt and reconciles', async () => {
  const { db } = await newDb();
  const p = pey({ txs: [paidTx()] }); p.hang = true;
  createOrder(db, p, { ...base, now: nowSec(), attempt: 'i-7' }); // pey accepted, the qr_id is not saved yet
  await new Promise((r) => setTimeout(r, 100));
  const [{ id }] = await db`SELECT id FROM orders WHERE attempt='i-7'`;
  const body = evento('QR-X', 'i-7');
  assert.equal(await handleWebhook({ db, pey: p, secret: SECRET }, body, sign(body, 'msg_a')), 200);
  const v = await orderView(db, id);
  assert.equal(v.qr_id, 'QR-X');
  assert.equal(v.status, 'paid');
  p.release.forEach((f) => f()); // the late save does not overwrite the adopted QR
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await orderView(db, id)).qr_id, 'QR-X');
});

test('real pey event shape (attempt in metadata.externalMetadata): adopts the QR and reconciles', async () => {
  const { db } = await newDb();
  const p = pey({ txs: [paidTx()] }); p.hang = true;
  createOrder(db, p, { ...base, now: nowSec(), attempt: 'i-7b' });
  await new Promise((r) => setTimeout(r, 100));
  const [{ id }] = await db`SELECT id FROM orders WHERE attempt='i-7b'`;
  const body = JSON.stringify({ type: 'codi.qr.payment_received', codiQrId: 'QR-R', transactionId: 'TX1', amount: 0.01, datePaid: nowSec() + 1, numRef: '1', metadata: { accountType: 40, externalMetadata: { attempt: 'i-7b' } } });
  assert.equal(await handleWebhook({ db, pey: p, secret: SECRET }, body, sign(body, 'msg_real')), 200);
  const v = await orderView(db, id);
  assert.equal(v.qr_id, 'QR-R');
  assert.equal(v.status, 'paid');
  p.release.forEach((f) => f());
});

test('payment to a QR that is no longer the current QR of the order: recorded as invalid, no delivery or status change', async () => {
  const { db } = await newDb();
  const p = pey({ txs: [] });
  const { id } = await createOrder(db, p, { ...base, now: nowSec(), attempt: 'i-8' });
  const body = evento('QR-HUERFANO', 'i-8', 'TX9');
  assert.equal(await handleWebhook({ db, pey: p, secret: SECRET }, body, sign(body, 'msg_b')), 200);
  const v = await orderView(db, id);
  assert.equal(v.status, 'pending');
  assert.deepEqual(v.transactions.map((t) => [t.transaction_id, t.classification]), [['TX9', 'invalid']]);
  assert.equal(await handleWebhook({ db, pey: p, secret: SECRET }, body, sign(body, 'msg_b')), 200); // resend: idempotent
  assert.equal((await orderView(db, id)).transactions.length, 1);
});

test('webhook with unknown attempt or no metadata: 200 with no effect', async () => {
  const { db } = await newDb();
  const p = pey();
  const { id } = await createOrder(db, p, { ...base, now: nowSec(), attempt: 'i-9' });
  for (const c of [evento('QR-Z', 'no-existe'), JSON.stringify({ type: 'codi.qr.payment_received', codiQrId: 'QR-Z' })]) {
    assert.equal(await handleWebhook({ db, pey: p, secret: SECRET }, c, sign(c, `msg_${++n}`)), 200);
  }
  assert.equal((await orderView(db, id)).status, 'pending');
});
