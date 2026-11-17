import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaDb } from './helpers/pg.js';
import { ahora, crearOrden, vista } from '../src/core.js';
import { crearServidor } from '../src/server.js';

const PIN = '1234';
async function arrancar(txs = []) {
  const { db } = await nuevaDb();
  let n = 0;
  const pey = { createQr: async () => ({ id: `QR${++n}`, qrString: 'cadena', qrImage: 'AAAA' }), listQrTransactions: async (qrId) => (typeof txs === 'function' ? txs(qrId) : txs) };
  const srv = crearServidor({ db, pey, secret: 'x', pin: PIN, titular: 'Titular de prueba' });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const f = async (ruta, { pin = PIN, ...init } = {}) => {
    const r = await fetch(base + ruta, { ...init, headers: { 'x-pin': pin, 'content-type': 'application/json' } });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const crear = (monto = 0.01, extra = {}) => f('/api/ordenes', { method: 'POST', body: JSON.stringify({ concepto: 't', monto, ...extra }) });
  return { db, srv, f, crear, cerrar: () => srv.close() };
}

test('sin PIN o con PIN malo: 401 en todas las rutas de caja', async () => {
  const s = await arrancar();
  for (const ruta of ['/api/ordenes', '/api/metricas']) for (const pin of ['', 'mal']) assert.equal((await s.f(ruta, { pin })).status, 401);
  assert.equal((await s.f('/api/ordenes', { method: 'POST', pin: 'mal', body: '{}' })).status, 401);
  s.cerrar();
});

test('PIN: tras 10 fallos bloquea con 429 incluso con el PIN correcto', async () => {
  const s = await arrancar();
  for (let i = 0; i < 10; i++) assert.equal((await s.f('/api/metricas', { pin: 'mal' })).status, 401);
  assert.equal((await s.f('/api/metricas', { pin: 'mal' })).status, 429);
  assert.equal((await s.f('/api/metricas')).status, 429);
  s.cerrar();
});

test('tope de $50, monto inválido y máx. 3 cobros vivos', async () => {
  const s = await arrancar();
  assert.equal((await s.crear(50.01)).status, 400);
  assert.equal((await s.crear(0)).status, 400);
  assert.equal((await s.crear(50)).status, 201);
  assert.equal((await s.crear()).status, 201);
  assert.equal((await s.crear()).status, 201);
  assert.equal((await s.crear()).status, 409);
  s.cerrar();
});

test('el pagador ve su cobro por token sin PIN y sin transacciones ni ids internos', async () => {
  const s = await arrancar();
  const { body: o } = await s.crear(1);
  const r = await fetch(`${s.srv.address() && `http://127.0.0.1:${s.srv.address().port}`}/api/pago/${o.token}`);
  const p = await r.json();
  assert.equal(p.titular, 'Titular de prueba');
  assert.equal(p.montoCentavos, 100);
  assert.equal(p.transacciones, undefined);
  assert.equal(p.id, undefined);
  assert.equal(p.qr_id, undefined);
  assert.equal((await fetch(`http://127.0.0.1:${s.srv.address().port}/api/pago/${o.id}`)).status, 404); // el id numérico no sirve
  s.cerrar();
});

test('«tarjeta o efectivo» solo registra y mide aceptación; no crea cobro', async () => {
  const s = await arrancar();
  await s.crear(1);
  assert.equal((await s.crear(1, { metodo: 'otro' })).body.registrado, true);
  assert.equal((await s.f('/api/ordenes')).body.length, 1);
  assert.deepEqual((await s.f('/api/metricas')).body.aceptacionCodi, { codi: 1, otros: 1 });
  s.cerrar();
});

test('flujo: pago confirmado por conciliación, entregar una vez, métricas con pagada_en', async () => {
  const s = await arrancar([{ id: 'T1', status: 'PAID', amountCents: 100, currency: 'MXN', datePaid: ahora() + 2 }]);
  const { body: o } = await s.crear(1);
  assert.equal((await s.f(`/api/ordenes/${o.id}/entregar`, { method: 'POST' })).body.ok, false); // aún pendiente
  assert.equal((await s.f(`/api/ordenes/${o.id}/conciliar`, { method: 'POST' })).body.orden.estado, 'pagada');
  assert.equal((await s.f(`/api/ordenes/${o.id}/entregar`, { method: 'POST' })).body.ok, true);
  assert.equal((await s.f(`/api/ordenes/${o.id}/entregar`, { method: 'POST' })).body.ok, false);
  const m = (await s.f('/api/metricas')).body;
  assert.equal(m.entregadas, 1);
  assert.equal(m.maxEntregasPorOrden, 1);
  assert.equal(m.comisionEvitadaCentavos, 3); // 3% de 100 centavos
  assert.ok(m.segundosCobro >= 0);
  assert.ok((await s.db`SELECT pagada_en FROM ordenes`)[0].pagada_en);
  s.cerrar();
});

test('error de pey: 502 genérico sin filtrar detalle y sin dejar orden', async () => {
  const s = await arrancar();
  s.srv.close();
  const { db } = await nuevaDb();
  const srv = crearServidor({ db, pey: { createQr: async () => { throw new Error('secreto-interno'); } }, secret: 'x', pin: PIN });
  await new Promise((r) => srv.listen(0, r));
  const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/ordenes`, { method: 'POST', headers: { 'x-pin': PIN }, body: JSON.stringify({ concepto: 't', monto: 1 }) });
  assert.equal(r.status, 502);
  assert.ok(!(await r.text()).includes('secreto-interno'));
  assert.equal((await db`SELECT COUNT(*) n FROM ordenes`)[0].n, 0);
  srv.close();
});

test('páginas de caja y pagador se sirven; archivos fuera de las dos rutas, no', async () => {
  const s = await arrancar();
  const b = `http://127.0.0.1:${s.srv.address().port}`;
  assert.equal((await fetch(b + '/')).status, 200);
  assert.equal((await fetch(b + '/pagar/abc')).status, 200);
  for (const r of ['/.env', '/package.json', '/ya-cayo.sqlite', '/../.env']) assert.equal((await fetch(b + r)).status, 404);
  s.cerrar();
});

test('cabeceras de seguridad en caja, pagador y API', async () => {
  const s = await arrancar();
  for (const ruta of ['/', '/api/ordenes', '/health', '/nada']) {
    const r = await fetch(`http://127.0.0.1:${s.srv.address().port}${ruta}`);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', ruta);
    assert.equal(r.headers.get('x-frame-options'), 'DENY', ruta);
    assert.equal(r.headers.get('cache-control'), 'no-store', ruta);
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/, ruta);
  }
  s.cerrar();
});

test('GET del listado y GET del pagador concilian: un pago sin webhook se confirma al consultar', async () => {
  const pago = [{ id: 'T1', status: 'PAID', amountCents: 100, currency: 'MXN', datePaid: ahora() + 2 }];
  const a = await arrancar(pago);
  const { body: o1 } = await a.crear(1);
  const lista = (await a.f('/api/ordenes')).body;
  assert.equal(lista.find((x) => x.id === o1.id).estado, 'pagada'); // listado de la caja
  a.cerrar();
  const b = await arrancar(pago);
  const { body: o2 } = await b.crear(1);
  const r = await fetch(`http://127.0.0.1:${b.srv.address().port}/api/pago/${o2.token}`); // página del pagador, sin PIN
  assert.equal((await r.json()).estado, 'pagada');
  b.cerrar();
});

test('el listado concilia también las órdenes más viejas que las 20 mostradas, mientras sigan en la ventana', async () => {
  const s = await arrancar((qr) => (qr === 'Q1' ? [{ id: 'T1', status: 'PAID', amountCents: 100, currency: 'MXN', datePaid: ahora() + 2 }] : [])); // solo el QR de la vieja tiene pago
  let k = 0;
  const p = { createQr: async () => ({ id: `Q${++k}` }) };
  const { id: viejo } = await crearOrden(s.db, p, { concepto: 'vieja', montoCentavos: 100 }); // la única que coincide con el pago
  for (let i = 0; i < 21; i++) await crearOrden(s.db, p, { concepto: `t${i}`, montoCentavos: 1 });
  for (let i = 0; i < 5; i++) await s.f('/api/ordenes'); // 22 candidatas, 5 por consulta
  assert.equal((await vista(s.db, viejo)).estado, 'pagada'); // quedó fuera de las 20 mostradas
  s.cerrar();
});

test('sin proceso de fondo: el módulo de conciliación ya no programa timers', async () => {
  const mod = await import('../src/conciliacion.js');
  assert.equal(mod.iniciarPolling, undefined);
});

test('reintento del mismo intento por HTTP: misma orden y mismo QR, sin duplicar ni contar otro cobro vivo', async () => {
  const s = await arrancar();
  const a = await s.crear(1, { intento: 'intento-http-1' });
  const b = await s.crear(1, { intento: 'intento-http-1' });
  assert.equal(a.status, 201);
  assert.equal(b.body.id, a.body.id);
  assert.equal(b.body.qr_id, a.body.qr_id);
  assert.equal((await s.f('/api/ordenes')).body.length, 1);
  for (const i of ['x-intento-2', 'x-intento-3']) await s.crear(1, { intento: i });
  assert.equal((await s.crear(1, { intento: 'intento-http-1' })).body.id, a.body.id); // con 3 vivos, el reintento no es rechazado
  assert.equal((await s.crear(1, { intento: 'otro-intento-4' })).status, 409);
  s.cerrar();
});
