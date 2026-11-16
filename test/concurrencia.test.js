// Conexiones independientes (una por instancia, como funciones de Vercel): las reglas deben salir del bloqueo en la BD.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaDb } from './helpers/pg.js';
import { crearOrden, aplicarTransacciones, conciliar, entregar, vista } from '../src/core.js';

const T0 = 1_000_000;
const pago = (id, extra = {}) => ({ id, status: 'PAID', amountCents: 1, currency: 'MXN', datePaid: T0 + 10, ...extra });
const pey = (txs, demora = 0) => ({
  createQr: async () => ({ id: 'QR1' }),
  listQrTransactions: async () => { if (demora) await new Promise((r) => setTimeout(r, demora)); return txs; },
});
async function dos() {
  const { db, abrir } = await nuevaDb();
  const { id } = await crearOrden(db, pey([]), { concepto: 't', montoCentavos: 1, now: T0 });
  return { db, id, a: abrir(), b: abrir() };
}

test('mismo pago conciliado a la vez desde dos conexiones: un hecho, una válida', async () => {
  const { db, id, a, b } = await dos();
  const p = pey([pago('T1')], 30);
  const [r1, r2] = await Promise.all([conciliar(a, p, id), conciliar(b, p, id)]);
  assert.ok(r1.ok && r2.ok);
  const v = await vista(db, id, T0);
  assert.deepEqual(v.transacciones.map((t) => t.clasificacion), ['valida']);
  assert.equal(v.estado, 'pagada');
});

test('dos pagos distintos a la vez: una válida y una duplicada, nunca dos válidas', async () => {
  const { db, id, a, b } = await dos();
  await Promise.all([aplicarTransacciones(a, id, [pago('T1')]), aplicarTransacciones(b, id, [pago('T2', { datePaid: T0 + 11 })])]);
  const v = await vista(db, id, T0);
  assert.deepEqual(v.transacciones.map((t) => t.clasificacion).sort(), ['duplicada', 'valida']);
  assert.equal(v.duplicado, true);
});

test('doble entrega simultánea desde dos conexiones: una sola gana y hay una entrega', async () => {
  const { db, id, a, b } = await dos();
  await aplicarTransacciones(db, id, [pago('T1')]);
  const rs = await Promise.all([entregar(a, id), entregar(b, id), entregar(db, id)]);
  assert.equal(rs.filter((r) => r.ok).length, 1);
  assert.equal((await vista(db, id, T0)).entregas, 1);
});

test('entregar compite con un pago nuevo: la entrega sigue siendo una y el segundo pago, duplicado', async () => {
  const { db, id, a, b } = await dos();
  await aplicarTransacciones(db, id, [pago('T1')]);
  await Promise.all([entregar(a, id), aplicarTransacciones(b, id, [pago('T1'), pago('T2', { datePaid: T0 + 12 })])]);
  const v = await vista(db, id, T0);
  assert.equal(v.estado, 'entregada');
  assert.equal(v.entregas, 1);
  assert.deepEqual(v.transacciones.map((t) => t.clasificacion).sort(), ['duplicada', 'valida']);
});
