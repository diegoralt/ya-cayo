// QR recuperable: idempotencia propia por `intento` (pey no la ofrece), relevo de intentos atascados y correlación por metadata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sw from 'standardwebhooks';
import { nuevaDb } from './helpers/pg.js';
import { crearOrden, vista, ahora, PLAZO_CREANDO } from '../src/core.js';
import { manejarWebhook } from '../src/conciliacion.js';
const { Webhook } = sw;

const T0 = 1_000_000;
let n = 0;
// pey doble: cuenta las creaciones; `colgar` deja una creación sin resolver hasta que la liberes.
function pey({ txs = [], falla = false, demora = 0 } = {}) {
  const p = { creados: [], txs, soltar: [] };
  p.createQr = async (args) => {
    p.creados.push(args);
    const id = `QR${++n}`;
    if (falla) throw new Error('503');
    if (demora) await new Promise((r) => setTimeout(r, demora));
    if (p.colgar) await new Promise((r) => p.soltar.push(r));
    return { id, qrString: `cadena-${id}`, qrImage: 'AAAA' };
  };
  p.listQrTransactions = async () => (typeof p.txs === 'function' ? p.txs() : p.txs);
  return p;
}
const base = { concepto: 't', montoCentavos: 1, now: T0 };
const ordenes = async (db) => (await db`SELECT count(*) n FROM ordenes`)[0].n;

test('mismo intento tras éxito: misma orden y mismo QR, pey se llama una vez', async () => {
  const { db } = await nuevaDb();
  const p = pey();
  const a = await crearOrden(db, p, { ...base, intento: 'i-1' });
  const b = await crearOrden(db, p, { ...base, intento: 'i-1' });
  assert.equal(b.id, a.id);
  assert.equal(b.qr.id, a.qr.id);
  assert.equal(b.qr.qrString, a.qr.qrString);
  assert.equal(b.reutilizada, true);
  assert.equal(p.creados.length, 1);
  assert.equal(await ordenes(db), 1);
});

test('reintentos simultáneos del mismo intento (instancias distintas): una orden y un solo QR', async () => {
  const { db, abrir } = await nuevaDb();
  const p = pey({ demora: 60 });
  const rs = await Promise.all([crearOrden(db, p, { ...base, intento: 'i-2' }), crearOrden(abrir(), p, { ...base, intento: 'i-2' }), crearOrden(abrir(), p, { ...base, intento: 'i-2' })]);
  assert.equal(p.creados.length, 1);
  assert.equal(await ordenes(db), 1);
  assert.equal(rs.filter((r) => r.qr && !r.reutilizada).length, 1); // solo uno creó; los demás ven «creando» o la reutilizan
  assert.ok(rs.every((r) => r.id === rs[0].id));
  const otra = await crearOrden(db, p, { ...base, intento: 'i-2' });
  assert.equal(otra.reutilizada, true);
});

test('en vuelo (< plazo): un reintento recibe «creando» y no vuelve a llamar a pey', async () => {
  const { db } = await nuevaDb();
  const p = pey(); p.colgar = true;
  crearOrden(db, p, { ...base, intento: 'i-3' }); // la función «queda esperando» a pey
  await new Promise((r) => setTimeout(r, 100));
  const r = await crearOrden(db, p, { ...base, intento: 'i-3', now: T0 + PLAZO_CREANDO - 1 });
  assert.equal(r.creando, true);
  assert.equal(p.creados.length, 1);
  p.soltar.forEach((f) => f());
});

test('función muerta tras aceptar pey: pasado el plazo se recrea el QR de la misma orden; el tardío no pisa al vigente', async () => {
  const { db, abrir } = await nuevaDb();
  const p = pey(); p.colgar = true;
  const primero = crearOrden(db, p, { ...base, intento: 'i-4' }); // pey acepta el QR 1 pero la función nunca guarda (colgada)
  await new Promise((r) => setTimeout(r, 100));
  const [{ id }] = await db`SELECT id FROM ordenes WHERE intento='i-4'`;
  const q = pey(); // reintento sin colgar
  const r = await crearOrden(abrir(), q, { ...base, intento: 'i-4', now: T0 + PLAZO_CREANDO + 1 });
  assert.equal(r.id, id);
  assert.ok(r.qr && !r.creando);
  assert.equal(q.creados.length, 1);
  assert.equal(await ordenes(db), 1);
  assert.equal(q.creados[0].metadata.intento, 'i-4');
  assert.equal((await vista(db, id, T0)).qr_id, r.qr.id);
  p.soltar.forEach((f) => f()); // la función «muerta» despierta tarde: su QR se descarta, no sobrescribe
  const tardio = await primero;
  assert.equal(tardio.qr.id, r.qr.id);
  assert.equal((await vista(db, id, T0)).qr_id, r.qr.id);
  assert.equal(await ordenes(db), 1);
});

