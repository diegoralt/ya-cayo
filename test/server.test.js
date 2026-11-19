import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaDb } from './helpers/pg.js';
import { ahora, crearOrden, vista } from '../src/core.js';
import { crearServidor } from '../src/server.js';

const PIN = '1234';
async function arrancar(txs = [], { db: dada, ...opc } = {}) {
  const db = dada ?? (await nuevaDb()).db;
  let n = 0;
  const pey = { createQr: async () => ({ id: `QR${++n}`, qrString: 'cadena', qrImage: 'AAAA' }), listQrTransactions: async (qrId) => (typeof txs === 'function' ? txs(qrId) : txs) };
  const srv = crearServidor({ db, pey, secret: 'x', pin: PIN, titular: 'Titular de prueba', ...opc });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const f = async (ruta, { pin = PIN, headers = {}, ...init } = {}) => {
    const r = await fetch(base + ruta, { ...init, headers: { 'x-pin': pin, 'content-type': 'application/json', ...headers } });
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

test('intento atascado (sin qr_id): cuenta como cobro vivo y su reintento se completa sin superar el tope', async () => {
  const s = await arrancar();
  await db_atascado(s.db);
  for (const i of ['v-intento-1', 'v-intento-2']) assert.equal((await s.crear(1, { intento: i })).status, 201);
  assert.equal((await s.crear(1, { intento: 'v-intento-3' })).status, 409); // 2 + el atascado = 3
  await s.db`UPDATE ordenes SET creando_desde = creando_desde - 100 WHERE intento='atascado-1'`; // pasado el plazo de relevo
  assert.equal((await s.crear(1, { intento: 'atascado-1' })).status, 201);
  assert.equal((await s.db`SELECT count(*) n FROM ordenes WHERE qr_id IS NOT NULL`)[0].n, 3);
  s.cerrar();
});
test('intento atascado ya vencido: no cuenta, y su reintento con el cupo lleno recibe 409 sin revivirlo', async () => {
  const s = await arrancar();
  const t = ahora();
  await s.db`INSERT INTO ordenes(concepto, monto_centavos, creada_en, expira_en, token, intento, creando_desde) VALUES ('t', 100, ${t - 900}, ${t - 500}, 'tok-venc', 'vencido-1', ${t - 900})`;
  for (const i of ['w-intento-1', 'w-intento-2', 'w-intento-3']) assert.equal((await s.crear(1, { intento: i })).status, 201);
  assert.equal((await s.crear(1, { intento: 'vencido-1' })).status, 409);
  assert.equal((await s.db`SELECT count(*) n FROM ordenes WHERE qr_id IS NOT NULL`)[0].n, 3);
  assert.ok((await s.db`SELECT expira_en FROM ordenes WHERE intento='vencido-1'`)[0].expira_en < t);
  s.cerrar();
});

test('PIN: ráfaga de 20 intentos malos simultáneos: 10 reciben 401 y 10 reciben 429', async () => {
  const s = await arrancar();
  const r = await Promise.all(Array.from({ length: 20 }, () => s.f('/api/metricas', { pin: 'mal' })));
  assert.equal(r.filter((x) => x.status === 401).length, 10);
  assert.equal(r.filter((x) => x.status === 429).length, 10);
  s.cerrar();
});

test('PIN: aciertos concurrentes con 9 fallos previos no dejan el contador pegado; los rechazados liberan su reserva', async () => {
  const s = await arrancar();
  for (let i = 0; i < 9; i++) assert.equal((await s.f('/api/metricas', { pin: 'mal' })).status, 401);
  const r = await Promise.all(Array.from({ length: 5 }, () => s.f('/api/metricas')));
  assert.ok(r.every((x) => x.status === 200 || x.status === 429));
  assert.equal(Number((await s.db`SELECT valor FROM limites WHERE clave LIKE 'pin:%'`)[0].valor), 9);
  assert.equal((await s.f('/api/metricas')).status, 200);
  assert.equal((await s.f('/api/metricas', { pin: 'mal' })).status, 401); // el 10.º fallo sigue contando
  for (let i = 0; i < 3; i++) assert.equal((await s.f('/api/metricas', { pin: 'mal' })).status, 429);
  assert.equal(Number((await s.db`SELECT valor FROM limites WHERE clave LIKE 'pin:%'`)[0].valor), 10);
  s.cerrar();
});

test('PIN bueno no consume intentos: más de 10 aciertos seguidos no bloquean', async () => {
  const s = await arrancar();
  for (let i = 0; i < 15; i++) assert.equal((await s.f('/api/metricas')).status, 200);
  s.cerrar();
});

async function db_atascado(db) {
  const t = ahora();
  await db`INSERT INTO ordenes(concepto, monto_centavos, creada_en, expira_en, token, intento, creando_desde) VALUES ('t', 100, ${t - 100}, ${t + 260}, 'tok-atascado', 'atascado-1', ${t - 100})`;
}

test('4 POST simultáneos con intentos distintos: a lo sumo 3 vivos (cupo atómico en la BD)', async () => {
  const s = await arrancar();
  const r = await Promise.all([1, 2, 3, 4].map((i) => s.crear(1, { intento: `simultaneo-${i}` })));
  assert.deepEqual(r.map((x) => x.status).sort(), [201, 201, 201, 409]);
  assert.equal((await s.f('/api/ordenes')).body.length, 3);
  s.cerrar();
});

test('PIN: el contador vive en la BD; dos instancias lo comparten y una cabecera falsa no evade el límite', async () => {
  const { db, abrir } = await nuevaDb();
  const a = await arrancar([], { db }), b = await arrancar([], { db: abrir() });
  for (let i = 0; i < 5; i++) {
    assert.equal((await a.f('/api/metricas', { pin: 'mal', headers: { 'x-vercel-forwarded-for': `9.9.9.${i}` } })).status, 401);
    assert.equal((await b.f('/api/metricas', { pin: 'mal', headers: { 'x-forwarded-for': `8.8.8.${i}` } })).status, 401);
  }
  const r = await b.f('/api/metricas'); // enVercel=false: la cabecera se ignora y es la misma IP
  assert.equal(r.status, 429);
  assert.equal((await a.f('/api/metricas')).status, 429);
  a.cerrar(); b.cerrar();
});

test('PIN en Vercel: el límite es por IP de la cabecera de Vercel, no global', async () => {
  const s = await arrancar([], { enVercel: true });
  const h = (ip) => ({ 'x-vercel-forwarded-for': ip });
  for (let i = 0; i < 10; i++) await s.f('/api/metricas', { pin: 'mal', headers: h('1.1.1.1') });
  assert.equal((await s.f('/api/metricas', { headers: h('1.1.1.1') })).status, 429);
  assert.equal((await s.f('/api/metricas', { headers: h('2.2.2.2') })).status, 200);
  s.cerrar();
});
