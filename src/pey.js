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

// Tiempos medidos el 16-nov: crear un QR tardó 1.6–5.2 s. Crear: 15 s; cada consulta: 8 s; paginación completa: 12 s.
export const TIEMPOS = { crear: 15_000, consulta: 8_000, paginacion: 12_000 };

export function crearClientePey({ apiKey = process.env.PEY_API_KEY, fetchFn = fetch, tiempos = {} } = {}) {
  if (!apiKey) throw new Error('falta PEY_API_KEY');
  const t = { ...TIEMPOS, ...tiempos };
  const llamar = async (ruta, init = {}, ms = t.consulta) => {
    let res;
    try {
      res = await fetchFn(BASE + ruta, {
        ...init,
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(ms),
      });
      if (!res.ok) throw new Error(`pey ${res.status}`); // sin cuerpo: nunca filtrar datos de la respuesta
      return await res.json();
    } catch (e) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw new Error('pey timeout');
      throw e;
    }
  };
  return {
    async createQr({ amountCents, concept, expiration, numRef, metadata }) {
      return llamar('/codi/qr', {
        method: 'POST',
        body: JSON.stringify({ amount: amountCents / 100, concept, expiration, numRef, metadata, generateImage: true }),
      }, t.crear);
    },
    async listQrTransactions(qrId) {
      const out = [];
      const limite = Date.now() + t.paginacion; // presupuesto total, no solo por página
      let token;
      do {
        const resto = limite - Date.now();
        if (resto <= 0) throw new Error('pey timeout');
        const r = await llamar(`/transaction/codi/qr/${encodeURIComponent(qrId)}${token ? `?nextToken=${encodeURIComponent(token)}` : ''}`, {}, Math.min(t.consulta, resto));
        const items = r.items ?? [];
        out.push(...items.map(normalizarTx));
        token = r.nextToken;
      } while (token);
      return out;
    },
  };
}
