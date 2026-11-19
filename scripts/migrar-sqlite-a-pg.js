// Migrates the old SQLite (Spanish names) to Postgres (English names; dictionary in
// supabase/migrations/20261117000000_english_names.sql). NON-destructive: INSERT … ON CONFLICT DO NOTHING only
// (never DELETE/TRUNCATE), so it can be repeated and never overwrites facts created in Postgres afterwards.
// H8a: `node scripts/migrar-sqlite-a-pg.js --ensayo [--sqlite ruta]` rehearses everything on a throwaway local database.
// H8b real run (Diego's approval right before): `--aplicar --sqlite COPY --sha256 HASH` imports into production, `--verificar` (strict) compares.
// Both read DATABASE_URL_ADMIN (Supabase session pooler :5432, administrator: ya_cayo_app has no setval) from the environment; verify uses DATABASE_URL_APP if set.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { openDb, applyTransactions, recordEvent, deliver, countDeliveries, nowSec, metrics } from '../src/core.js';

const VALUES = {
  status: { pendiente: 'pending', pagada: 'paid', entregada: 'delivered' },
  classification: { valida: 'valid', tardio: 'late', duplicada: 'duplicate', invalida: 'invalid' },
  method: { otro: 'other' }, // other methods (if any) pass through unchanged, like the SQL migration does
};
const tr = (kind, v) => {
  if (kind !== 'method' && !(v in VALUES[kind])) throw new Error(`unknown ${kind} value in SQLite: ${v}`); // fail closed
  return VALUES[kind][v] ?? v;
};
const PK = { orders: 'id', transactions: 'transaction_id', records: 'id', events: 'webhook_id', deliveries: 'order_id' };
const SEQ = [['orders', 'orders_id_seq'], ['records', 'records_id_seq']];
const FEE = 0.03; // only to cross-check metrics(); the real fee is an app setting

// -> { rows: {orders, transactions, records, events, deliveries} (new names), agg: flat {key: number} computed by SQLite itself }
export function readSqlite(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const all = (t) => db.prepare(`SELECT * FROM ${t}`).all();
    const n = (v) => v ?? null;
    const rows = {
      orders: all('ordenes').map((r) => ({ id: r.id, concept: r.concepto, amount_cents: r.monto_centavos, qr_id: n(r.qr_id), token: n(r.token),
        qr_string: n(r.qr_string), qr_image: n(r.qr_image), paid_at: n(r.pagada_en), confirmed_at: n(r.confirmada_en),
        created_at: r.creada_en, expires_at: r.expira_en, status: tr('status', r.estado) })), // attempt/creating_since stay NULL
      transactions: all('transacciones').map((r) => ({ transaction_id: r.transaction_id, order_id: r.orden_id, amount_cents: r.monto_centavos,
        date_paid: n(r.date_paid), classification: tr('classification', r.clasificacion) })),
      records: all('registros').map((r) => ({ id: r.id, concept: r.concepto, amount_cents: r.monto_centavos, method: tr('method', r.metodo), created_at: r.creada_en })),
      // The old system recorded an event when it handled it: it is imported as processed (a resend answers 200 without reprocessing).
      events: all('eventos').map((r) => ({ webhook_id: r.webhook_id, received_at: r.recibido_en, processed_at: r.recibido_en })),
      deliveries: all('entregas').map((r) => ({ order_id: r.orden_id, delivered_at: r.entregada_en })),
    };
    const agg = {};
    const q = (sql) => db.prepare(sql).all();
    for (const r of q('SELECT estado k, COUNT(*) n, COALESCE(SUM(monto_centavos),0) s FROM ordenes GROUP BY estado')) { agg[`orders.${tr('status', r.k)}.n`] = r.n; agg[`orders.${tr('status', r.k)}.s`] = r.s; }
    for (const r of q('SELECT clasificacion k, COUNT(*) n, COALESCE(SUM(monto_centavos),0) s FROM transacciones GROUP BY clasificacion')) { agg[`transactions.${tr('classification', r.k)}.n`] = r.n; agg[`transactions.${tr('classification', r.k)}.s`] = r.s; }
    const rec = q("SELECT COUNT(*) n, COALESCE(SUM(monto_centavos),0) s, COALESCE(SUM(metodo='otro'),0) other FROM registros")[0];
    Object.assign(agg, { 'records.n': rec.n, 'records.s': rec.s, 'records.other': rec.other, 'deliveries.n': q('SELECT COUNT(*) n FROM entregas')[0].n });
    const m = q(`SELECT COUNT(*) charges, COALESCE(SUM(estado IN ('pagada','entregada')),0) paid, COALESCE(SUM(estado='entregada'),0) delivered,
      COALESCE(SUM(CASE WHEN estado IN ('pagada','entregada') THEN monto_centavos ELSE 0 END),0) codi FROM ordenes WHERE qr_id IS NOT NULL`)[0];
    Object.assign(agg, { 'metrics.charges': m.charges, 'metrics.paid': m.paid, 'metrics.delivered': m.delivered, 'metrics.avoidedFeeCents': Math.round(m.codi * FEE) });
    return { rows, agg };
  } finally { db.close(); }
}

