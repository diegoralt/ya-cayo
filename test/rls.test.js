// RLS y grants: anon/authenticated no pueden nada; el rol del servidor (no superusuario) sí.
// Falla cerrado: sin DATABASE_URL_TEST (o .pg-test.env de scripts/pg-test.sh) no corre; nunca usa DATABASE_URL.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import postgres from 'postgres';

if (!process.env.DATABASE_URL_TEST && existsSync('.pg-test.env')) process.loadEnvFile('.pg-test.env');
const { DATABASE_URL_TEST: APP, DATABASE_URL_TEST_ADMIN: ADMIN } = process.env;
assert.ok(APP && ADMIN, 'falta DATABASE_URL_TEST(_ADMIN): corre `sh scripts/pg-test.sh` (Docker arrancado)');
for (const u of [APP, ADMIN]) {
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(u).hostname), 'las pruebas solo corren contra Postgres local');
}

const opts = { max: 1, onnotice: () => {}, connect_timeout: 5 };
const app = postgres(APP, opts);
const admin = postgres(ADMIN, opts);
after(() => Promise.all([app.end(), admin.end()]));

const TABLAS = ['ordenes', 'transacciones', 'registros', 'eventos', 'entregas'];
const insertar = {
  ordenes: "INSERT INTO ordenes(id, concepto, monto_centavos, creada_en, expira_en) VALUES (1, 'x', 1, 1, 2)",
  transacciones: "INSERT INTO transacciones VALUES ('T', 1, 1, 1, 'valida')",
  registros: "INSERT INTO registros(concepto, monto_centavos, metodo, creada_en) VALUES ('x', 1, 'efectivo', 1)",
  eventos: "INSERT INTO eventos VALUES ('w', 1)",
  entregas: 'INSERT INTO entregas VALUES (1, 1)',
};
const COL = { ordenes: 'monto_centavos', transacciones: 'monto_centavos', registros: 'monto_centavos', eventos: 'recibido_en', entregas: 'entregada_en' };
const ops = (t) => ({
  SELECT: `SELECT * FROM ${t}`,
  INSERT: insertar[t],
  UPDATE: `UPDATE ${t} SET ${COL[t]} = 1`,
  DELETE: `DELETE FROM ${t}`,
});
// Ejecuta como `rol` (SET ROLE desde el admin) dentro de una transacción que siempre se revierte.
const como = (rol, q) =>
  admin.begin(async (s) => {
    await s.unsafe(`SET LOCAL ROLE ${rol}`);
    await s.unsafe(q);
    throw new Error('rollback');
  }).catch((e) => e);

test('el rol del servidor no es superusuario ni salta RLS; las tablas tienen RLS activo', async () => {
  const [r] = await app`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  assert.deepEqual(r, { rolsuper: false, rolbypassrls: false });
  const rows = await app`SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY(${TABLAS}) AND relkind = 'r'`;
  assert.equal(rows.length, TABLAS.length);
  assert.ok(rows.every((x) => x.relrowsecurity), 'RLS activo en todas');
});

for (const rol of ['anon', 'authenticated']) {
  test(`${rol}: SELECT/INSERT/UPDATE/DELETE denegados en todas las tablas (grants revocados)`, async () => {
    for (const t of TABLAS) {
      for (const [op, q] of Object.entries(ops(t))) {
        const e = await como(rol, q);
        assert.equal(e.code, '42501', `${rol} ${op} ${t}: esperaba permission denied, obtuvo ${e.message}`);
      }
    }
  });

  test(`${rol}: aunque se le diera GRANT por error, RLS (sin política) lo sigue bloqueando con datos reales`, async () => {
    const r = await admin.begin(async (s) => {
      // fixtures como admin (salta RLS) para que «0 filas» signifique bloqueo y no tabla vacía
      for (const t of ['ordenes', 'transacciones', 'registros', 'eventos', 'entregas']) await s.unsafe(insertar[t]);
      const res = {};
      for (const t of TABLAS) {
        assert.equal((await s.unsafe(`SELECT 1 FROM ${t}`)).length, 1, `fixture en ${t}`);
        await s.unsafe(`GRANT ALL ON ${t} TO ${rol}`);
      }
      await s.unsafe(`SET LOCAL ROLE ${rol}`);
      for (const t of TABLAS) {
        const q = ops(t);
        res[t] = {
          select: (await s.unsafe(q.SELECT)).length,
          update: (await s.unsafe(q.UPDATE)).count,
          delete: (await s.unsafe(q.DELETE)).count,
          insert: (await s.savepoint((sp) => sp.unsafe(q.INSERT)).catch((e) => e)).code,
        };
      }
      await s.unsafe('RESET ROLE');
      for (const t of TABLAS) res[t].siguen = (await s.unsafe(`SELECT 1 FROM ${t}`)).length;
      throw Object.assign(new Error('rollback'), { res });
    }).catch((e) => e);
    assert.ok(r.res, r.message);
    for (const t of TABLAS) {
      assert.deepEqual(r.res[t], { select: 0, update: 0, delete: 0, insert: '42501', siguen: 1 }, `${rol} sobre ${t}`);
    }
  });
}

test('rol del servidor: SELECT/INSERT/UPDATE/DELETE exitosos en todas las tablas', async () => {
  await app.begin(async (s) => {
    for (const t of ['ordenes', 'transacciones', 'registros', 'eventos', 'entregas']) {
      if (t === 'transacciones') await s.unsafe(insertar.ordenes); // FK (entregas reutiliza la orden 1)
      const q = ops(t);
      const ins = await s.unsafe(q.INSERT);
      assert.equal(ins.count, 1, `INSERT ${t}`);
      assert.ok((await s.unsafe(q.SELECT)).length >= 1, `SELECT ${t}`);
      assert.ok((await s.unsafe(q.UPDATE)).count >= 1, `UPDATE ${t}`);
      assert.ok((await s.unsafe(q.DELETE)).count >= 1, `DELETE ${t}`);
    }
    // identidades: el servidor puede usar las secuencias (la orden 1 explícita no avanza la secuencia: se borra antes)
    await s`DELETE FROM ordenes`;
    await s`INSERT INTO ordenes(concepto, monto_centavos, creada_en, expira_en) VALUES ('y', 1, 1, 2)`;
    throw new Error('rollback'); // no deja datos
  }).catch((e) => assert.equal(e.message, 'rollback', e.message));
});
