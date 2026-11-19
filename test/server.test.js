import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaDb } from './helpers/pg.js';
import { ahora } from '../src/core.js';
import { crearServidor } from '../src/server.js';

const PIN = '1234';
async function arrancar(txs = []) {
  const { db } = await nuevaDb();
  let n = 0;
  const pey = { createQr: async () => ({ id: `QR${++n}`, qrString: 'cadena', qrImage: 'AAAA' }), listQrTransactions: async () => txs };
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