// Returns how many rows were inserted per table (0 on a repeat). Sequences end past the highest id.
// Needs an ADMIN connection (setval): the app role ya_cayo_app must not have UPDATE on sequences. verify() runs fine as the app role.
export async function importToPg(db, { rows }) {
  return db.begin(async (t) => {
    const inserted = {};
    for (const [tbl, list] of Object.entries(rows)) {
      inserted[tbl] = list.length ? (await t`INSERT INTO ${t(tbl)} ${t(list)} ON CONFLICT DO NOTHING`).count : 0;
    }
    for (const [tbl, seq] of SEQ) await t.unsafe(`SELECT setval('${seq}', (SELECT MAX(id) FROM ${tbl})) WHERE EXISTS (SELECT 1 FROM ${tbl})`);
    return inserted;
  });
}

async function pgAgg(db) {
  const a = {};
  for (const r of await db`SELECT status k, COUNT(*) n, COALESCE(SUM(amount_cents),0) s FROM orders GROUP BY status`) { a[`orders.${r.k}.n`] = r.n; a[`orders.${r.k}.s`] = r.s; }
  for (const r of await db`SELECT classification k, COUNT(*) n, COALESCE(SUM(amount_cents),0) s FROM transactions GROUP BY classification`) { a[`transactions.${r.k}.n`] = r.n; a[`transactions.${r.k}.s`] = r.s; }
  const [rec] = await db`SELECT COUNT(*) n, COALESCE(SUM(amount_cents),0) s, COUNT(*) FILTER (WHERE method='other') other FROM records`;
  const [dl] = await db`SELECT COUNT(*) n FROM deliveries`;
  const m = await metrics(db, FEE);
  return { ...a, 'records.n': rec.n, 'records.s': rec.s, 'records.other': rec.other, 'deliveries.n': dl.n,
    'metrics.charges': m.charges, 'metrics.paid': m.paid, 'metrics.delivered': m.delivered, 'metrics.avoidedFeeCents': m.avoidedFeeCents };
}

// -> list of discrepancies ([] = identical). Strict by default (Postgres must hold exactly the source);
// { extra: true } = «the imported rows are intact and PG may hold more» (used after Postgres created its own facts).
export async function verify(db, { rows, agg }, { extra = false } = {}) {
  const diffs = [];
  for (const [tbl, list] of Object.entries(rows)) {
    const cols = Object.keys(list[0] ?? {});
    const want = new Map(list.map((r) => [r[PK[tbl]], JSON.stringify(r)]));
    const have = cols.length ? await db.unsafe(`SELECT ${cols.join(',')} FROM ${tbl} ORDER BY ${PK[tbl]}`) : [];
    const [{ n }] = await db.unsafe(`SELECT COUNT(*) n FROM ${tbl}`);
    if (extra ? n < list.length : n !== list.length) diffs.push(`${tbl}: ${n} rows in PG vs ${list.length} in SQLite`);
    const got = new Map(have.map((r) => [r[PK[tbl]], JSON.stringify(r)]));
    for (const [k, v] of want) if (got.get(k) !== v) diffs.push(`${tbl} ${PK[tbl]}=${k}: ${got.has(k) ? 'content differs' : 'missing'}`);
  }
  if (!extra) {
    const have = await pgAgg(db);
    for (const k of new Set([...Object.keys(agg), ...Object.keys(have)])) if ((agg[k] ?? 0) !== (have[k] ?? 0)) diffs.push(`aggregate ${k}: PG ${have[k] ?? 0} vs SQLite ${agg[k] ?? 0}`);
  }
  for (const [tbl, seq] of SEQ) {
    const [s] = await db.unsafe(`SELECT last_value, is_called FROM ${seq}`);
    const [{ m }] = await db.unsafe(`SELECT COALESCE(MAX(id),0) m FROM ${tbl}`);
    if ((s.is_called ? s.last_value + 1 : s.last_value) <= m) diffs.push(`sequence ${seq} would hand out an existing id (max ${m})`);
  }
  return diffs;
}

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const must = (cond, msg) => { if (!cond) throw new Error(`ensayo: ${msg}`); };

