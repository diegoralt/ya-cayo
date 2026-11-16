import { test } from 'node:test';
import assert from 'node:assert/strict';
import sw from 'standardwebhooks';
import { nuevaDb } from './helpers/pg.js';
import { crearOrden, entregar, vista, conciliar, ahora } from '../src/core.js';
import { manejarWebhook } from '../src/conciliacion.js';
import { normalizarTx } from '../src/pey.js';
const { Webhook } = sw;

const SECRETO = 'whsec_' + Buffer.from('secreto-de-prueba-0123456789abcdef').toString('base64');
const wh = new Webhook(SECRETO);
const T = ahora();
let n = 0;
function firmar(cuerpo, id = `msg_${++n}`, ts = new Date()) {
  return { 'webhook-id': id, 'webhook-timestamp': String(Math.floor(ts.getTime() / 1000)), 'webhook-signature': wh.sign(id, ts, cuerpo) };
}
const evento = (qr) => JSON.stringify({ type: 'codi.qr.payment_received', data: { codiQrId: qr, transactionId: 'T1', amount: 0.01 } });
const tx = (extra = {}) => ({ id: 'T1', status: 'PAID', amountCents: 1, currency: 'MXN', datePaid: T + 5, ...extra });

async function escenario(txs) {
  const { db } = await nuevaDb();
  let lista = txs;
  const pey = { createQr: async () => ({ id: `QR${++n}` }), listQrTransactions: async () => (typeof lista === 'function' ? lista() : lista) };
  const { id, qr } = await crearOrden(db, pey, { concepto: 't', montoCentavos: 1, now: T });
  return { db, pey, id, qr: qr.id, set: (x) => (lista = x) };
}

test('firma ausente, incorrecta o cuerpo alterado: 401 y sin cambio de estado', async () => {
  const { db, pey, id, qr } = await escenario([tx()]);
  const cuerpo = evento(qr);
  const buena = firmar(cuerpo);
  for (const [c, h] of [
    [cuerpo, {}],
    [cuerpo, { ...buena, 'webhook-signature': 'v1,AAAA' }],
    [cuerpo + ' ', buena],
    [cuerpo, firmar(cuerpo, 'x', new Date(Date.now() - 3600_000))], // timestamp fuera de tolerancia
  ]) assert.equal(await manejarWebhook({ db, pey, secret: SECRETO }, c, h), 401);
  assert.equal((await vista(db, id)).estado, 'pendiente');
  assert.equal((await db`SELECT COUNT(*) n FROM eventos`)[0].n, 0);
});

test('webhook firmado dispara la conciliación y reenvío del mismo evento deja una entrega', async () => {
  const { db, pey, id, qr } = await escenario([tx()]);
  const cuerpo = evento(qr), h = firmar(cuerpo, 'msg_fijo');
  assert.equal(await manejarWebhook({ db, pey, secret: SECRETO }, cuerpo, h), 200);
  assert.equal(await manejarWebhook({ db, pey, secret: SECRETO }, cuerpo, h), 200);
  assert.equal((await vista(db, id)).estado, 'pagada');
  assert.equal((await entregar(db, id)).ok, true);
  assert.equal(await manejarWebhook({ db, pey, secret: SECRETO }, cuerpo, h), 200);
  assert.equal((await vista(db, id)).entregas, 1);
  assert.equal((await db`SELECT COUNT(*) n FROM eventos`)[0].n, 1);
});

test('el webhook no basta: si la consulta a pey no muestra el pago, no se habilita nada', async () => {
  const { db, pey, id, qr } = await escenario([]);
  const cuerpo = evento(qr);
  assert.equal(await manejarWebhook({ db, pey, secret: SECRETO }, cuerpo, firmar(cuerpo)), 200);
  assert.equal((await vista(db, id)).estado, 'pendiente');
  assert.equal((await entregar(db, id)).ok, false);
});

test('consulta caída: 503 para invitar al reintento y estado intacto', async () => {
  const { db, pey, id, qr, set } = await escenario([]);
  set(() => { throw new Error('503'); });
  const cuerpo = evento(qr);
  assert.equal(await manejarWebhook({ db, pey, secret: SECRETO }, cuerpo, firmar(cuerpo)), 503);
  assert.equal((await vista(db, id)).estado, 'pendiente');
});

