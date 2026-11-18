// H8a: SQLite -> Postgres migration, rehearsed with a synthetic old-schema SQLite (no real data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newDb } from './helpers/pg.js';
import { countDeliveries, deliver } from '../src/core.js';
import { readSqlite, importToPg, verify, ensayo, checkTarget, loadSource, PROD_REF } from '../scripts/migrar-sqlite-a-pg.js';

const OLD_DDL = `
  CREATE TABLE ordenes (id INTEGER PRIMARY KEY, concepto TEXT NOT NULL, monto_centavos INTEGER NOT NULL CHECK (monto_centavos > 0),
    qr_id TEXT UNIQUE, token TEXT UNIQUE, qr_string TEXT, qr_image TEXT, pagada_en INTEGER, confirmada_en INTEGER,
    creada_en INTEGER NOT NULL, expira_en INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagada','entregada')));
  CREATE TABLE transacciones (transaction_id TEXT PRIMARY KEY, orden_id INTEGER NOT NULL REFERENCES ordenes(id),
    monto_centavos INTEGER NOT NULL, date_paid INTEGER, clasificacion TEXT NOT NULL CHECK (clasificacion IN ('valida','tardio','duplicada','invalida')));
  CREATE TABLE registros (id INTEGER PRIMARY KEY, concepto TEXT NOT NULL, monto_centavos INTEGER NOT NULL, metodo TEXT NOT NULL, creada_en INTEGER NOT NULL);
  CREATE TABLE eventos (webhook_id TEXT PRIMARY KEY, recibido_en INTEGER NOT NULL);
  CREATE TABLE entregas (orden_id INTEGER PRIMARY KEY REFERENCES ordenes(id), entregada_en INTEGER NOT NULL);`;

