import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaDb } from './helpers/pg.js';
import { crearOrden, aplicarTransacciones, conciliar, entregar, contarEntregas, vista } from '../src/core.js';

const T0 = 1_000_000;
const pagoOk = (id, extra = {}) => ({ id, status: 'PAID', amountCents: 1, currency: 'MXN', datePaid: T0 + 10, ...extra });
let nQr = 0;
const feyPey = (txs, demora = 0) => ({
  createQr: async () => ({ id: `QR${++nQr}` }),
  listQrTransactions: async () => { if (demora) await new Promise((r) => setTimeout(r, demora)); return txs; },
});
async function nueva(db, pey = feyPey([])) {
  const { id } = await crearOrden(db, pey, { concepto: 'ticket 1', montoCentavos: 1, now: T0 });
  return id;
}

test('a) reenvío secuencial: mismas transacciones dos veces = un hecho, una entrega', async () => {
  const { db } = await nuevaDb(); const id = await nueva(db);
  await aplicarTransacciones(db, id, [pagoOk('T1')]);
  await aplicarTransacciones(db, id, [pagoOk('T1')]);
  assert.equal((await vista(db, id, T0)).transacciones.length, 1);
  assert.equal((await entregar(db, id)).ok, true);
  assert.equal((await entregar(db, id)).ok, false);
  assert.equal(await contarEntregas(db, id), 1);
});

test('b) intercalación: GET A, GET B, confirmar A, entregar, aplicar B no reabre ni duplica', async () => {
  const { db } = await nuevaDb(); const id = await nueva(db);
  const A = [pagoOk('T1')], B = [pagoOk('T1'), pagoOk('T2', { datePaid: T0 + 20 })];
  await aplicarTransacciones(db, id, A);
  assert.equal((await entregar(db, id)).ok, true);
  await aplicarTransacciones(db, id, B);
  const v = await vista(db, id, T0);
  assert.equal(v.estado, 'entregada');
  assert.equal(v.entregas, 1);
  assert.deepEqual(v.transacciones.map((t) => t.clasificacion).sort(), ['duplicada', 'valida']);
});

test('c) dos transactionId distintos del mismo ticket: una válida, una duplicada, una sola entrega', async () => {
  const { db } = await nuevaDb(); const id = await nueva(db);
  await aplicarTransacciones(db, id, [pagoOk('T1'), pagoOk('T2', { datePaid: T0 + 11 })]);
  assert.equal((await vista(db, id, T0)).duplicado, true);
  assert.equal((await entregar(db, id)).ok, true);
  assert.equal((await entregar(db, id)).ok, false);
  assert.equal(await contarEntregas(db, id), 1);
});

test('d) fallo entre UPDATE e INSERT: rollback, sigue pagada y sin entrega extra', async () => {
  const { db } = await nuevaDb(); const id = await nueva(db);
  await aplicarTransacciones(db, id, [pagoOk('T1')]);
  await db`INSERT INTO entregas(orden_id, entregada_en) VALUES (${id}, ${T0})`; // estado corrupto a propósito
  await assert.rejects(entregar(db, id));
  assert.equal((await vista(db, id, T0)).estado, 'pagada');
  assert.equal(await contarEntregas(db, id), 1);
});

test('e) reinicio: el estado y la entrega única sobreviven a cerrar y reabrir la conexión', async () => {
  const { db: db1, abrir } = await nuevaDb(); const id = await nueva(db1);
  await aplicarTransacciones(db1, id, [pagoOk('T1')]);
  assert.equal((await entregar(db1, id)).ok, true);
  await db1.end();
  const db = abrir();
  await aplicarTransacciones(db, id, [pagoOk('T1'), pagoOk('T3', { datePaid: T0 + 12 })]);
  assert.equal((await entregar(db, id)).ok, false);
  const v = await vista(db, id, T0);
  assert.equal(v.estado, 'entregada');
  assert.equal(v.entregas, 1);
});

test('f) conciliaciones concurrentes (webhook y polling a la vez) no duplican', async () => {
  const { db } = await nuevaDb({ max: 4 }); const pey = feyPey([pagoOk('T1')], 20); const id = await nueva(db, pey);
  const [r1, r2] = await Promise.all([conciliar(db, pey, id), conciliar(db, pey, id)]);
  assert.ok(r1.ok && r2.ok);
  assert.equal((await vista(db, id, T0)).transacciones.length, 1);
  assert.equal((await entregar(db, id)).ok, true);
  await conciliar(db, pey, id);
  assert.equal(await contarEntregas(db, id), 1);
});

test('pago tardío, de otro monto o PENDING no habilitan la entrega', async () => {
  const { db } = await nuevaDb();
  let id = await nueva(db);
  await aplicarTransacciones(db, id, [pagoOk('T1', { datePaid: T0 + 361 })]);
  assert.equal((await vista(db, id, T0)).tardio, true);
  assert.equal((await entregar(db, id)).ok, false);
  id = await nueva(db, feyPey([]));
  await aplicarTransacciones(db, id, [pagoOk('T2', { amountCents: 2 }), { id: 'T3', status: 'PENDING', amountCents: 1, currency: 'MXN' }]);
  assert.equal((await entregar(db, id)).ok, false);
});

test('consulta fallida no cambia el estado', async () => {
  const { db } = await nuevaDb(); const id = await nueva(db);
  const pey = { listQrTransactions: async () => { throw new Error('503'); } };
  const r = await conciliar(db, pey, id);
  assert.equal(r.ok, false);
  assert.equal((await vista(db, id, T0)).estado, 'pendiente');
});
