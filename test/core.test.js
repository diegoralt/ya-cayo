import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, crearOrden, aplicarTransacciones, conciliar, entregar, contarEntregas, vista } from '../src/core.js';

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
  const db = openDb(); const id = await nueva(db);
  aplicarTransacciones(db, id, [pagoOk('T1')]);
  aplicarTransacciones(db, id, [pagoOk('T1')]);
  assert.equal(vista(db, id, T0).transacciones.length, 1);
  assert.equal(entregar(db, id).ok, true);
  assert.equal(entregar(db, id).ok, false);
  assert.equal(contarEntregas(db, id), 1);
});

test('b) intercalación: GET A, GET B, confirmar A, entregar, aplicar B no reabre ni duplica', async () => {
  const db = openDb(); const id = await nueva(db);
  const A = [pagoOk('T1')], B = [pagoOk('T1'), pagoOk('T2', { datePaid: T0 + 20 })];
  aplicarTransacciones(db, id, A);
  assert.equal(entregar(db, id).ok, true);
  aplicarTransacciones(db, id, B);
  const v = vista(db, id, T0);
  assert.equal(v.estado, 'entregada');
  assert.equal(v.entregas, 1);
  assert.deepEqual(v.transacciones.map((t) => t.clasificacion).sort(), ['duplicada', 'valida']);
});

test('c) dos transactionId distintos del mismo ticket: una válida, una duplicada, una sola entrega', async () => {
  const db = openDb(); const id = await nueva(db);
  aplicarTransacciones(db, id, [pagoOk('T1'), pagoOk('T2', { datePaid: T0 + 11 })]);
  assert.equal(vista(db, id, T0).duplicado, true);
  assert.equal(entregar(db, id).ok, true);
  assert.equal(entregar(db, id).ok, false);
  assert.equal(contarEntregas(db, id), 1);
});

test('d) fallo entre UPDATE e INSERT: rollback, sigue pagada y sin entrega extra', async () => {
  const db = openDb(); const id = await nueva(db);
  aplicarTransacciones(db, id, [pagoOk('T1')]);
  db.prepare('INSERT INTO entregas(orden_id, entregada_en) VALUES (?,?)').run(id, T0); // estado corrupto a propósito
  assert.throws(() => entregar(db, id));
  assert.equal(vista(db, id, T0).estado, 'pagada');
  assert.equal(contarEntregas(db, id), 1);
});

test('e) reinicio: el estado y la entrega única sobreviven a cerrar y reabrir la base', async () => {
  const ruta = join(mkdtempSync(join(tmpdir(), 'yc-')), 'db.sqlite');
  let db = openDb(ruta); const id = await nueva(db);
  aplicarTransacciones(db, id, [pagoOk('T1')]);
  assert.equal(entregar(db, id).ok, true);
  db.close();
  db = openDb(ruta);
  aplicarTransacciones(db, id, [pagoOk('T1'), pagoOk('T3', { datePaid: T0 + 12 })]);
  assert.equal(entregar(db, id).ok, false);
  const v = vista(db, id, T0);
  assert.equal(v.estado, 'entregada');
  assert.equal(v.entregas, 1);
});

test('f) conciliaciones concurrentes (webhook y polling a la vez) no duplican', async () => {
  const db = openDb(); const pey = feyPey([pagoOk('T1')], 20); const id = await nueva(db, pey);
  const [r1, r2] = await Promise.all([conciliar(db, pey, id), conciliar(db, pey, id)]);
  assert.ok(r1.ok && r2.ok);
  assert.equal(vista(db, id, T0).transacciones.length, 1);
  assert.equal(entregar(db, id).ok, true);
  await conciliar(db, pey, id);
  assert.equal(contarEntregas(db, id), 1);
});

test('pago tardío, de otro monto o PENDING no habilitan la entrega', async () => {
  const db = openDb();
  let id = await nueva(db);
  aplicarTransacciones(db, id, [pagoOk('T1', { datePaid: T0 + 361 })]);
  assert.equal(vista(db, id, T0).tardio, true);
  assert.equal(entregar(db, id).ok, false);
  id = await nueva(db, feyPey([]));
  aplicarTransacciones(db, id, [pagoOk('T2', { amountCents: 2 }), { id: 'T3', status: 'PENDING', amountCents: 1, currency: 'MXN' }]);
  assert.equal(entregar(db, id).ok, false);
});

test('consulta fallida no cambia el estado', async () => {
  const db = openDb(); const id = await nueva(db);
  const pey = { listQrTransactions: async () => { throw new Error('503'); } };
  const r = await conciliar(db, pey, id);
  assert.equal(r.ok, false);
  assert.equal(vista(db, id, T0).estado, 'pendiente');
});
