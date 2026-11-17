import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDb } from './helpers/pg.js';
import { nowSec } from '../src/core.js';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createAppServer, createHandler } from '../src/server.js';

const PIN = '1234';
async function start(txs = [], { db: dada, ...opc } = {}) {
  const db = dada ?? (await newDb()).db;
  let n = 0;
  const pey = { createQr: async () => ({ id: `QR${++n}`, qrString: 'cadena', qrImage: 'AAAA' }), listQrTransactions: async () => txs };
  const srv = createAppServer({ db, pey, secret: 'x', pin: PIN, holder: 'Titular de prueba', ...opc });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const f = async (route, { pin = PIN, headers = {}, ...init } = {}) => {
    const r = await fetch(base + route, { ...init, headers: { 'x-pin': pin, 'content-type': 'application/json', ...headers } });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const create = (amount = 0.01, extra = {}) => f('/api/orders', { method: 'POST', body: JSON.stringify({ concept: 't', amount, ...extra }) });
  return { db, srv, f, create, close: () => srv.close() };
}

test('no PIN or a wrong PIN: 401 on all cashier routes', async () => {
  const s = await start();
  for (const route of ['/api/orders', '/api/metrics']) for (const pin of ['', 'mal']) assert.equal((await s.f(route, { pin })).status, 401);
  assert.equal((await s.f('/api/orders', { method: 'POST', pin: 'mal', body: '{}' })).status, 401);
  s.close();
});

test('PIN: after 10 failures it blocks with 429 even with the correct PIN', async () => {
  const s = await start();
  for (let i = 0; i < 10; i++) assert.equal((await s.f('/api/metrics', { pin: 'mal' })).status, 401);
  assert.equal((await s.f('/api/metrics', { pin: 'mal' })).status, 429);
  assert.equal((await s.f('/api/metrics')).status, 429);
  s.close();
});

test('$50 cap, invalid amount and max 3 live charges', async () => {
  const s = await start();
  assert.equal((await s.create(50.01)).status, 400);
  assert.equal((await s.create(0)).status, 400);
  assert.equal((await s.create(50)).status, 201);
  assert.equal((await s.create()).status, 201);
  assert.equal((await s.create()).status, 201);
  assert.equal((await s.create()).status, 409);
  s.close();
});

test('the payer sees their charge by token without a PIN and without transactions or internal ids', async () => {
  const s = await start();
  const { body: o } = await s.create(1);
  const r = await fetch(`${s.srv.address() && `http://127.0.0.1:${s.srv.address().port}`}/api/payment/${o.token}`);
  const p = await r.json();
  assert.equal(p.holder, 'Titular de prueba');
  assert.equal(p.amountCents, 100);
  assert.equal(p.transactions, undefined);
  assert.equal(p.id, undefined);
  assert.equal(p.qr_id, undefined);
  assert.equal((await fetch(`http://127.0.0.1:${s.srv.address().port}/api/payment/${o.id}`)).status, 404); // the numeric id does not work
  s.close();
});

test('«card or cash» only records and measures acceptance; it creates no charge', async () => {
  const s = await start();
  await s.create(1);
  assert.equal((await s.create(1, { method: 'other' })).body.recorded, true);
  assert.equal((await s.f('/api/orders')).body.length, 1);
  assert.deepEqual((await s.f('/api/metrics')).body.codiAcceptance, { codi: 1, other: 1 });
  s.close();
});

test('flow: payment confirmed by reconciliation, deliver once, metrics with paid_at', async () => {
  const s = await start([{ id: 'T1', status: 'PAID', amountCents: 100, currency: 'MXN', datePaid: nowSec() + 2 }]);
  const { body: o } = await s.create(1);
  assert.equal((await s.f(`/api/orders/${o.id}/deliver`, { method: 'POST' })).body.ok, false); // still pending
  assert.equal((await s.f(`/api/orders/${o.id}/reconcile`, { method: 'POST' })).body.order.status, 'paid');
  assert.equal((await s.f(`/api/orders/${o.id}/deliver`, { method: 'POST' })).body.ok, true);
  assert.equal((await s.f(`/api/orders/${o.id}/deliver`, { method: 'POST' })).body.ok, false);
  const m = (await s.f('/api/metrics')).body;
  assert.equal(m.delivered, 1);
  assert.equal(m.maxDeliveriesPerOrder, 1);
  assert.equal(m.avoidedFeeCents, 3); // 3% of 100 cents
  assert.ok(m.chargeSeconds >= 0);
  assert.ok((await s.db`SELECT paid_at FROM orders`)[0].paid_at);
  s.close();
});

test('pey error: generic 502 without leaking detail and without leaving an order', async () => {
  const s = await start();
  s.srv.close();
  const { db } = await newDb();
  const srv = createAppServer({ db, pey: { createQr: async () => { throw new Error('secreto-interno'); } }, secret: 'x', pin: PIN });
  await new Promise((r) => srv.listen(0, r));
  const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/orders`, { method: 'POST', headers: { 'x-pin': PIN }, body: JSON.stringify({ concept: 't', amount: 1 }) });
  assert.equal(r.status, 502);
  assert.ok(!(await r.text()).includes('secreto-interno'));
  assert.equal((await db`SELECT COUNT(*) n FROM orders`)[0].n, 0);
  srv.close();
});

test('cashier and payer pages are served; files outside the two routes are not', async () => {
  const s = await start();
  const b = `http://127.0.0.1:${s.srv.address().port}`;
  assert.equal((await fetch(b + '/')).status, 200);
  assert.equal((await fetch(b + '/pagar/abc')).status, 200);
  for (const r of ['/.env', '/package.json', '/ya-cayo.sqlite', '/../.env']) assert.equal((await fetch(b + r)).status, 404);
  s.close();
});

test('security headers on cashier, payer and API', async () => {
  const s = await start();
  for (const route of ['/', '/api/orders', '/health', '/nada']) {
    const r = await fetch(`http://127.0.0.1:${s.srv.address().port}${route}`);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', route);
    assert.equal(r.headers.get('x-frame-options'), 'DENY', route);
    assert.equal(r.headers.get('cache-control'), 'no-store', route);
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/, route);
  }
  s.close();
});

test('the list GET and the payer GET reconcile: a payment without a webhook is confirmed on read', async () => {
  const pago = [{ id: 'T1', status: 'PAID', amountCents: 100, currency: 'MXN', datePaid: nowSec() + 2 }];
  const a = await start(pago);
  const { body: o1 } = await a.create(1);
  const list = (await a.f('/api/orders')).body;
  assert.equal(list.find((x) => x.id === o1.id).status, 'paid'); // cashier list
  a.close();
  const b = await start(pago);
  const { body: o2 } = await b.create(1);
  const r = await fetch(`http://127.0.0.1:${b.srv.address().port}/api/payment/${o2.token}`); // payer page, no PIN
  assert.equal((await r.json()).status, 'paid');
  b.close();
});

test('no background process: the reconciliation module no longer schedules timers', async () => {
  const mod = await import('../src/reconciliation.js');
  assert.equal(mod.startPolling, undefined);
});

test('retry of the same attempt over HTTP: same order and same QR, without duplicating or counting another live charge', async () => {
  const s = await start();
  const a = await s.create(1, { attempt: 'attempt-http-1' });
  const b = await s.create(1, { attempt: 'attempt-http-1' });
  assert.equal(a.status, 201);
  assert.equal(b.body.id, a.body.id);
  assert.equal(b.body.qr_id, a.body.qr_id);
  assert.equal((await s.f('/api/orders')).body.length, 1);
  for (const i of ['x-attempt-2', 'x-attempt-3']) await s.create(1, { attempt: i });
  assert.equal((await s.create(1, { attempt: 'attempt-http-1' })).body.id, a.body.id); // with 3 live, the retry is not rejected
  assert.equal((await s.create(1, { attempt: 'otro-attempt-4' })).status, 409);
  s.close();
});

test('4 simultaneous POSTs with different attempts: at most 3 live (atomic quota in the DB)', async () => {
  const s = await start();
  const r = await Promise.all([1, 2, 3, 4].map((i) => s.create(1, { attempt: `simultaneo-${i}` })));
  assert.deepEqual(r.map((x) => x.status).sort(), [201, 201, 201, 409]);
  assert.equal((await s.f('/api/orders')).body.length, 3);
  s.close();
});

test('PIN: the counter lives in the DB; two instances share it and a forged header does not evade the limit', async () => {
  const { db, openConn } = await newDb();
  const a = await start([], { db }), b = await start([], { db: openConn() });
  for (let i = 0; i < 5; i++) {
    assert.equal((await a.f('/api/metrics', { pin: 'mal', headers: { 'x-vercel-forwarded-for': `9.9.9.${i}` } })).status, 401);
    assert.equal((await b.f('/api/metrics', { pin: 'mal', headers: { 'x-forwarded-for': `8.8.8.${i}` } })).status, 401);
  }
  const r = await b.f('/api/metrics'); // onVercel=false: the header is ignored and it is the same IP
  assert.equal(r.status, 429);
  assert.equal((await a.f('/api/metrics')).status, 429);
  a.close(); b.close();
});

test('PIN on Vercel: the limit is per IP from the Vercel header, not global', async () => {
  const s = await start([], { onVercel: true });
  const h = (ip) => ({ 'x-vercel-forwarded-for': ip });
  for (let i = 0; i < 10; i++) await s.f('/api/metrics', { pin: 'mal', headers: h('1.1.1.1') });
  assert.equal((await s.f('/api/metrics', { headers: h('1.1.1.1') })).status, 429);
  assert.equal((await s.f('/api/metrics', { headers: h('2.2.2.2') })).status, 200);
  s.close();
});

test('createHandler works without its own server (as on Vercel) and does not serve pages; vercel.json routes them', async () => {
  const { db } = await newDb();
  const srv = createServer(createHandler({ db, pey: {}, secret: 'x', pin: PIN }));
  await new Promise((r) => srv.listen(0, r));
  const b = `http://127.0.0.1:${srv.address().port}`;
  assert.equal((await fetch(b + '/health')).status, 200);
  assert.equal((await fetch(b + '/api/orders')).status, 401);
  assert.equal((await fetch(b + '/')).status, 404); // the pages are static on Vercel
  srv.close();
  const v = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const destino = Object.fromEntries(v.rewrites.map((r) => [r.source, r.destination]));
  assert.deepEqual(destino, { '/': '/caja.html', '/pagar/:token': '/pagar.html', '/api/:path*': '/api/index', '/webhook': '/api/index', '/health': '/api/index' });
  assert.ok(v.headers[0].headers.some((h) => h.key === 'content-security-policy'));
});
