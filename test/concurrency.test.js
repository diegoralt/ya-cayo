// Independent connections (one per instance, like Vercel functions): the rules must come from DB locking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from './helpers/pg.js';
import { createOrder, applyTransactions, reconcile, deliver, orderView } from '../src/core.js';

const T0 = 1_000_000;
const pago = (id, extra = {}) => ({ id, status: 'PAID', amountCents: 1, currency: 'MXN', datePaid: T0 + 10, ...extra });
const pey = (txs, demora = 0) => ({
  createQr: async () => ({ id: 'QR1' }),
  listQrTransactions: async () => { if (demora) await new Promise((r) => setTimeout(r, demora)); return txs; },
});
async function dos() {
  const { db, openConn } = await newDb();
  const { id } = await createOrder(db, pey([]), { concept: 't', amountCents: 1, now: T0 });
  return { db, id, a: openConn(), b: openConn() };
}

test('same payment reconciled at once from two connections: one fact, one valid', async () => {
  const { db, id, a, b } = await dos();
  const p = pey([pago('T1')], 30);
  const [r1, r2] = await Promise.all([reconcile(a, p, id), reconcile(b, p, id)]);
  assert.ok(r1.ok && r2.ok);
  const v = await orderView(db, id, T0);
  assert.deepEqual(v.transactions.map((t) => t.classification), ['valid']);
  assert.equal(v.status, 'paid');
});

test('two different payments at once: one valid and one duplicate, never two valid', async () => {
  const { db, id, a, b } = await dos();
  await Promise.all([applyTransactions(a, id, [pago('T1')]), applyTransactions(b, id, [pago('T2', { datePaid: T0 + 11 })])]);
  const v = await orderView(db, id, T0);
  assert.deepEqual(v.transactions.map((t) => t.classification).sort(), ['duplicate', 'valid']);
  assert.equal(v.duplicate, true);
});

test('double simultaneous delivery from two connections: only one wins and there is one delivery', async () => {
  const { db, id, a, b } = await dos();
  await applyTransactions(db, id, [pago('T1')]);
  const rs = await Promise.all([deliver(a, id), deliver(b, id), deliver(db, id)]);
  assert.equal(rs.filter((r) => r.ok).length, 1);
  assert.equal((await orderView(db, id, T0)).deliveries, 1);
});

test('deliver competes with a new payment: still one delivery and the second payment is a duplicate', async () => {
  const { db, id, a, b } = await dos();
  await applyTransactions(db, id, [pago('T1')]);
  await Promise.all([deliver(a, id), applyTransactions(b, id, [pago('T1'), pago('T2', { datePaid: T0 + 12 })])]);
  const v = await orderView(db, id, T0);
  assert.equal(v.status, 'delivered');
  assert.equal(v.deliveries, 1);
  assert.deepEqual(v.transactions.map((t) => t.classification).sort(), ['duplicate', 'valid']);
});