// Full rehearsal on a throwaway local database cloned from the migrated template (scripts/pg-test.sh). Throws on any failure.
export async function ensayo(sqlitePath, log = console.log) {
  if (!process.env.DATABASE_URL_TEST_ADMIN && existsSync('.pg-test.env')) process.loadEnvFile('.pg-test.env');
  const { DATABASE_URL_TEST: APP, DATABASE_URL_TEST_ADMIN: ADMIN } = process.env;
  must(APP && ADMIN, 'missing DATABASE_URL_TEST(_ADMIN): run `sh scripts/pg-test.sh` (Docker running)');
  for (const u of [APP, ADMIN]) must(['127.0.0.1', 'localhost'].includes(new URL(u).hostname), 'the rehearsal only runs against local Postgres');
  must(!existsSync(`${sqlitePath}-wal`), 'the SQLite has a -wal file: a plain copy would miss data (stop the writer and checkpoint first)');

  const dir = mkdtempSync(join(tmpdir(), 'ya-cayo-ensayo-'));
  const copy = join(dir, 'backup.sqlite');
  const before = sha(sqlitePath);
  copyFileSync(sqlitePath, copy);
  must(sha(copy) === before, 'the backup copy does not match the source');
  log(`ok  backup ${copy} sha256 ${before.slice(0, 12)}…`);
  const src = readSqlite(copy);
  const counts = Object.fromEntries(Object.entries(src.rows).map(([t, l]) => [t, l.length]));

  const name = `ensayo_${randomBytes(4).toString('hex')}`;
  const admin = postgres(ADMIN, { max: 1, onnotice: () => {}, connect_timeout: 5 });
  await admin.unsafe(`CREATE DATABASE ${name} TEMPLATE ya_cayo_tpl`);
  const u = new URL(APP); u.pathname = `/${name}`;
  const db = openDb(u.toString());
  const adm = openDb(Object.assign(new URL(ADMIN), { pathname: `/${name}` }).toString()); // importer: administrator; the rest: the app role
  try {
    const first = await importToPg(adm, src);
    must(JSON.stringify(first) === JSON.stringify(counts), `first import inserted ${JSON.stringify(first)}, expected ${JSON.stringify(counts)}`);
    let d = await verify(db, src); must(!d.length, `verify after import: ${d.join('; ')}`);
    log(`ok  import ${JSON.stringify(first)} and verification identical`);

    const again = await importToPg(adm, src);
    must(Object.values(again).every((x) => x === 0), `repeat inserted rows: ${JSON.stringify(again)}`);
    d = await verify(db, src); must(!d.length, `verify after repeat: ${d.join('; ')}`);
    log('ok  repeated import: no duplicates, still identical');

    const now = nowSec();
    const [o] = await db`INSERT INTO orders(concept, amount_cents, qr_id, created_at, expires_at) VALUES ('post-cutover', 100, 'QR-POST', ${now - 10}, ${now + 360}) RETURNING id`;
    const [r] = await db`INSERT INTO records(concept, amount_cents, method, created_at) VALUES ('post-cutover', 1, 'other', ${now}) RETURNING id`;
    const maxOf = (t) => Math.max(0, ...src.rows[t].map((x) => x.id));
    must(o.id > maxOf('orders') && r.id > maxOf('records'), `new ids ${o.id}/${r.id} collide with imported ones`);
    log(`ok  sequences: new order ${o.id} and record ${r.id} come after the imported ones`);

    for (const x of src.rows.orders.filter((x) => x.status === 'delivered')) {
      const had = await countDeliveries(db, x.id);
      must(!(await deliver(db, x.id)).ok && (await countDeliveries(db, x.id)) === had && had === 1, `delivered order ${x.id} could be delivered again`);
    }
    log('ok  already-delivered orders cannot be delivered again');

    // Rollback rehearsal: Postgres creates payment + event + delivery, then the importer runs again (traffic back to the old origin).
    const { added } = await applyTransactions(db, o.id, [{ id: 'T-POST', status: 'PAID', amountCents: 100, currency: 'MXN', datePaid: now }]);
    must(added[0]?.classification === 'valid', 'post-cutover payment was not valid');
    must(await recordEvent(db, 'wh-post'), 'post-cutover event not recorded');
    must((await deliver(db, o.id)).ok, 'post-cutover delivery failed');
    must(Object.values(await importToPg(adm, src)).every((x) => x === 0), 'the importer inserted rows after the rollback');
    d = await verify(db, src, { extra: true }); must(!d.length, `imported rows changed after the rollback: ${d.join('; ')}`);
    const [kept] = await db`SELECT (SELECT status FROM orders WHERE id=${o.id}) status, (SELECT COUNT(*) FROM transactions WHERE transaction_id='T-POST') tx,
      (SELECT COUNT(*) FROM events WHERE webhook_id='wh-post') ev, (SELECT COUNT(*) FROM deliveries WHERE order_id=${o.id}) dl`;
    must(kept.status === 'delivered' && kept.tx === 1 && kept.ev === 1 && kept.dl === 1, `post-cutover facts lost: ${JSON.stringify(kept)}`);
    log('ok  rollback: payment, event and delivery created in PG survive a re-run of the importer');
    must(sha(sqlitePath) === before, 'the source SQLite changed during the rehearsal');
    log('ok  source SQLite untouched');
  } finally {
    await Promise.all([db.end({ timeout: 2 }), adm.end({ timeout: 2 })]);
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  }
  return { counts, sha256: before };
}

