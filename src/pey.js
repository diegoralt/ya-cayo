// pey API client. Shape of GET /transaction/codi/qr/{id} taken from the 2026-10-20 OpenAPI:
// {items:[...], nextToken|null}, `?nextToken=`, datePaid as Unix integer, amount in MXN. Documented, not
// observed in a real response until H1. `amount` is the total: if pey charged a fee/tip it would not match
// the order amount and the transaction would be classified `invalid` (conservative).
const BASE = 'https://api.pey.mx';

const toUnix = (v) => (typeof v === 'number' ? v : v ? Math.floor(Date.parse(v) / 1000) : undefined);

export function normalizeTx(t) {
  return {
    id: String(t.id ?? t.transactionId),
    status: t.status,
    amountCents: Math.round(Number(t.amount) * 100),
    currency: t.currency,
    datePaid: toUnix(t.datePaid),
  };
}

// Timings measured on 16-nov: creating a QR took 1.6–5.2 s. Create: 15 s; each query: 8 s; full pagination: 12 s.
export const TIMEOUTS = { create: 15_000, query: 8_000, pagination: 12_000 };

export function createPeyClient({ apiKey = process.env.PEY_API_KEY, fetchFn = fetch, timeouts = {} } = {}) {
  if (!apiKey) throw new Error('missing PEY_API_KEY');
  const t = { ...TIMEOUTS, ...timeouts };
  const call = async (path, init = {}, ms = t.query) => {
    let res;
    try {
      res = await fetchFn(BASE + path, {
        ...init,
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(ms),
      });
      if (!res.ok) throw new Error(`pey ${res.status}`); // no body: never leak response data
      return await res.json();
    } catch (e) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new Error('pey timeout');
      throw e;
    }
  };
  return {
    async createQr({ amountCents, concept, expiration, numRef, metadata }) {
      return call('/codi/qr', {
        method: 'POST',
        body: JSON.stringify({ amount: amountCents / 100, concept, expiration, numRef, metadata, generateImage: true }),
      }, t.create);
    },
    async listQrTransactions(qrId) {
      const out = [];
      const deadline = Date.now() + t.pagination; // total budget, not just per page
      let token;
      do {
        const left = deadline - Date.now();
        if (left <= 0) throw new Error('pey timeout');
        const r = await call(`/transaction/codi/qr/${encodeURIComponent(qrId)}${token ? `?nextToken=${encodeURIComponent(token)}` : ''}`, {}, Math.min(t.query, left));
        const items = r.items ?? [];
        out.push(...items.map(normalizeTx));
        token = r.nextToken;
      } while (token);
      return out;
    },
  };
}
