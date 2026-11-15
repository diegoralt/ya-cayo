// Núcleo de estado: conciliar registra hechos; solo entregar() cambia a «entregada».
// ponytail: node:sqlite síncrono, una sola conexión; si hay varios procesos, pasar a Postgres.
import { DatabaseSync } from 'node:sqlite';

export const ahora = () => Math.floor(Date.now() / 1000);

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS ordenes (
      id INTEGER PRIMARY KEY,
      concepto TEXT NOT NULL,
      monto_centavos INTEGER NOT NULL CHECK (monto_centavos > 0),
      qr_id TEXT UNIQUE,
      creada_en INTEGER NOT NULL,
      expira_en INTEGER NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagada','entregada'))
    );
    CREATE TABLE IF NOT EXISTS transacciones (
      transaction_id TEXT PRIMARY KEY,
      orden_id INTEGER NOT NULL REFERENCES ordenes(id),
      monto_centavos INTEGER NOT NULL,
      date_paid INTEGER,
      clasificacion TEXT NOT NULL CHECK (clasificacion IN ('valida','tardio','duplicada','invalida'))
    );
    CREATE TABLE IF NOT EXISTS eventos (
      webhook_id TEXT PRIMARY KEY,
      recibido_en INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entregas (
      orden_id INTEGER PRIMARY KEY REFERENCES ordenes(id),
      entregada_en INTEGER NOT NULL
    );
  `);
  return db;
}

function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// pey: { createQr({amountCents, concept, expiration, numRef}) -> {id}, listQrTransactions(qrId) -> [{id,status,amountCents,currency,datePaid}] }
export async function crearOrden(db, pey, { concepto, montoCentavos, ttl = 360, now = ahora() }) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO ordenes(concepto, monto_centavos, creada_en, expira_en) VALUES (?,?,?,?)')
    .run(concepto, montoCentavos, now, now + ttl);
  const id = Number(lastInsertRowid);
  try {
    const qr = await pey.createQr({ amountCents: montoCentavos, concept: concepto, expiration: ttl, numRef: String(id % 10_000_000) });
    db.prepare('UPDATE ordenes SET qr_id=? WHERE id=?').run(String(qr.id), id);
    return { id, qr };
  } catch (e) {
    db.prepare('DELETE FROM ordenes WHERE id=?').run(id);
    throw e;
  }
}

// Aplica transacciones ya consultadas. Nunca degrada ni reabre una orden; solo añade hechos.
export function aplicarTransacciones(db, ordenId, txs) {
  return tx(db, () => {
    const o = db.prepare('SELECT * FROM ordenes WHERE id=?').get(ordenId);
    if (!o) return { nuevas: [] };
    const nuevas = [];
    const pagadas = txs.filter((t) => t.status === 'PAID').sort((a, b) => a.datePaid - b.datePaid);
    for (const t of pagadas) {
      if (db.prepare('SELECT 1 FROM transacciones WHERE transaction_id=?').get(t.id)) continue;
      const { estado } = db.prepare('SELECT estado FROM ordenes WHERE id=?').get(ordenId);
      let c;
      if (t.amountCents !== o.monto_centavos || t.currency !== 'MXN') c = 'invalida';
      else if (t.datePaid > o.expira_en) c = 'tardio';
      else if (estado === 'pendiente') {
        c = 'valida';
        db.prepare("UPDATE ordenes SET estado='pagada' WHERE id=? AND estado='pendiente'").run(ordenId);
      } else c = 'duplicada';
      db.prepare('INSERT INTO transacciones(transaction_id, orden_id, monto_centavos, date_paid, clasificacion) VALUES (?,?,?,?,?)')
        .run(String(t.id), ordenId, t.amountCents, t.datePaid ?? null, c);
      nuevas.push({ id: t.id, clasificacion: c });
    }
    return { nuevas };
  });
}

// Consulta a pey (fuera de la transacción) y aplica. Un error de consulta no cambia nada.
export async function conciliar(db, pey, ordenId) {
  const o = db.prepare('SELECT qr_id FROM ordenes WHERE id=?').get(ordenId);
  if (!o?.qr_id) return { ok: false, error: 'sin_qr' };
  let txs;
  try {
    txs = await pey.listQrTransactions(o.qr_id);
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
  return { ok: true, ...aplicarTransacciones(db, ordenId, txs) };
}

// Única vía a «entregada»: UPDATE condicionado + INSERT en la misma transacción.
export function entregar(db, ordenId, now = ahora()) {
  return tx(db, () => {
    const r = db.prepare("UPDATE ordenes SET estado='entregada' WHERE id=? AND estado='pagada'").run(ordenId);
    if (r.changes !== 1) return { ok: false };
    db.prepare('INSERT INTO entregas(orden_id, entregada_en) VALUES (?,?)').run(ordenId, now);
    return { ok: true };
  });
}

export function contarEntregas(db, ordenId) {
  return db.prepare('SELECT COUNT(*) AS n FROM entregas WHERE orden_id=?').get(ordenId).n;
}

export function vista(db, ordenId, now = ahora()) {
  const o = db.prepare('SELECT * FROM ordenes WHERE id=?').get(ordenId);
  if (!o) return null;
  const transacciones = db.prepare('SELECT transaction_id, monto_centavos, date_paid, clasificacion FROM transacciones WHERE orden_id=?').all(ordenId);
  return {
    ...o,
    vencida: o.estado === 'pendiente' && now > o.expira_en,
    tardio: transacciones.some((t) => t.clasificacion === 'tardio'),
    duplicado: transacciones.some((t) => t.clasificacion === 'duplicada'),
    entregas: contarEntregas(db, ordenId),
    transacciones,
  };
}

export function registrarEvento(db, webhookId, now = ahora()) {
  return db.prepare('INSERT OR IGNORE INTO eventos(webhook_id, recibido_en) VALUES (?,?)').run(webhookId, now).changes === 1;
}
