import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { openDb, createOrder, deliver, orderView, countFailure, pinFailures, nowSec, recordOtherMethod, metrics } from './core.js';
import { handleWebhook, reconcileOnRead, reconcileMarking } from './reconciliation.js';
import { createPeyClient } from './pey.js';

const MAX_BODY = 64 * 1024;
export const CAP_CENTS = 5000; // demo: max $50
export const MAX_LIVE = 3;
const MAX_FAILURES = 10, WINDOW_S = 60; // PIN: 10 failures per minute per IP (counter in the DB, shared across instances)
// Dev/tests only: on Vercel the pages are static (vercel.json). Only these two; never the repo directory.
const page = (n) => readFileSync(new URL(`../public/${n}`, import.meta.url));

// Defense headers on every response. CSP: no external resources; inline scripts and styles of the pages stay allowed.
const SECURITY = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

const json = (res, code, obj) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(obj));
const equal = (a = '', b = '') => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('too large'), { code: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// What the payer sees: no transactions or internal ids.
function publicView(v, holder) {
  return {
    holder, concept: v.concept, amountCents: v.amount_cents, expiresAt: v.expires_at,
    status: v.status, expired: v.expired, late: v.late, qrImage: v.qr_image, qrString: v.qr_string,
  };
}
const cashierView = ({ transactions, ...v }) => ({ ...v, transactions: transactions.length });

const applyHeaders = (res) => { for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v); };

// handler(req, res) without its own server: used by api/index.js on Vercel and by createAppServer in dev/tests.
export function createHandler({ db, pey, secret, pin, holder = '[titular por declarar]', fee = 0.03, onVercel = !!process.env.VERCEL }) {
  return async (req, res) => {
    applyHeaders(res);
    try {
      const url = new URL(req.url, 'http://x');
      const path = url.pathname;
      if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true, app: 'ya-cayo' });
      if (req.method === 'POST' && path === '/webhook') {
        const code = await handleWebhook({ db, pey, secret }, await readBody(req), req.headers);
        return res.writeHead(code).end();
      }
      // Payer: no PIN, by unguessable token.
      const mv = path.match(/^\/api\/payment\/([\w-]+)$/);
      if (req.method === 'GET' && mv) {
        const [o] = await db`SELECT id, qr_id, status, expires_at FROM orders WHERE token=${mv[1]}`;
        const id = o?.id;
        if (o) await reconcileOnRead(db, pey, [o]); // webhook backup without a background process
        return id ? json(res, 200, publicView(await orderView(db, id), holder)) : json(res, 404, { error: 'no existe' });
      }
      if (!path.startsWith('/api/')) return res.writeHead(404).end();

      // Cashier: everything else requires the demo PIN.
      // The IP is only taken from the header Vercel overwrites; outside Vercel any header is forgeable: the socket is used.
      const ip = (onVercel && req.headers['x-vercel-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress, now = nowSec();
      const f = await pinFailures(db, ip, now);
      if (f.n >= MAX_FAILURES) return res.writeHead(429, { 'content-type': 'application/json', 'retry-after': Math.max(1, f.until - now) }).end(JSON.stringify({ error: 'demasiados intentos; espera un minuto' }));
      if (!equal(req.headers['x-pin'], pin)) { await countFailure(db, ip, WINDOW_S, now); return json(res, 401, { error: 'PIN incorrecto' }); }
      if (req.method === 'GET' && path === '/api/metrics') return json(res, 200, { ...(await metrics(db, fee)), fee });
      if (req.method === 'GET' && path === '/api/orders') {
        const ids = await db`SELECT id, qr_id, status, expires_at FROM orders WHERE qr_id IS NOT NULL ORDER BY id DESC LIMIT 20`;
        await reconcileOnRead(db, pey, [...ids]);
        return json(res, 200, await Promise.all(ids.map(async ({ id }) => cashierView(await orderView(db, id)))));
      }
      if (req.method === 'POST' && path === '/api/orders') {
        const b = JSON.parse((await readBody(req)) || '{}');
        const cents = Math.round(Number(b.amount) * 100);
        const concept = String(b.concept ?? '').trim().slice(0, 100);
        if (!concept || !Number.isFinite(cents) || cents < 1) return json(res, 400, { error: 'concepto y monto > 0' });
        if (cents > CAP_CENTS) return json(res, 400, { error: 'tope de la demo: $50' });
        if (b.method === 'other') { await recordOtherMethod(db, concept, cents); return json(res, 201, { recorded: true }); }
        const attempt = /^[\w-]{8,64}$/.test(b.attempt ?? '') ? b.attempt : randomUUID(); // stable key of the charge: a retry does not duplicate the QR
        const r = await createOrder(db, pey, { concept, amountCents: cents, attempt, maxLive: MAX_LIVE }); // the server fixes the amount in the QR
        if (r.full) return json(res, 409, { error: `máximo ${MAX_LIVE} cobros vivos` });
        if (r.creating) return json(res, 409, { error: 'el cobro se está creando; vuelve a pulsar Cobrar en unos segundos' });
        return json(res, 201, cashierView(await orderView(db, r.id)));
      }
      const mo = path.match(/^\/api\/orders\/(\d+)(?:\/(deliver|reconcile))?$/);
      if (mo) {
        const id = Number(mo[1]);
        const v = await orderView(db, id);
        if (!v) return json(res, 404, { error: 'no existe' });
        if (req.method === 'GET' && !mo[2]) return json(res, 200, cashierView(v));
        if (req.method === 'POST' && mo[2] === 'deliver') return json(res, 200, { ...(await deliver(db, id)), order: cashierView(await orderView(db, id)) });
        if (req.method === 'POST' && mo[2] === 'reconcile') { const r = await reconcileMarking(db, pey, id); return json(res, 200, { ok: r.ok, order: cashierView(await orderView(db, id)) }); }
      }
      return res.writeHead(404).end();
    } catch (e) {
      if (e.code === 413) return res.writeHead(413).end();
      console.error('error:', e?.message); // never the body or credentials
      return json(res, e instanceof SyntaxError ? 400 : 502, { error: e instanceof SyntaxError ? 'JSON inválido' : 'error al hablar con pey' });
    }
  };
}

export function createAppServer(opts) {
  const handler = createHandler(opts);
  const html = (res, n) => { applyHeaders(res); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page(n)); };
  const srv = createServer((req, res) => {
    const path = req.url.split('?')[0];
    if (req.method === 'GET' && path === '/') return html(res, 'caja.html');
    if (req.method === 'GET' && /^\/pagar\/[\w-]+$/.test(path)) return html(res, 'pagar.html'); // public payer URL stays in Spanish (already shared)
    return handler(req, res);
  });
  srv.headersTimeout = 10_000; srv.requestTimeout = 15_000; // ponytail: cuts slow connections (slowloris) if something arrives without a proxy
  return srv;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const secret = process.env.PEY_WEBHOOK_SECRET;
  const pin = process.env.DEMO_PIN;
  if (!secret) throw new Error('missing PEY_WEBHOOK_SECRET');
  if (!pin) throw new Error('missing DEMO_PIN');
  const db = openDb(process.env.DATABASE_URL);
  const pey = createPeyClient();
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? '127.0.0.1'; // only the local tunnel; never 0.0.0.0 unless explicitly decided
  const fee = Number(process.env.CARD_FEE_RATE ?? 0.03);
  createAppServer({ db, pey, secret, pin, holder: process.env.HOLDER_NAME || undefined, fee }).listen(port, host, () => console.log(`ya-cayo listening on ${host}:${port}`));
}
