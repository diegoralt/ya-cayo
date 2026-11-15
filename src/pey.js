// Cliente de la API de pey. Forma de GET /transaction/codi/qr/{id} tomada del OpenAPI 2026-10-20:
// {items:[...], nextToken|null}, `?nextToken=`, datePaid entero Unix, amount en MXN. Documentado, no
// observado en una respuesta real hasta H1. `amount` es el total: si pey cobrara fee/propina, no coincidiría
// con el monto de la orden y la transacción quedaría `invalida` (conservador).
const BASE = 'https://api.pey.mx';

const aUnix = (v) => (typeof v === 'number' ? v : v ? Math.floor(Date.parse(v) / 1000) : undefined);

export function normalizarTx(t) {
  return {
    id: String(t.id ?? t.transactionId),
    status: t.status,
    amountCents: Math.round(Number(t.amount) * 100),
    currency: t.currency,
    datePaid: aUnix(t.datePaid),
  };
}

export function crearClientePey({ apiKey = process.env.PEY_API_KEY, fetchFn = fetch } = {}) {
  if (!apiKey) throw new Error('falta PEY_API_KEY');
  const llamar = async (ruta, init = {}) => {
    const res = await fetchFn(BASE + ruta, {
      ...init,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    });
    if (!res.ok) throw new Error(`pey ${res.status}`); // sin cuerpo: nunca filtrar datos de la respuesta
    return res.json();
  };
  return {
    async createQr({ amountCents, concept, expiration, numRef }) {
      return llamar('/codi/qr', {
        method: 'POST',
        body: JSON.stringify({ amount: amountCents / 100, concept, expiration, numRef, generateImage: true }),
      });
    },
    async listQrTransactions(qrId) {
      const out = [];
      let token;
      do {
        const r = await llamar(`/transaction/codi/qr/${encodeURIComponent(qrId)}${token ? `?nextToken=${encodeURIComponent(token)}` : ''}`);
        const items = r.items ?? [];
        out.push(...items.map(normalizarTx));
        token = r.nextToken;
      } while (token);
      return out;
    },
  };
}
