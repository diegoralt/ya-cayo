// Reconcile on read: 30-min window, atomic reservation across instances, per-read budget and durable pending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from './helpers/pg.js';
import { createOrder, reserve, orderView } from '../src/core.js';
import { reconcileOnRead, inWindow, interval, MAX_PER_QUERY, POST_WINDOW } from '../src/reconciliation.js';

const T0 = 1_000_000;
const pago = (id, extra = {}) => ({ id, status: 'PAID', amountCents: 1, currency: 'MXN', datePaid: T0 + 10, ...extra });
let n = 0;
function pey(txs = [], { demora = 0 } = {}) {
  const p = { consultas: 0 };
  p.createQr = async () => ({ id: `QR${++n}` });
  p.listQrTransactions = async () => {
    p.consultas++;
    if (demora) await new Promise((r) => setTimeout(r, demora));
    if (typeof txs === 'function') return txs();
    return txs;
  };
  return p;
}
const filas = (db) => db`SELECT id, qr_id, status, expires_at FROM orders WHERE qr_id IS NOT NULL ORDER BY id`;
const silent = { log: () => {} };

test('window and interval: live every 5 s, expired every 60 s up to 30 min, then never', () => {
  const o = { qr_id: 'Q', status: 'pending', expires_at: 1000 };
  assert.equal(interval(o, 990), 5);
  assert.equal(interval(o, 1100), 60);
  assert.equal(interval({ ...o, status: 'delivered' }, 990), 60);
  assert.equal(inWindow(o, 1000 + POST_WINDOW), true);
  assert.equal(inWindow(o, 1000 + POST_WINDOW + 1), false);
  assert.equal(inWindow({ ...o, qr_id: null }, 990), false);
});

test('reserve: only one takes it until it expires, also from independent connections', async () => {
  const { db, openConn } = await newDb();
  const rs = await Promise.all([reserve(db, 'k', 10, 100), reserve(openConn(), 'k', 10, 100), reserve(openConn(), 'k', 10, 100)]);
  assert.equal(rs.filter(Boolean).length, 1);
  assert.equal(await reserve(db, 'k', 10, 109), false);
  assert.equal(await reserve(db, 'k', 10, 110), true); // expired: it can be taken again
});

test('the list reconciles: a payment that arrives without a webhook is confirmed on read', async () => {
  const { db } = await newDb();
  const p = pey([pago('T1')]);
  const { id } = await createOrder(db, p, { concept: 't', amountCents: 1, now: T0 });
  await reconcileOnRead(db, p, await filas(db), { now: T0 + 20, ...silent });
  assert.equal((await orderView(db, id, T0 + 20)).status, 'paid');
});

test('two simultaneous reads from different instances: pey is queried only once', async () => {
  const { db, openConn } = await newDb();
  const p = pey([], { demora: 40 });
  await createOrder(db, p, { concept: 't', amountCents: 1, now: T0 });
  const orders = await filas(db);
  await Promise.all([reconcileOnRead(openConn(), p, orders, { now: T0 + 1, ...silent }), reconcileOnRead(openConn(), p, orders, { now: T0 + 1, ...silent })]);
  assert.equal(p.consultas, 1);
  await reconcileOnRead(db, p, orders, { now: T0 + 3, ...silent }); // within 5 s: no
  assert.equal(p.consultas, 1);
  await reconcileOnRead(db, p, orders, { now: T0 + 6, ...silent }); // after 5 s: yes
  assert.equal(p.consultas, 2);
});

test('outside the 30-min window it is not queried; delivered and expired ones inside it are', async () => {
  const { db } = await newDb();
  const p = pey([pago('T1')]);
  await createOrder(db, p, { concept: 't', amountCents: 1, now: T0 }); // expira T0+360
  const orders = await filas(db);
  await reconcileOnRead(db, p, orders, { now: T0 + 360 + POST_WINDOW + 1, ...silent });
  assert.equal(p.consultas, 0);
  await reconcileOnRead(db, p, orders, { now: T0 + 400, ...silent }); // expired but inside the window
  assert.equal(p.consultas, 1);
});

test('budget per read: the list of 20 does not reconcile more than MAX_PER_QUERY; the rest wait their turn', async () => {
  const { db } = await newDb();
  const p = pey([]);
  for (let i = 0; i < 8; i++) await createOrder(db, p, { concept: `t${i}`, amountCents: 1, now: T0 });
  const orders = await filas(db);
  await reconcileOnRead(db, p, orders, { now: T0 + 1, ...silent });
  assert.equal(p.consultas, MAX_PER_QUERY);
  await reconcileOnRead(db, p, orders, { now: T0 + 1, ...silent }); // the 5 reserved ones wait; the remaining 3 get in
  assert.equal(p.consultas, 8);
});

test('pey down: the order stays pending, is retried after 5 s even if it is a 60 s one, and after success waits 60 s', async () => {
  const { db } = await newDb();
  let caido = true;
  const p = pey(() => { if (caido) throw new Error('503'); return [pago('T1', { datePaid: T0 + 10 })]; });
  const { id } = await createOrder(db, p, { concept: 't', amountCents: 1, now: T0 });
  const orders = await filas(db);
  await reconcileOnRead(db, p, orders, { now: T0 + 400, ...silent }); // expired (interval 60) and fails
  assert.equal((await db`SELECT 1 FROM pending_reconciliation WHERE order_id=${id}`).length, 1);
  caido = false;
  await reconcileOnRead(db, p, orders, { now: T0 + 406, ...silent }); // 6 s later: the pending shortens the wait
  assert.equal(p.consultas, 2);
  assert.equal((await db`SELECT 1 FROM pending_reconciliation WHERE order_id=${id}`).length, 0);
  assert.equal((await orderView(db, id, T0 + 406)).status, 'paid');
  await reconcileOnRead(db, p, orders, { now: T0 + 430, ...silent }); // success at T0+406: the next one at 60 s
  assert.equal(p.consultas, 2);
  await reconcileOnRead(db, p, orders, { now: T0 + 467, ...silent });
  assert.equal(p.consultas, 3);
});

test('cut mid-reconciliation: the pending and the reservation survive and another instance picks it up', async () => {
  const { db, openConn } = await newDb();
  const hung = { ...pey(), listQrTransactions: () => new Promise(() => {}) }; // the function dies waiting on pey
  const { id } = await createOrder(db, pey(), { concept: 't', amountCents: 1, now: T0 });
  const orders = await filas(db);
  const t0 = Date.now();
  reconcileOnRead(db, hung, orders, { now: T0 + 1, ...silent }); // not awaited: «process cut»
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(Date.now() - t0 < 5000);
  assert.equal((await db`SELECT 1 FROM pending_reconciliation WHERE order_id=${id}`).length, 1);
  const p = pey([pago('T1')]);
  await reconcileOnRead(openConn(), p, orders, { now: T0 + 7, ...silent }); // another instance, reservation expired
  assert.equal((await orderView(db, id, T0 + 7)).status, 'paid');
  assert.equal((await db`SELECT 1 FROM pending_reconciliation WHERE order_id=${id}`).length, 0);
});