test('firmado de otro QR u otro tipo de evento: 200 sin efecto', async () => {
  const { db, pey, id } = await escenario([tx()]);
  for (const c of [evento('QR-ajeno'), JSON.stringify({ type: 'bank.account.updated', data: {} })])
    assert.equal(await manejarWebhook({ db, pey, secret: SECRETO }, c, firmar(c)), 200);
  assert.equal((await vista(db, id)).estado, 'pendiente');
});

test('webhook ausente: el polling encuentra el pago anterior al vencimiento que aparece después', async () => {
  const { db, pey, id, qr, set } = await escenario([]);
  await conciliar(db, pey, id);
  assert.equal((await vista(db, id)).estado, 'pendiente');
  set([tx({ datePaid: T + 359 })]); // pagó antes de vencer; pey lo muestra tarde
  await conciliar(db, pey, id);
  assert.equal((await vista(db, id, T + 400)).estado, 'pagada');
});

test('pago posterior al vencimiento: tardío, sin entrega; segundo pago tras entregar: duplicado, contador 1', async () => {
  const a = await escenario([tx({ datePaid: T + 361 })]);
  await conciliar(a.db, a.pey, a.id);
  assert.equal((await vista(a.db, a.id)).tardio, true);
  assert.equal((await entregar(a.db, a.id)).ok, false);
  const b = await escenario([tx()]);
  await conciliar(b.db, b.pey, b.id);
  assert.equal((await entregar(b.db, b.id)).ok, true);
  b.set([tx(), tx({ id: 'T2', datePaid: T + 20 })]);
  await conciliar(b.db, b.pey, b.id);
  const v = await vista(b.db, b.id);
  assert.equal(v.duplicado, true);
  assert.equal(v.entregas, 1);
});

test('recibido vs procesado: un 503 deja el evento sin procesar y el mismo webhook-id se reintenta', async () => {
  const { db, pey, id, qr, set } = await escenario([]);
  const cuerpo = evento(qr), h = firmar(cuerpo, 'msg_503');
  set(() => { throw new Error('503'); });
  assert.equal(await manejarWebhook({ db, pey, secret: SECRETO }, cuerpo, h), 503);
  const [e] = await db`SELECT recibido_en, procesado_en FROM eventos WHERE webhook_id='msg_503'`;
  assert.ok(e.recibido_en && e.procesado_en === null);
  assert.equal((await db`SELECT 1 FROM conciliacion_pendiente WHERE orden_id=${id}`).length, 1); // pendiente durable
  set([tx()]);
  assert.equal(await manejarWebhook({ db, pey, secret: SECRETO }, cuerpo, h), 200); // reintento con el mismo id sí procesa
  assert.equal((await vista(db, id)).estado, 'pagada');
  assert.ok((await db`SELECT procesado_en FROM eventos WHERE webhook_id='msg_503'`)[0].procesado_en);
  assert.equal((await db`SELECT 1 FROM conciliacion_pendiente WHERE orden_id=${id}`).length, 0);
});

test('evento ya procesado: el reenvío responde 200 sin volver a consultar a pey', async () => {
  const { db, pey, qr } = await escenario([tx()]);
  let consultas = 0;
  const contador = { ...pey, listQrTransactions: async (q) => { consultas++; return pey.listQrTransactions(q); } };
  const cuerpo = evento(qr), h = firmar(cuerpo, 'msg_dup');
  await manejarWebhook({ db, pey: contador, secret: SECRETO }, cuerpo, h);
  await manejarWebhook({ db, pey: contador, secret: SECRETO }, cuerpo, h);
  assert.equal(consultas, 1);
});

test('normalizarTx convierte pesos a centavos y fechas ISO a Unix', () => {
  assert.deepEqual(normalizarTx({ id: 'A', status: 'PAID', amount: 0.01, currency: 'MXN', datePaid: '2026-11-14T12:00:00Z' }),
    { id: 'A', status: 'PAID', amountCents: 1, currency: 'MXN', datePaid: 1794657600 });
});
