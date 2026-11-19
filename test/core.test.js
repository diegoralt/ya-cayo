import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from './helpers/pg.js';
import { createOrder, applyTransactions, reconcile, deliver, countDeliveries, orderView } from '../src/core.js';

const T0 = 1_000_000;
const paidTx = (id, extra = {}) => ({ id, status: 'PAID', amountCents: 1, currency: 'MXN', datePaid: T0 + 10, ...extra });
let nQr = 0;
const feyPey = (txs, demora = 0) => ({
  createQr: async () => ({ id: `QR${++nQr}` }),
  listQrTransactions: async () => { if (demora) await new Promise((r) => setTimeout(r, demora)); return txs; },
});
async function nueva(db, pey = feyPey([])) {
  const { id } = await createOrder(db, pey, { concept: 'ticket 1', amountCents: 1, now: T0 });
  return id;
}

test('a) sequential resend: same transactions twice = one fact, one delivery', async () => {
  const { db } = await newDb(); const id = await nueva(db);
  await applyTransactions(db, id, [paidTx('T1')]);
  await applyTransactions(db, id, [paidTx('T1')]);
  assert.equal((await orderView(db, id, T0)).transactions.length, 1);
  assert.equal((await deliver(db, id)).ok, true);
  assert.equal((await deliver(db, id)).ok, false);
  assert.equal(await countDeliveries(db, id), 1);
});

test('b) interleaving: GET A, GET B, confirm A, deliver, apply B neither reopens nor duplicates', async () => {
  const { db } = await newDb(); const id = await nueva(db);
  const A = [paidTx('T1')], B = [paidTx('T1'), paidTx('T2', { datePaid: T0 + 20 })];
  await applyTransactions(db, id, A);
  assert.equal((await deliver(db, id)).ok, true);
  await applyTransactions(db, id, B);
  const v = await orderView(db, id, T0);
  assert.equal(v.status, 'delivered');
  assert.equal(v.deliveries, 1);
  assert.deepEqual(v.transactions.map((t) => t.classification).sort(), ['duplicate', 'valid']);
});

test('c) two different transactionIds for the same ticket: one valid, one duplicate, a single delivery', async () => {
  const { db } = await newDb(); const id = await nueva(db);
  await applyTransactions(db, id, [paidTx('T1'), paidTx('T2', { datePaid: T0 + 11 })]);
  assert.equal((await orderView(db, id, T0)).duplicate, true);
  assert.equal((await deliver(db, id)).ok, true);
  assert.equal((await deliver(db, id)).ok, false);
  assert.equal(await countDeliveries(db, id), 1);
});

test('d) failure between UPDATE and INSERT: rollback, stays paid and no extra delivery', async () => {
  const { db } = await newDb(); const id = await nueva(db);
  await applyTransactions(db, id, [paidTx('T1')]);
  await db`INSERT INTO deliveries(order_id, delivered_at) VALUES (${id}, ${T0})`; // deliberately corrupt status
  await assert.rejects(deliver(db, id));
  assert.equal((await orderView(db, id, T0)).status, 'paid');
  assert.equal(await countDeliveries(db, id), 1);
});

test('e) restart: the status and the single delivery survive closing and reopening the connection', async () => {
  const { db: db1, openConn } = await newDb(); const id = await nueva(db1);
  await applyTransactions(db1, id, [paidTx('T1')]);
  assert.equal((await deliver(db1, id)).ok, true);
  await db1.end();
  const db = openConn();
  await applyTransactions(db, id, [paidTx('T1'), paidTx('T3', { datePaid: T0 + 12 })]);
  assert.equal((await deliver(db, id)).ok, false);
  const v = await orderView(db, id, T0);
  assert.equal(v.status, 'delivered');
  assert.equal(v.deliveries, 1);
});

test('f) concurrent reconciliations (webhook and polling at once) do not duplicate', async () => {
  const { db } = await newDb({ max: 4 }); const pey = feyPey([paidTx('T1')], 20); const id = await nueva(db, pey);
  const [r1, r2] = await Promise.all([reconcile(db, pey, id), reconcile(db, pey, id)]);
  assert.ok(r1.ok && r2.ok);
  assert.equal((await orderView(db, id, T0)).transactions.length, 1);
  assert.equal((await deliver(db, id)).ok, true);
  await reconcile(db, pey, id);
  assert.equal(await countDeliveries(db, id), 1);
});

test('a late payment, one of another amount, or PENDING do not enable delivery', async () => {
  const { db } = await newDb();
  let id = await nueva(db);
  await applyTransactions(db, id, [paidTx('T1', { datePaid: T0 + 361 })]);
  assert.equal((await orderView(db, id, T0)).late, true);
  assert.equal((await deliver(db, id)).ok, false);
  id = await nueva(db, feyPey([]));
  await applyTransactions(db, id, [paidTx('T2', { amountCents: 2 }), { id: 'T3', status: 'PENDING', amountCents: 1, currency: 'MXN' }]);
  assert.equal((await deliver(db, id)).ok, false);
});

test('a failed query does not change the status', async () => {
  const { db } = await newDb(); const id = await nueva(db);
  const pey = { listQrTransactions: async () => { throw new Error('503'); } };
  const r = await reconcile(db, pey, id);
  assert.equal(r.ok, false);
  assert.equal((await orderView(db, id, T0)).status, 'pending');
});
