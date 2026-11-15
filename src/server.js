import { createServer } from 'node:http';
import { openDb } from './core.js';
import { manejarWebhook, iniciarPolling } from './conciliacion.js';
import { crearClientePey } from './pey.js';

const MAX_CUERPO = 64 * 1024;

export function crearServidor({ db, pey, secret }) {
  return createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"ok":true}');
    }
    if (req.method === 'POST' && req.url === '/webhook') {
      const trozos = [];
      let tam = 0;
      for await (const c of req) {
        tam += c.length;
        if (tam > MAX_CUERPO) return res.writeHead(413).end();
        trozos.push(c);
      }
      const codigo = await manejarWebhook({ db, pey, secret }, Buffer.concat(trozos).toString('utf8'), req.headers);
      return res.writeHead(codigo).end();
    }
    res.writeHead(404).end();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const secret = process.env.PEY_WEBHOOK_SECRET;
  if (!secret) throw new Error('falta PEY_WEBHOOK_SECRET');
  const db = openDb(process.env.DB_PATH ?? './ya-cayo.sqlite');
  const pey = crearClientePey();
  iniciarPolling({ db, pey });
  const port = Number(process.env.PORT ?? 8787);
  crearServidor({ db, pey, secret }).listen(port, () => console.log(`ya-cayo escuchando en :${port}`));
}