test('el relevo usa el concepto y monto guardados, no los del reintento', async () => {
  const { db } = await nuevaDb();
  const p = pey(); p.colgar = true;
  crearOrden(db, p, { concepto: 'café', montoCentavos: 3000, now: T0, intento: 'i-5' });
  await new Promise((r) => setTimeout(r, 100));
  const q = pey();
  await crearOrden(db, q, { concepto: 'otra cosa', montoCentavos: 1, now: T0 + 40, intento: 'i-5' });
  assert.deepEqual([q.creados[0].concept, q.creados[0].amountCents], ['café', 3000]);
  p.soltar.forEach((f) => f());
});

test('error de pey: no deja orden y el mismo intento puede volver a intentarse', async () => {
  const { db } = await nuevaDb();
  await assert.rejects(crearOrden(db, pey({ falla: true }), { ...base, intento: 'i-6' }));
  assert.equal(await ordenes(db), 0);
  const r = await crearOrden(db, pey(), { ...base, intento: 'i-6' });
  assert.ok(r.qr);
  assert.equal(await ordenes(db), 1);
});

// ---- webhook y correlación por metadata.intento
const SECRETO = 'whsec_' + Buffer.from('secreto-de-prueba-0123456789abcdef').toString('base64');
const wh = new Webhook(SECRETO);
const firmar = (cuerpo, id) => { const ts = new Date(); return { 'webhook-id': id, 'webhook-timestamp': String(Math.floor(ts.getTime() / 1000)), 'webhook-signature': wh.sign(id, ts, cuerpo) }; };
const evento = (qr, intento, tid = 'TX1') => JSON.stringify({ type: 'codi.qr.payment_received', codiQrId: qr, transactionId: tid, amount: 0.01, datePaid: ahora() + 1, numRef: '1', metadata: { intento } });
const pagoOk = (id = 'TX1') => ({ id, status: 'PAID', amountCents: 1, currency: 'MXN', datePaid: ahora() + 1 });

test('webhook adelantado al guardado (orden creando): adopta el QR por metadata.intento y concilia', async () => {
  const { db } = await nuevaDb();
  const p = pey({ txs: [pagoOk()] }); p.colgar = true;
  crearOrden(db, p, { ...base, now: ahora(), intento: 'i-7' }); // pey aceptó, aún no se guarda el qr_id
  await new Promise((r) => setTimeout(r, 100));
  const [{ id }] = await db`SELECT id FROM ordenes WHERE intento='i-7'`;
  const cuerpo = evento('QR-X', 'i-7');
  assert.equal(await manejarWebhook({ db, pey: p, secret: SECRETO }, cuerpo, firmar(cuerpo, 'msg_a')), 200);
  const v = await vista(db, id);
  assert.equal(v.qr_id, 'QR-X');
  assert.equal(v.estado, 'pagada');
  p.soltar.forEach((f) => f()); // el guardado tardío no pisa el QR adoptado
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await vista(db, id)).qr_id, 'QR-X');
});

test('pago a un QR que ya no es el vigente de la orden: se registra inválido, sin entrega ni cambio de estado', async () => {
  const { db } = await nuevaDb();
  const p = pey({ txs: [] });
  const { id } = await crearOrden(db, p, { ...base, now: ahora(), intento: 'i-8' });
  const cuerpo = evento('QR-HUERFANO', 'i-8', 'TX9');
  assert.equal(await manejarWebhook({ db, pey: p, secret: SECRETO }, cuerpo, firmar(cuerpo, 'msg_b')), 200);
  const v = await vista(db, id);
  assert.equal(v.estado, 'pendiente');
  assert.deepEqual(v.transacciones.map((t) => [t.transaction_id, t.clasificacion]), [['TX9', 'invalida']]);
  assert.equal(await manejarWebhook({ db, pey: p, secret: SECRETO }, cuerpo, firmar(cuerpo, 'msg_b')), 200); // reenvío: idempotente
  assert.equal((await vista(db, id)).transacciones.length, 1);
});

test('webhook con intento desconocido o sin metadata: 200 sin efecto', async () => {
  const { db } = await nuevaDb();
  const p = pey();
  const { id } = await crearOrden(db, p, { ...base, now: ahora(), intento: 'i-9' });
  for (const c of [evento('QR-Z', 'no-existe'), JSON.stringify({ type: 'codi.qr.payment_received', codiQrId: 'QR-Z' })]) {
    assert.equal(await manejarWebhook({ db, pey: p, secret: SECRETO }, c, firmar(c, `msg_${++n}`)), 200);
  }
  assert.equal((await vista(db, id)).estado, 'pendiente');
});