// Edge cases: Unicode/quotes, id gaps and a large id, every status, no qr/token, late/duplicate transactions, non-«otro» method.
function fixture() {
  const path = join(mkdtempSync(join(tmpdir(), 'ya-cayo-fx-')), 'old.sqlite');
  const db = new DatabaseSync(path);
  db.exec(OLD_DDL);
  const o = db.prepare('INSERT INTO ordenes VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  o.run(1, "Café ñandú 😀 'comillas' \"dobles\"", 5000, 'QR1', 'tok1', 'qrs1', 'data:image/png;base64,AAA', 1000, 1001, 900, 1260, 'entregada');
  o.run(2, 'pagada sin entregar', 1250, 'QR2', 'tok2', 'qrs2', null, 2000, 2002, 1900, 2260, 'pagada');
  o.run(5, 'pendiente vencida', 300, 'QR5', 'tok5', null, null, null, null, 3000, 3360, 'pendiente');
  o.run(9, 'sin qr ni token', 100, null, null, null, null, null, null, 4000, 4360, 'pendiente');
  o.run(9_000_000_000, 'id grande', 700, 'QR9', 'tok9', null, null, 5000, 5001, 4900, 5260, 'entregada');
  const t = db.prepare('INSERT INTO transacciones VALUES (?,?,?,?,?)');
  t.run('T1', 1, 5000, 1000, 'valida'); t.run('T1b', 1, 5000, 1100, 'duplicada'); t.run('T2', 2, 1250, 2000, 'valida');
  t.run('T2late', 2, 1250, 9999, 'tardio'); t.run('T9', 9_000_000_000, 700, 5000, 'valida'); t.run('Tbad', 5, 1, null, 'invalida');
  const r = db.prepare('INSERT INTO registros VALUES (?,?,?,?,?)');
  r.run(1, 'efectivo', 200, 'otro', 10); r.run(7, 'tarjeta', 450, 'tarjeta', 20);
  db.prepare('INSERT INTO eventos VALUES (?,?)').run('wh-1', 1000);
  db.prepare('INSERT INTO eventos VALUES (?,?)').run('wh-2', 5000);
  const e = db.prepare('INSERT INTO entregas VALUES (?,?)');
  e.run(1, 1002); e.run(9_000_000_000, 5002);
  db.close();
  return path;
}

test('import: same content in PG (renamed fields, translated values, ids kept) and verify() finds nothing', async () => {
  const src = readSqlite(fixture());
  const { db, openAdmin } = await newDb();
  assert.deepEqual(await importToPg(openAdmin(), src), { orders: 5, transactions: 6, records: 2, events: 2, deliveries: 2 });
  assert.deepEqual(await verify(db, src), []);
  const [o] = await db`SELECT * FROM orders WHERE id=1`;
  assert.equal(o.concept, "Café ñandú 😀 'comillas' \"dobles\"");
  assert.equal(o.status, 'delivered'); assert.equal(o.attempt, null); assert.equal(o.creating_since, null);
  assert.equal((await db`SELECT classification FROM transactions WHERE transaction_id='T2late'`)[0].classification, 'late');
  assert.equal((await db`SELECT method FROM records ORDER BY id`).map((x) => x.method).join(), 'other,tarjeta');
  assert.equal((await db`SELECT processed_at FROM events WHERE webhook_id='wh-1'`)[0].processed_at, 1000); // imported as processed
});

test('repeated import: nothing inserted, nothing duplicated, still identical', async () => {
  const src = readSqlite(fixture());
  const { db, openAdmin } = await newDb();
  await importToPg(openAdmin(), src);
  assert.deepEqual(Object.values(await importToPg(openAdmin(), src)), [0, 0, 0, 0, 0]);
  assert.deepEqual(await verify(db, src), []);
});

test('verify is not vacuous: it flags a changed amount, a missing row and a wrong aggregate', async () => {
  const src = readSqlite(fixture());
  const { db, openAdmin } = await newDb();
  await importToPg(openAdmin(), src);
  await db`UPDATE orders SET amount_cents = amount_cents + 1 WHERE id=2`;
  await db`DELETE FROM records WHERE id=7`;
  const d = (await verify(db, src)).join(' | ');
  assert.match(d, /orders id=2: content differs/);
  assert.match(d, /records: 1 rows in PG vs 2 in SQLite/);
  assert.match(d, /records id=7: missing/);
  assert.match(d, /aggregate orders\.paid\.s/);
});

test('sequences come after the imported ids (even a 9e9 one) and delivered orders cannot be delivered again', async () => {
  const src = readSqlite(fixture());
  const { db, openAdmin } = await newDb();
  await importToPg(openAdmin(), src);
  const [o] = await db`INSERT INTO orders(concept, amount_cents, created_at, expires_at) VALUES ('nueva', 1, 1, 2) RETURNING id`;
  const [r] = await db`INSERT INTO records(concept, amount_cents, method, created_at) VALUES ('nuevo', 1, 'other', 1) RETURNING id`;
  assert.ok(o.id > 9_000_000_000 && r.id > 7);
  for (const id of [1, 9_000_000_000]) { assert.equal((await deliver(db, id)).ok, false); assert.equal(await countDeliveries(db, id), 1); }
  assert.equal((await deliver(db, 2)).ok, true); // the paid one is deliverable once
  assert.equal((await deliver(db, 2)).ok, false);
});

test('an unknown status in SQLite stops the migration (fail closed)', () => {
  const path = fixture();
  const db = new DatabaseSync(path);
  db.exec('PRAGMA ignore_check_constraints = ON'); db.exec("UPDATE ordenes SET estado='rara' WHERE id=5"); db.close();
  assert.throws(() => readSqlite(path), /unknown status/);
});

test('ensayo(): the full rehearsal passes on the fixture, leaves the source untouched and refuses a SQLite with a -wal file', async () => {
  const path = fixture();
  const logs = [];
  const r = await ensayo(path, (l) => logs.push(l));
  assert.deepEqual(r.counts, { orders: 5, transactions: 6, records: 2, events: 2, deliveries: 2 });
  assert.equal(logs.filter((l) => l.startsWith('ok')).length, 7);
  writeFileSync(`${path}-wal`, '');
  await assert.rejects(() => ensayo(path, () => {}), /-wal/);
});

test('real-run guards: only the production pooler, and only the copy whose sha256 was approved', () => {
  const ok = `postgresql://postgres.${PROD_REF}:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
  checkTarget(ok, 5432);
  checkTarget(ok.replace(':5432', ':6543').replace('postgres.', 'ya_cayo_app.'), 6543);
  for (const bad of [ok.replace('aws-0-us-east-1.pooler.supabase.com', 'localhost'), ok.replace(PROD_REF, 'otherref'), ok.replace(':5432', ':6543')])
    assert.throws(() => checkTarget(bad, 5432), /production pooler/);
  const path = fixture();
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  assert.equal(loadSource(path, hash).rows.orders.length, 5);
  assert.throws(() => loadSource(path, 'a'.repeat(64)), /does not match/);
  assert.throws(() => loadSource(path, 'short'), /64-hex/);
  writeFileSync(`${path}-wal`, '');
  assert.throws(() => loadSource(path, hash), /-wal/);
});
