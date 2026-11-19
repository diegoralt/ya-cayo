import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { abrirDb, crearOrden, entregar, vista, cobrosVivos, registrarOtroMetodo, metricas } from './core.js';
import { manejarWebhook, conciliarAlConsultar, conciliarMarcando, VENTANA_POST } from './conciliacion.js';
import { crearClientePey } from './pey.js';

const MAX_CUERPO = 64 * 1024;
export const TOPE_CENTAVOS = 5000; // demo: máx. $50
export const MAX_VIVOS = 3;
const MAX_FALLOS = 10, VENTANA_MS = 60_000; // PIN: 10 fallos por minuto y por IP
// ponytail: solo estas dos páginas se sirven; nunca el directorio del repo ni la base.
const pagina = (n) => readFileSync(new URL(`../public/${n}`, import.meta.url));

// Cabeceras de defensa en todas las respuestas. CSP: sin recursos externos; los scripts y estilos inline de las páginas siguen permitidos.
const SEGURIDAD = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
const esLoopback = (a = '') => /^(::1|127\.|::ffff:127\.)/.test(a);

const json = (res, codigo, obj) => res.writeHead(codigo, { 'content-type': 'application/json' }).end(JSON.stringify(obj));
const iguales = (a = '', b = '') => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function leer(req) {
  const trozos = [];
  let tam = 0;
  for await (const c of req) {
    tam += c.length;
    if (tam > MAX_CUERPO) throw Object.assign(new Error('grande'), { codigo: 413 });
    trozos.push(c);
  }
  return Buffer.concat(trozos).toString('utf8');
}

// Lo que ve el pagador: nada de transacciones ni ids internos.
function vistaPublica(v, titular) {
  return {
    titular, concepto: v.concepto, montoCentavos: v.monto_centavos, expiraEn: v.expira_en,
    estado: v.estado, vencida: v.vencida, tardio: v.tardio, qrImage: v.qr_image, qrString: v.qr_string,
  };
}
const vistaCaja = ({ transacciones, ...v }) => ({ ...v, transacciones: transacciones.length });

