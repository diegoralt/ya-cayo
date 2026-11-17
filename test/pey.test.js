import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPeyClient } from '../src/pey.js';

test('listQrTransactions walks the pages with nextToken and normalizes', async () => {
  const urls = [];
  const paginas = [
    { items: [{ id: 'A', status: 'PAID', amount: 0.01, currency: 'MXN', datePaid: 100 }], nextToken: 'tok1' },
    { items: [{ id: 'B', status: 'PENDING', amount: 0.01, currency: 'MXN' }], nextToken: null },
  ];
  const fetchFn = async (url, init) => {
    urls.push(url);
    assert.match(init.headers.authorization, /^Bearer /);
    return { ok: true, json: async () => paginas[urls.length - 1] };
  };
  const pey = createPeyClient({ apiKey: 'k-de-prueba', fetchFn });
  const txs = await pey.listQrTransactions('IDC 1');
  assert.deepEqual(txs.map((t) => [t.id, t.status, t.amountCents]), [['A', 'PAID', 1], ['B', 'PENDING', 1]]);
  assert.equal(urls[0], 'https://api.pey.mx/transaction/codi/qr/IDC%201');
  assert.equal(urls[1], 'https://api.pey.mx/transaction/codi/qr/IDC%201?nextToken=tok1');
});

test('a pey error does not leak the response body', async () => {
  const pey = createPeyClient({ apiKey: 'k', fetchFn: async () => ({ ok: false, status: 503, json: async () => ({ secreto: 'x' }) }) });
  await assert.rejects(() => pey.listQrTransactions('Q'), (e) => e.message === 'pey 503');
});

test('timeouts: create and query cut off in time with a generic error; createQr sends metadata', async () => {
  const hung = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason)));
  const pey = createPeyClient({ apiKey: 'k', fetchFn: hung, timeouts: { create: 40, query: 40, pagination: 100 } });
  const t0 = Date.now();
  await assert.rejects(() => pey.createQr({ amountCents: 1, concept: 'c', expiration: 360, numRef: '1', metadata: { attempt: 'x' } }), (e) => e.message === 'pey timeout');
  await assert.rejects(() => pey.listQrTransactions('Q'), (e) => e.message === 'pey timeout');
  assert.ok(Date.now() - t0 < 1000);
  let body;
  const ok = createPeyClient({ apiKey: 'k', fetchFn: async (u, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ id: 'Q' }) }; } });
  await ok.createQr({ amountCents: 1, concept: 'c', expiration: 360, numRef: '1', metadata: { attempt: 'x' } });
  assert.deepEqual(body.metadata, { attempt: 'x' });
});

test('pagination: the total budget cuts off even if each page is fast', async () => {
  const endless = async () => { await new Promise((r) => setTimeout(r, 20)); return { ok: true, json: async () => ({ items: [], nextToken: 'sigue' }) }; };
  const pey = createPeyClient({ apiKey: 'k', fetchFn: endless, timeouts: { query: 1000, pagination: 120 } });
  const t0 = Date.now();
  await assert.rejects(() => pey.listQrTransactions('Q'), (e) => e.message === 'pey timeout');
  assert.ok(Date.now() - t0 < 600);
});
