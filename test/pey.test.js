import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearClientePey } from '../src/pey.js';

test('listQrTransactions recorre las páginas con nextToken y normaliza', async () => {
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
  const pey = crearClientePey({ apiKey: 'k-de-prueba', fetchFn });
  const txs = await pey.listQrTransactions('IDC 1');
  assert.deepEqual(txs.map((t) => [t.id, t.status, t.amountCents]), [['A', 'PAID', 1], ['B', 'PENDING', 1]]);
  assert.equal(urls[0], 'https://api.pey.mx/transaction/codi/qr/IDC%201');
  assert.equal(urls[1], 'https://api.pey.mx/transaction/codi/qr/IDC%201?nextToken=tok1');
});

test('un error de pey no filtra el cuerpo de la respuesta', async () => {
  const pey = crearClientePey({ apiKey: 'k', fetchFn: async () => ({ ok: false, status: 503, json: async () => ({ secreto: 'x' }) }) });
  await assert.rejects(() => pey.listQrTransactions('Q'), (e) => e.message === 'pey 503');
});

test('timeouts: crear y consultar cortan a tiempo con error genérico; createQr manda metadata', async () => {
  const colgado = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason)));
  const pey = crearClientePey({ apiKey: 'k', fetchFn: colgado, tiempos: { crear: 40, consulta: 40, paginacion: 100 } });
  const t0 = Date.now();
  await assert.rejects(() => pey.createQr({ amountCents: 1, concept: 'c', expiration: 360, numRef: '1', metadata: { intento: 'x' } }), (e) => e.message === 'pey timeout');
  await assert.rejects(() => pey.listQrTransactions('Q'), (e) => e.message === 'pey timeout');
  assert.ok(Date.now() - t0 < 1000);
  let cuerpo;
  const ok = crearClientePey({ apiKey: 'k', fetchFn: async (u, init) => { cuerpo = JSON.parse(init.body); return { ok: true, json: async () => ({ id: 'Q' }) }; } });
  await ok.createQr({ amountCents: 1, concept: 'c', expiration: 360, numRef: '1', metadata: { intento: 'x' } });
  assert.deepEqual(cuerpo.metadata, { intento: 'x' });
});

test('paginación: el presupuesto total corta aunque cada página sea rápida', async () => {
  const infinita = async () => { await new Promise((r) => setTimeout(r, 20)); return { ok: true, json: async () => ({ items: [], nextToken: 'sigue' }) }; };
  const pey = crearClientePey({ apiKey: 'k', fetchFn: infinita, tiempos: { consulta: 1000, paginacion: 120 } });
  const t0 = Date.now();
  await assert.rejects(() => pey.listQrTransactions('Q'), (e) => e.message === 'pey timeout');
  assert.ok(Date.now() - t0 < 600);
});
