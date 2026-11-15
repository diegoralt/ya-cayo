// Núcleo de estado: conciliar registra hechos; solo entregar() cambia a «entregada».
// ponytail: node:sqlite síncrono, una sola conexión; si hay varios procesos, pasar a Postgres.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

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
      token TEXT UNIQUE,
      qr_string TEXT,
      qr_image TEXT,
      pagada_en INTEGER,
      confirmada_en INTEGER,
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
    CREATE TABLE IF NOT EXISTS registros (
      id INTEGER PRIMARY KEY,
      concepto TEXT NOT NULL,
      monto_centavos INTEGER NOT NULL,
      metodo TEXT NOT NULL,
      creada_en INTEGER NOT NULL
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
    .prepare('INSERT INTO ordenes(concepto, monto_centavos, creada_en, expira_en, token) VALUES (?,?,?,?,?)')
    .run(concepto, montoCentavos, now, now + ttl, randomUUID());
  const id = Number(lastInsertRowid);
  try {
    const qr = await pey.createQr({ amountCents: montoCentavos, concept: concepto, expiration: ttl, numRef: String(id % 10_000_000) });
    db.prepare('UPDATE ordenes SET qr_id=?, qr_string=?, qr_image=? WHERE id=?').run(String(qr.id), qr.qrString ?? null, qr.qrImage ?? null, id);
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
        db.prepare("UPDATE ordenes SET estado='pagada', pagada_en=?, confirmada_en=? WHERE id=? AND estado='pendiente'").run(t.datePaid, ahora(), ordenId);
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

// Registro «tarjeta o efectivo»: no cobra, solo mide cuántos aceptan CoDi.
export function registrarOtroMetodo(db, concepto, montoCentavos, now = ahora()) {
  db.prepare("INSERT INTO registros(concepto, monto_centavos, metodo, creada_en) VALUES (?,?,'otro',?)").run(concepto, montoCentavos, now);
}

export function cobrosVivos(db, now = ahora()) {
  return db.prepare("SELECT COUNT(*) AS n FROM ordenes WHERE estado='pendiente' AND expira_en>=? AND qr_id IS NOT NULL").get(now).n;
}

// Métricas «después» que salen del servidor. Clics y cambios de app no se miden aquí (ver docs).
export function metricas(db, comision = 0.03) {
  const o = db.prepare(`SELECT COUNT(*) AS total,
      SUM(estado IN ('pagada','entregada')) AS pagadas,
      SUM(estado='entregada') AS entregadas,
      AVG(CASE WHEN pagada_en IS NOT NULL THEN pagada_en - creada_en END) AS seg_cobro,
      AVG(CASE WHEN pagada_en IS NOT NULL THEN confirmada_en - pagada_en END) AS seg_latencia,
      SUM(CASE WHEN estado IN ('pagada','entregada') THEN monto_centavos ELSE 0 END) AS centavos_codi
    FROM ordenes WHERE qr_id IS NOT NULL`).get();
  const otros = db.prepare("SELECT COUNT(*) AS n FROM registros WHERE metodo='otro'").get().n;
  const maxEntregas = db.prepare('SELECT COALESCE(MAX(n),0) AS n FROM (SELECT COUNT(*) AS n FROM entregas GROUP BY orden_id)').get().n;
  return {
    cobros: o.total, pagadas: o.pagadas ?? 0, entregadas: o.entregadas ?? 0,
    segundosCobro: o.seg_cobro, segundosLatencia: o.seg_latencia,
    aceptacionCodi: { codi: o.total, otros },
    maxEntregasPorOrden: maxEntregas,
    comisionEvitadaCentavos: Math.round((o.centavos_codi ?? 0) * comision), // supuesto, no medido
  };
}
