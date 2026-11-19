// Una base nueva por prueba, copiada de la plantilla ya migrada (scripts/pg-test.sh): aislamiento total
// aunque node --test corra los archivos en paralelo. Falla cerrado: solo Postgres local y nunca DATABASE_URL.
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { abrirDb } from '../../src/core.js';

if (!process.env.DATABASE_URL_TEST && existsSync('.pg-test.env')) process.loadEnvFile('.pg-test.env');
const { DATABASE_URL_TEST: APP, DATABASE_URL_TEST_ADMIN: ADMIN } = process.env;
assert.ok(APP && ADMIN, 'falta DATABASE_URL_TEST(_ADMIN): corre `sh scripts/pg-test.sh` (Docker arrancado)');
for (const u of [APP, ADMIN]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(u).hostname), 'las pruebas solo corren contra Postgres local');

const admin = postgres(ADMIN, { max: 1, onnotice: () => {}, connect_timeout: 5 });
const abiertas = [];
const conBase = (url, nombre) => { const u = new URL(url); u.pathname = `/${nombre}`; return u.toString(); };

// -> { db, url, abrir(opts) }: db es la conexión de la app (rol no superusuario); abrir() da otra conexión independiente.
export async function nuevaDb(opts = {}) {
  const nombre = `yc_${process.pid}_${randomBytes(4).toString('hex')}`;
  await admin.unsafe(`CREATE DATABASE ${nombre} TEMPLATE ya_cayo_tpl`);
  const url = conBase(APP, nombre);
  const conexiones = [];
  const abrir = (o = {}) => { const c = abrirDb(url, { ...opts, ...o }); conexiones.push(c); return c; };
  abiertas.push({ nombre, conexiones });
  return { db: abrir(), url, abrir };
}

after(async () => {
  for (const { nombre, conexiones } of abiertas) {
    await Promise.all(conexiones.map((c) => c.end({ timeout: 2 })));
    await admin.unsafe(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
  }
  await admin.end();
});
