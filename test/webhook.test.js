import { test } from 'node:test';
import assert from 'node:assert/strict';
import sw from 'standardwebhooks';
import { newDb } from './helpers/pg.js';
import { createOrder, deliver, orderView, reconcile, nowSec } from '../src/core.js';
import { handleWebhook } from '../src/reconciliation.js';
import { normalizeTx } from '../src/pey.js';
const { Webhook } = sw;

const SECRET = 'whsec_' + Buffer.from('secreto-de-prueba-0123456789abcdef').toString('base64');
const wh = new Webhook(SECRET);
const T = nowSec();
let n = 0;
function sign(body, id = `msg_${++n}`, ts = new Date()) {
  return { 'webhook-id': id, 'webhook-timestamp': String(Math.floor(ts.getTime() / 1000)), 'webhook-signature': wh.sign(id, ts, body) };
}
const evento = (qr) => JSON.stringify({ type: 'codi.qr.payment_received', data: { codiQrId: qr, transactionId: 'T1', amount: 0.01 } });
const tx = (extra = {}) => ({ id: 'T1', status: 'PAID', amountCents: 1, currency: 'MXN', datePaid: T + 5, ...extra });

async function escenario(txs) {
  const { db } = await newDb();
  let list = txs;
  const pey = { createQr: async () => ({ id: `QR${++n}` }), listQrTransactions: async () => (typeof list === 'function' ? list() : list) };
  const { id, qr } = await createOrder(db, pey, { concept: 't', amountCents: 1, now: T });
  return { db, pey, id, qr: qr.id, set: (x) => (list = x) };
}

test('missing, incorrect or altered-body signature: 401 and no status change', async () => {
  const { db, pey, id, qr } = await escenario([tx()]);
  const body = evento(qr);
  const buena = sign(body);
  for (const [c, h] of [
    [body, {}],
    [body, { ...buena, 'webhook-signature': 'v1,AAAA' }],
    [body + ' ', buena],
    [body, sign(body, 'x', new Date(Date.now() - 3600_000))], // timestamp outside tolerance
  ]) assert.equal(await handleWebhook({ db, pey, secret: SECRET }, c, h), 401);
  assert.equal((await orderView(db, id)).status, 'pending');
  assert.equal((await db`SELECT COUNT(*) n FROM events`)[0].n, 0);
});

test('a signed webhook triggers reconciliation and a resend of the same event leaves one delivery', async () => {
  const { db, pey, id, qr } = await escenario([tx()]);
  const body = evento(qr), h = sign(body, 'msg_fijo');
  assert.equal(await handleWebhook({ db, pey, secret: SECRET }, body, h), 200);
  assert.equal(await handleWebhook({ db, pey, secret: SECRET }, body, h), 200);
  assert.equal((await orderView(db, id)).status, 'paid');
  assert.equal((await deliver(db, id)).ok, true);
  assert.equal(await handleWebhook({ db, pey, secret: SECRET }, body, h), 200);
  assert.equal((await orderView(db, id)).deliveries, 1);
  assert.equal((await db`SELECT COUNT(*) n FROM events`)[0].n, 1);
});

test('the webhook is not enough: if the pey query does not show the payment, nothing is enabled', async () => {
  const { db, pey, id, qr } = await escenario([]);
  const body = evento(qr);
  assert.equal(await handleWebhook({ db, pey, secret: SECRET }, body, sign(body)), 200);
  assert.equal((await orderView(db, id)).status, 'pending');
  assert.equal((await deliver(db, id)).ok, false);
});

test('query down: 503 to invite a retry and status intact', async () => {
  const { db, pey, id, qr, set } = await escenario([]);
  set(() => { throw new Error('503'); });
  const body = evento(qr);
  assert.equal(await handleWebhook({ db, pey, secret: SECRET }, body, sign(body)), 503);
  assert.equal((await orderView(db, id)).status, 'pending');
});

test('signed for another QR or another event type: 200 with no effect', async () => {
  const { db, pey, id } = await escenario([tx()]);
  for (const c of [evento('QR-ajeno'), JSON.stringify({ type: 'bank.account.updated', data: {} })])
    assert.equal(await handleWebhook({ db, pey, secret: SECRET }, c, sign(c)), 200);
  assert.equal((await orderView(db, id)).status, 'pending');
});

test('webhook absent: polling finds the pre-expiry payment that shows up later', async () => {
  const { db, pey, id, qr, set } = await escenario([]);
  await reconcile(db, pey, id);
  assert.equal((await orderView(db, id)).status, 'pending');
  set([tx({ datePaid: T + 359 })]); // paid before expiring; pey shows it late
  await reconcile(db, pey, id);
  assert.equal((await orderView(db, id, T + 400)).status, 'paid');
});

test('payment after expiry: late, no delivery; second payment after deliver: duplicate, counter 1', async () => {
  const a = await escenario([tx({ datePaid: T + 361 })]);
  await reconcile(a.db, a.pey, a.id);
  assert.equal((await orderView(a.db, a.id)).late, true);
  assert.equal((await deliver(a.db, a.id)).ok, false);
  const b = await escenario([tx()]);
  await reconcile(b.db, b.pey, b.id);
  assert.equal((await deliver(b.db, b.id)).ok, true);
  b.set([tx(), tx({ id: 'T2', datePaid: T + 20 })]);
  await reconcile(b.db, b.pey, b.id);
  const v = await orderView(b.db, b.id);
  assert.equal(v.duplicate, true);
  assert.equal(v.deliveries, 1);
});

test('received vs processed: a 503 leaves the event unprocessed and the same webhook-id is retried', async () => {
  const { db, pey, id, qr, set } = await escenario([]);
  const body = evento(qr), h = sign(body, 'msg_503');
  set(() => { throw new Error('503'); });
  assert.equal(await handleWebhook({ db, pey, secret: SECRET }, body, h), 503);
  const [e] = await db`SELECT received_at, processed_at FROM events WHERE webhook_id='msg_503'`;
  assert.ok(e.received_at && e.processed_at === null);
  assert.equal((await db`SELECT 1 FROM pending_reconciliation WHERE order_id=${id}`).length, 1); // durable pending
  set([tx()]);
  assert.equal(await handleWebhook({ db, pey, secret: SECRET }, body, h), 200); // a retry with the same id does process
  assert.equal((await orderView(db, id)).status, 'paid');
  assert.ok((await db`SELECT processed_at FROM events WHERE webhook_id='msg_503'`)[0].processed_at);
  assert.equal((await db`SELECT 1 FROM pending_reconciliation WHERE order_id=${id}`).length, 0);
});

test('already-processed event: the resend answers 200 without querying pey again', async () => {
  const { db, pey, qr } = await escenario([tx()]);
  let consultas = 0;
  const contador = { ...pey, listQrTransactions: async (q) => { consultas++; return pey.listQrTransactions(q); } };
  const body = evento(qr), h = sign(body, 'msg_dup');
  await handleWebhook({ db, pey: contador, secret: SECRET }, body, h);
  await handleWebhook({ db, pey: contador, secret: SECRET }, body, h);
  assert.equal(consultas, 1);
});

test('normalizeTx converts pesos to cents and ISO dates to Unix', () => {
  assert.deepEqual(normalizeTx({ id: 'A', status: 'PAID', amount: 0.01, currency: 'MXN', datePaid: '2026-11-14T12:00:00Z' }),
    { id: 'A', status: 'PAID', amountCents: 1, currency: 'MXN', datePaid: 1794657600 });
});
