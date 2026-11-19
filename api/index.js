// Entrada de Vercel: una sola función para /api/*, /webhook y /health (ver vercel.json).
import { abrirDb } from '../src/core.js';
import { crearHandler } from '../src/server.js';
import { crearClientePey } from '../src/pey.js';

const { PEY_WEBHOOK_SECRET: secret, DEMO_PIN: pin, DATABASE_URL, TITULAR, COMISION_TARJETA } = process.env;
if (!secret || !pin || !DATABASE_URL) throw new Error('faltan PEY_WEBHOOK_SECRET, DEMO_PIN o DATABASE_URL');

export default crearHandler({ db: abrirDb(DATABASE_URL), pey: crearClientePey(), secret, pin, titular: TITULAR || undefined, comision: Number(COMISION_TARJETA ?? 0.03) });
