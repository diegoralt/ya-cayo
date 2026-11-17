// Vercel entry: a single function for /api/*, /webhook and /health (see vercel.json).
import { openDb } from '../src/core.js';
import { createHandler } from '../src/server.js';
import { createPeyClient } from '../src/pey.js';

const { PEY_WEBHOOK_SECRET: secret, DEMO_PIN: pin, DATABASE_URL, HOLDER_NAME, CARD_FEE_RATE } = process.env;
if (!secret || !pin || !DATABASE_URL) throw new Error('missing PEY_WEBHOOK_SECRET, DEMO_PIN or DATABASE_URL');

export default createHandler({ db: openDb(DATABASE_URL), pey: createPeyClient(), secret, pin, holder: HOLDER_NAME || undefined, fee: Number(CARD_FEE_RATE ?? 0.03) });