export const PROD_REF = 'uogquzsxfwpnzrywwsvt';
// Pure guard: the real run only talks to the production Supabase pooler (never localhost, never another project).
export function checkTarget(url, ports) {
  const u = new URL(url);
  const ok = u.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(u.username).endsWith(`.${PROD_REF}`) && [].concat(ports).map(String).includes(u.port);
  if (!ok) throw new Error(`target is not the production pooler (*.pooler.supabase.com:${[].concat(ports).join('|')}, user *.${PROD_REF})`);
}

// The copy must be exactly the one whose hash Diego saw: same sha256, no -wal.
export function loadSource(path, expectedSha) {
  if (!/^[0-9a-f]{64}$/.test(expectedSha ?? '')) throw new Error('--sha256 must be the 64-hex hash of the copy');
  if (existsSync(`${path}-wal`)) throw new Error('the SQLite has a -wal file: copy after the writer stopped and checkpointed');
  if (sha(path) !== expectedSha) throw new Error('sha256 of the SQLite does not match --sha256');
  return readSqlite(path);
}

async function main(args) {
  const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--ensayo')) { const r = await ensayo(arg('--sqlite') ?? './ya-cayo.sqlite'); return console.log('ENSAYO OK', JSON.stringify(r.counts)); }
  const aplicar = args.includes('--aplicar');
  if (!aplicar && !args.includes('--verificar')) throw new Error('usage: --ensayo | --aplicar --sqlite COPY --sha256 HASH | --verificar --sqlite COPY --sha256 HASH [--extra]');
  const admin = process.env.DATABASE_URL_ADMIN;
  if (!admin) throw new Error('missing DATABASE_URL_ADMIN (session pooler :5432, administrator)');
  checkTarget(admin, 5432);
  const src = loadSource(arg('--sqlite'), arg('--sha256'));
  const counts = Object.fromEntries(Object.entries(src.rows).map(([t, l]) => [t, l.length]));
  const adm = openDb(admin, { max: 1 });
  const appUrl = process.env.DATABASE_URL_APP;
  if (appUrl) checkTarget(appUrl, [5432, 6543]); // production runs the session pooler (5432); 6543 stays valid
  const app = appUrl ? openDb(appUrl) : adm;
  try {
    if (aplicar) console.log('inserted', JSON.stringify(await importToPg(adm, src)), 'of', JSON.stringify(counts));
    const diffs = await verify(app, src, { extra: args.includes('--extra') });
    if (diffs.length) throw new Error(`VERIFY FAILED:\n${diffs.join('\n')}`);
    console.log('VERIFY OK', JSON.stringify(counts), `(as ${appUrl ? 'ya_cayo_app' : 'administrator'})`);
  } finally { await Promise.all([adm.end({ timeout: 2 }), app === adm ? 0 : app.end({ timeout: 2 })]); }
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
