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
