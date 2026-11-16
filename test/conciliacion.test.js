// Conciliación al consultar: ventana de 30 min, reserva atómica entre instancias, presupuesto por consulta y pendiente durable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaDb } from './helpers/pg.js';
import { crearOrden, reservar, vista } from '../src/core.js';
import { conciliarAlConsultar, enVentana, intervalo, MAX_POR_CONSULTA, VENTANA_POST } from '../src/conciliacion.js';

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
const filas = (db) => db`SELECT id, qr_id, estado, expira_en FROM ordenes WHERE qr_id IS NOT NULL ORDER BY id`;
const silencio = { log: () => {} };

test('ventana e intervalo: viva cada 5 s, vencida cada 60 s hasta 30 min, luego nunca', () => {
  const o = { qr_id: 'Q', estado: 'pendiente', expira_en: 1000 };
  assert.equal(intervalo(o, 990), 5);
  assert.equal(intervalo(o, 1100), 60);
  assert.equal(intervalo({ ...o, estado: 'entregada' }, 990), 60);
  assert.equal(enVentana(o, 1000 + VENTANA_POST), true);
  assert.equal(enVentana(o, 1000 + VENTANA_POST + 1), false);
  assert.equal(enVentana({ ...o, qr_id: null }, 990), false);
});

test('reservar: solo uno la toma hasta que vence, también desde conexiones independientes', async () => {
  const { db, abrir } = await nuevaDb();
  const rs = await Promise.all([reservar(db, 'k', 10, 100), reservar(abrir(), 'k', 10, 100), reservar(abrir(), 'k', 10, 100)]);
  assert.equal(rs.filter(Boolean).length, 1);
  assert.equal(await reservar(db, 'k', 10, 109), false);
  assert.equal(await reservar(db, 'k', 10, 110), true); // vencida: se vuelve a tomar
});

test('el listado concilia: un pago que llega sin webhook se confirma al consultar', async () => {
  const { db } = await nuevaDb();
  const p = pey([pago('T1')]);
  const { id } = await crearOrden(db, p, { concepto: 't', montoCentavos: 1, now: T0 });
  await conciliarAlConsultar(db, p, await filas(db), { now: T0 + 20, ...silencio });
  assert.equal((await vista(db, id, T0 + 20)).estado, 'pagada');
});

test('dos consultas simultáneas desde instancias distintas: pey se consulta una sola vez', async () => {
  const { db, abrir } = await nuevaDb();
  const p = pey([], { demora: 40 });
  await crearOrden(db, p, { concepto: 't', montoCentavos: 1, now: T0 });
  const ordenes = await filas(db);
  await Promise.all([conciliarAlConsultar(abrir(), p, ordenes, { now: T0 + 1, ...silencio }), conciliarAlConsultar(abrir(), p, ordenes, { now: T0 + 1, ...silencio })]);
  assert.equal(p.consultas, 1);
  await conciliarAlConsultar(db, p, ordenes, { now: T0 + 3, ...silencio }); // dentro de los 5 s: no
  assert.equal(p.consultas, 1);
  await conciliarAlConsultar(db, p, ordenes, { now: T0 + 6, ...silencio }); // pasados 5 s: sí
  assert.equal(p.consultas, 2);
});

test('fuera de la ventana de 30 min no se consulta; entregadas y vencidas dentro de ella, sí', async () => {
  const { db } = await nuevaDb();
  const p = pey([pago('T1')]);
  await crearOrden(db, p, { concepto: 't', montoCentavos: 1, now: T0 }); // expira T0+360
  const ordenes = await filas(db);
  await conciliarAlConsultar(db, p, ordenes, { now: T0 + 360 + VENTANA_POST + 1, ...silencio });
  assert.equal(p.consultas, 0);
  await conciliarAlConsultar(db, p, ordenes, { now: T0 + 400, ...silencio }); // vencida pero dentro de la ventana
  assert.equal(p.consultas, 1);
});

test('presupuesto por consulta: el listado de 20 no concilia más de MAX_POR_CONSULTA; el resto toca después', async () => {
  const { db } = await nuevaDb();
  const p = pey([]);
  for (let i = 0; i < 8; i++) await crearOrden(db, p, { concepto: `t${i}`, montoCentavos: 1, now: T0 });
  const ordenes = await filas(db);
  await conciliarAlConsultar(db, p, ordenes, { now: T0 + 1, ...silencio });
  assert.equal(p.consultas, MAX_POR_CONSULTA);
  await conciliarAlConsultar(db, p, ordenes, { now: T0 + 1, ...silencio }); // las 5 reservadas esperan; entran las 3 restantes
  assert.equal(p.consultas, 8);
});

test('pey caído: la orden queda pendiente, se reintenta a los 5 s aunque sea de las de 60 s, y tras el éxito espera 60 s', async () => {
  const { db } = await nuevaDb();
  let caido = true;
  const p = pey(() => { if (caido) throw new Error('503'); return [pago('T1', { datePaid: T0 + 10 })]; });
  const { id } = await crearOrden(db, p, { concepto: 't', montoCentavos: 1, now: T0 });
  const ordenes = await filas(db);
  await conciliarAlConsultar(db, p, ordenes, { now: T0 + 400, ...silencio }); // vencida (intervalo 60) y falla
  assert.equal((await db`SELECT 1 FROM conciliacion_pendiente WHERE orden_id=${id}`).length, 1);
  caido = false;
  await conciliarAlConsultar(db, p, ordenes, { now: T0 + 406, ...silencio }); // 6 s después: el pendiente acorta la espera
  assert.equal(p.consultas, 2);
  assert.equal((await db`SELECT 1 FROM conciliacion_pendiente WHERE orden_id=${id}`).length, 0);
  assert.equal((await vista(db, id, T0 + 406)).estado, 'pagada');
  await conciliarAlConsultar(db, p, ordenes, { now: T0 + 430, ...silencio }); // éxito en T0+406: la siguiente a los 60 s
  assert.equal(p.consultas, 2);
  await conciliarAlConsultar(db, p, ordenes, { now: T0 + 467, ...silencio });
  assert.equal(p.consultas, 3);
});

test('corte a media conciliación: el pendiente y la reserva sobreviven y otra instancia lo retoma', async () => {
  const { db, abrir } = await nuevaDb();
  const colgada = { ...pey(), listQrTransactions: () => new Promise(() => {}) }; // la función muere esperando a pey
  const { id } = await crearOrden(db, pey(), { concepto: 't', montoCentavos: 1, now: T0 });
  const ordenes = await filas(db);
  const t0 = Date.now();
  conciliarAlConsultar(db, colgada, ordenes, { now: T0 + 1, ...silencio }); // no se espera: «proceso cortado»
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(Date.now() - t0 < 5000);
  assert.equal((await db`SELECT 1 FROM conciliacion_pendiente WHERE orden_id=${id}`).length, 1);
  const p = pey([pago('T1')]);
  await conciliarAlConsultar(abrir(), p, ordenes, { now: T0 + 7, ...silencio }); // otra instancia, vencida la reserva
  assert.equal((await vista(db, id, T0 + 7)).estado, 'pagada');
  assert.equal((await db`SELECT 1 FROM conciliacion_pendiente WHERE orden_id=${id}`).length, 0);
});
