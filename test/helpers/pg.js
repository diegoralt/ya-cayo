// A fresh database per test, copied from the already-migrated template (scripts/pg-test.sh): full isolation
// even if node --test runs the files in parallel. Fails closed: local Postgres only, never DATABASE_URL.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { openDb } from '../../src/core.js';

if (!process.env.DATABASE_URL_TEST && existsSync('.pg-test.env')) process.loadEnvFile('.pg-test.env');
const { DATABASE_URL_TEST: APP, DATABASE_URL_TEST_ADMIN: ADMIN } = process.env;
assert.ok(APP && ADMIN, 'missing DATABASE_URL_TEST(_ADMIN): run `sh scripts/pg-test.sh` (Docker running)');
for (const u of [APP, ADMIN]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(u).hostname), 'tests only run against local Postgres');

const admin = postgres(ADMIN, { max: 1, onnotice: () => {}, connect_timeout: 5 });
const abiertas = [];
const conBase = (url, name) => { const u = new URL(url); u.pathname = `/${name}`; return u.toString(); };

// -> { db, url, openConn(opts), openAdmin() }: db is the app connection (non-superuser role); openConn() gives another independent connection.
export async function newDb(opts = {}) {
  const name = `yc_${process.pid}_${randomBytes(4).toString('hex')}`;
  await admin.unsafe(`CREATE DATABASE ${name} TEMPLATE ya_cayo_tpl`);
  const url = conBase(APP, name);
  const conexiones = [];
  const openConn = (o = {}) => { const c = openDb(url, { ...opts, ...o }); conexiones.push(c); return c; };
  // The migration importer needs setval (a privilege the app role must not have): it runs as the administrator.
  const openAdmin = () => { const c = openDb(conBase(ADMIN, name)); conexiones.push(c); return c; };
  abiertas.push({ name, conexiones });
  return { db: openConn(), url, openConn, openAdmin };
}

after(async () => {
  for (const { name, conexiones } of abiertas) {
    await Promise.all(conexiones.map((c) => c.end({ timeout: 2 })));
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  }
  await admin.end();
});
