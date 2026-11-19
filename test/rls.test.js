// RLS and grants: anon/authenticated can do nothing; the server role (non-superuser) can.
// Fails closed: without DATABASE_URL_TEST (or .pg-test.env from scripts/pg-test.sh) it does not run; it never uses DATABASE_URL.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import postgres from 'postgres';

if (!process.env.DATABASE_URL_TEST && existsSync('.pg-test.env')) process.loadEnvFile('.pg-test.env');
const { DATABASE_URL_TEST: APP, DATABASE_URL_TEST_ADMIN: ADMIN } = process.env;
assert.ok(APP && ADMIN, 'missing DATABASE_URL_TEST(_ADMIN): run `sh scripts/pg-test.sh` (Docker running)');
for (const u of [APP, ADMIN]) {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(u).hostname), 'tests only run against local Postgres');
}

const opts = { max: 1, onnotice: () => {}, connect_timeout: 5 };
const app = postgres(APP, opts);
const admin = postgres(ADMIN, opts);
after(() => Promise.all([app.end(), admin.end()]));

const TABLES = ['orders', 'transactions', 'records', 'events', 'deliveries', 'limits', 'pending_reconciliation'];
const inserts = {
  orders: "INSERT INTO orders(id, concept, amount_cents, created_at, expires_at) VALUES (1, 'x', 1, 1, 2)",
  transactions: "INSERT INTO transactions VALUES ('T', 1, 1, 1, 'valid')",
  records: "INSERT INTO records(concept, amount_cents, method, created_at) VALUES ('x', 1, 'cash', 1)",
  events: "INSERT INTO events VALUES ('w', 1)",
  deliveries: 'INSERT INTO deliveries VALUES (1, 1)',
  limits: "INSERT INTO limits VALUES ('k', 1, 1)",
  pending_reconciliation: 'INSERT INTO pending_reconciliation VALUES (1, 1)',
};
const COL = { orders: 'amount_cents', transactions: 'amount_cents', records: 'amount_cents', events: 'received_at', deliveries: 'delivered_at', limits: 'value', pending_reconciliation: 'since' };
const ops = (t) => ({
  SELECT: `SELECT * FROM ${t}`,
  INSERT: inserts[t],
  UPDATE: `UPDATE ${t} SET ${COL[t]} = 1`,
  DELETE: `DELETE FROM ${t}`,
});
// Runs as `role` (SET ROLE from the admin) inside a transaction that is always rolled back.
const asRole = (role, q) =>
  admin.begin(async (s) => {
    await s.unsafe(`SET LOCAL ROLE ${role}`);
    await s.unsafe(q);
    throw new Error('rollback');
  }).catch((e) => e);

test('the server role is not a superuser and does not bypass RLS; the tables have RLS enabled', async () => {
  const [r] = await app`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  assert.deepEqual(r, { rolsuper: false, rolbypassrls: false });
  const rows = await app`SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY(${TABLES}) AND relkind = 'r'`;
  assert.equal(rows.length, TABLES.length);
  assert.ok(rows.every((x) => x.relrowsecurity), 'RLS enabled on all');
});

for (const role of ['anon', 'authenticated']) {
  test(`${role}: SELECT/INSERT/UPDATE/DELETE denied on all tables (grants revoked)`, async () => {
    for (const t of TABLES) {
      for (const [op, q] of Object.entries(ops(t))) {
        const e = await asRole(role, q);
        assert.equal(e.code, '42501', `${role} ${op} ${t}: esperaba permission denied, obtuvo ${e.message}`);
      }
    }
  });

  test(`${role}: even if GRANT were given by mistake, RLS (no policy) still blocks it with real data`, async () => {
    const r = await admin.begin(async (s) => {
      // fixtures as admin (bypasses RLS) so «0 rows» means blocked and not an empty table
      for (const t of TABLES) await s.unsafe(inserts[t]);
      const res = {};
      for (const t of TABLES) {
        assert.equal((await s.unsafe(`SELECT 1 FROM ${t}`)).length, 1, `fixture en ${t}`);
        await s.unsafe(`GRANT ALL ON ${t} TO ${role}`);
      }
      await s.unsafe(`SET LOCAL ROLE ${role}`);
      for (const t of TABLES) {
        const q = ops(t);
        res[t] = {
          select: (await s.unsafe(q.SELECT)).length,
          update: (await s.unsafe(q.UPDATE)).count,
          delete: (await s.unsafe(q.DELETE)).count,
          insert: (await s.savepoint((sp) => sp.unsafe(q.INSERT)).catch((e) => e)).code,
        };
      }
      await s.unsafe('RESET ROLE');
      for (const t of TABLES) res[t].siguen = (await s.unsafe(`SELECT 1 FROM ${t}`)).length;
      throw Object.assign(new Error('rollback'), { res });
    }).catch((e) => e);
    assert.ok(r.res, r.message);
    for (const t of TABLES) {
      assert.deepEqual(r.res[t], { select: 0, update: 0, delete: 0, insert: '42501', siguen: 1 }, `${role} sobre ${t}`);
    }
  });
}

test('server role: SELECT/INSERT/UPDATE/DELETE succeed on all tables', async () => {
  await app.begin(async (s) => {
    for (const t of TABLES) {
      if (t === 'transactions') await s.unsafe(inserts.orders); // FK (deliveries reuses order 1)
      const q = ops(t);
      const ins = await s.unsafe(q.INSERT);
      assert.equal(ins.count, 1, `INSERT ${t}`);
      assert.ok((await s.unsafe(q.SELECT)).length >= 1, `SELECT ${t}`);
      assert.ok((await s.unsafe(q.UPDATE)).count >= 1, `UPDATE ${t}`);
      assert.ok((await s.unsafe(q.DELETE)).count >= 1, `DELETE ${t}`);
    }
    // identities: the server can use the sequences (the explicit order 1 does not advance the sequence: it is deleted first)
    await s`DELETE FROM orders`;
    await s`INSERT INTO orders(concept, amount_cents, created_at, expires_at) VALUES ('y', 1, 1, 2)`;
    throw new Error('rollback'); // leaves no data
  }).catch((e) => assert.equal(e.message, 'rollback', e.message));
});

test('default privileges: a table created later is NOT exposed to anon or authenticated (S2)', async () => {
  await admin.unsafe('CREATE TABLE public.future_table (id int)');
  try {
    const [p] = await admin`SELECT has_table_privilege('anon','public.future_table','SELECT') anon_read,
      has_table_privilege('authenticated','public.future_table','INSERT') auth_write`;
    assert.deepEqual({ ...p }, { anon_read: false, auth_write: false });
  } finally { await admin.unsafe('DROP TABLE public.future_table'); }
});

test('default privileges: a function created later is NOT executable by anon or authenticated (PUBLIC EXECUTE revoked)', async () => {
  await admin.unsafe('CREATE FUNCTION public.future_fn() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$');
  try {
    const [p] = await admin`SELECT has_function_privilege('anon','public.future_fn()','EXECUTE') anon_exec,
      has_function_privilege('authenticated','public.future_fn()','EXECUTE') auth_exec`;
    assert.deepEqual({ ...p }, { anon_exec: false, auth_exec: false });
  } finally { await admin.unsafe('DROP FUNCTION public.future_fn()'); }
});
