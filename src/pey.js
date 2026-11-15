// Cliente de la API de pey. NO VERIFICADO contra respuestas reales hasta H1: forma de la lista de
// transacciones por QR, nombre del parámetro de paginación y formato de `datePaid`.
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
        const items = Array.isArray(r) ? r : (r.transactions ?? r.items ?? r.data ?? []);
        out.push(...items.map(normalizarTx));
        token = r.nextToken;
      } while (token);
      return out;
    },
  };
}