export function crearServidor({ db, pey, secret, pin, titular = '[titular por declarar]', comision = 0.03 }) {
  const fallos = new Map(); // ponytail: en memoria, una instancia; sin limpieza (pocas IPs). Con varios procesos, pasar a Redis.
  const srv = createServer(async (req, res) => {
    for (const [k, v] of Object.entries(SEGURIDAD)) res.setHeader(k, v);
    try {
      const url = new URL(req.url, 'http://x');
      const ruta = url.pathname;
      if (req.method === 'GET' && ruta === '/health') return json(res, 200, { ok: true, app: 'ya-cayo' });
      if (req.method === 'POST' && ruta === '/webhook') {
        const codigo = await manejarWebhook({ db, pey, secret }, await leer(req), req.headers);
        return res.writeHead(codigo).end();
      }
      if (req.method === 'GET' && ruta === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(pagina('caja.html'));
      const mp = ruta.match(/^\/pagar\/([\w-]+)$/);
      if (req.method === 'GET' && mp) return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(pagina('pagar.html'));
      // Pagador: sin PIN, por token no adivinable.
      const mv = ruta.match(/^\/api\/pago\/([\w-]+)$/);
      if (req.method === 'GET' && mv) {
        const [o] = await db`SELECT id, qr_id, estado, expira_en FROM ordenes WHERE token=${mv[1]}`;
        const id = o?.id;
        if (o) await conciliarAlConsultar(db, pey, [o]); // respaldo del webhook sin proceso de fondo
        return id ? json(res, 200, vistaPublica(await vista(db, id), titular)) : json(res, 404, { error: 'no existe' });
      }
      if (!ruta.startsWith('/api/')) return res.writeHead(404).end();

      // Caja: todo lo demás exige el PIN de demo.
      // cf-connecting-ip solo se confía si la conexión viene del túnel local; directo desde la red, no se puede falsificar.
      const ip = (esLoopback(req.socket.remoteAddress) && req.headers['cf-connecting-ip']) || req.socket.remoteAddress, ahora = Date.now();
      let f = fallos.get(ip);
      if (!f || f.hasta <= ahora) fallos.set(ip, (f = { n: 0, hasta: ahora + VENTANA_MS }));
      if (f.n >= MAX_FALLOS) return res.writeHead(429, { 'content-type': 'application/json', 'retry-after': Math.ceil((f.hasta - ahora) / 1000) }).end(JSON.stringify({ error: 'demasiados intentos; espera un minuto' }));
      if (!iguales(req.headers['x-pin'], pin)) { f.n++; return json(res, 401, { error: 'PIN incorrecto' }); }
      if (req.method === 'GET' && ruta === '/api/metricas') return json(res, 200, { ...(await metricas(db, comision)), comision });
      if (req.method === 'GET' && ruta === '/api/ordenes') {
        // Candidatas a conciliar: toda orden dentro de la ventana, no solo las 20 que se muestran.
        const candidatas = await db`SELECT id, qr_id, estado, expira_en FROM ordenes WHERE qr_id IS NOT NULL AND expira_en + ${VENTANA_POST} >= ${Math.floor(Date.now() / 1000)} ORDER BY id DESC`;
        await conciliarAlConsultar(db, pey, [...candidatas]);
        const ids = await db`SELECT id FROM ordenes WHERE qr_id IS NOT NULL ORDER BY id DESC LIMIT 20`;
        return json(res, 200, await Promise.all(ids.map(async ({ id }) => vistaCaja(await vista(db, id)))));
      }
      if (req.method === 'POST' && ruta === '/api/ordenes') {
        const b = JSON.parse((await leer(req)) || '{}');
        const centavos = Math.round(Number(b.monto) * 100);
        const concepto = String(b.concepto ?? '').trim().slice(0, 100);
        if (!concepto || !Number.isFinite(centavos) || centavos < 1) return json(res, 400, { error: 'concepto y monto > 0' });
        if (centavos > TOPE_CENTAVOS) return json(res, 400, { error: 'tope de la demo: $50' });
        if (b.metodo === 'otro') { await registrarOtroMetodo(db, concepto, centavos); return json(res, 201, { registrado: true }); }
        if ((await cobrosVivos(db)) >= MAX_VIVOS) return json(res, 409, { error: `máximo ${MAX_VIVOS} cobros vivos` });
        const { id } = await crearOrden(db, pey, { concepto, montoCentavos: centavos }); // el monto lo fija el servidor en el QR
        return json(res, 201, vistaCaja(await vista(db, id)));
      }
      const mo = ruta.match(/^\/api\/ordenes\/(\d+)(?:\/(entregar|conciliar))?$/);
      if (mo) {
        const id = Number(mo[1]);
        const v = await vista(db, id);
        if (!v) return json(res, 404, { error: 'no existe' });
        if (req.method === 'GET' && !mo[2]) return json(res, 200, vistaCaja(v));
        if (req.method === 'POST' && mo[2] === 'entregar') return json(res, 200, { ...(await entregar(db, id)), orden: vistaCaja(await vista(db, id)) });
        if (req.method === 'POST' && mo[2] === 'conciliar') { const r = await conciliarMarcando(db, pey, id); return json(res, 200, { ok: r.ok, orden: vistaCaja(await vista(db, id)) }); }
      }
      return res.writeHead(404).end();
    } catch (e) {
      if (e.codigo === 413) return res.writeHead(413).end();
      console.error('error:', e?.message); // nunca el cuerpo ni credenciales
      return json(res, e instanceof SyntaxError ? 400 : 502, { error: e instanceof SyntaxError ? 'JSON inválido' : 'error al hablar con pey' });
    }
  });
  srv.headersTimeout = 10_000; srv.requestTimeout = 15_000; // ponytail: corta conexiones lentas (slowloris) si algo llega sin Cloudflare
  return srv;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const secret = process.env.PEY_WEBHOOK_SECRET;
  const pin = process.env.DEMO_PIN;
  if (!secret) throw new Error('falta PEY_WEBHOOK_SECRET');
  if (!pin) throw new Error('falta DEMO_PIN');
  const db = abrirDb(process.env.DATABASE_URL);
  const pey = crearClientePey();
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? '127.0.0.1'; // solo el túnel local; nunca 0.0.0.0 salvo decisión explícita
  const comision = Number(process.env.COMISION_TARJETA ?? 0.03);
  crearServidor({ db, pey, secret, pin, titular: process.env.TITULAR || undefined, comision }).listen(port, host, () => console.log(`ya-cayo escuchando en ${host}:${port}`));
}
