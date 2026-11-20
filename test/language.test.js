import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const read = (p) => readFileSync(p, 'utf8');

test('code, config and scripts name no Spanish public file (caja/pagar/maqueta .html)', () => {
  const files = [...walk('src'), ...walk('public'), ...walk('scripts'), 'vercel.json', '.vercelignore', 'api/index.js'];
  for (const f of files) assert.doesNotMatch(read(f), /\b(caja|pagar|maqueta)\.html\b/, f);
});

test('/pagar/ appears only as the legacy alias (server regex, vercel rewrite, sweep route)', () => {
  const allowed = new Set(['src/server.js', 'vercel.json', 'scripts/secrets-sweep.sh']);
  for (const f of [...walk('src'), ...walk('public'), ...walk('scripts'), 'vercel.json', 'api/index.js']) {
    if (/pagar\//.test(read(f))) assert.ok(allowed.has(f), `${f} cites /pagar/`);
  }
  assert.match(read('scripts/secrets-sweep.sh'), /\/pay\/x \/pagar\/x/);
});

test('the rule documents no longer carry the Spanish-route language exception', () => {
  for (const f of ['CLAUDE.md', 'AGENTS.md', 'REVIEW.md', 'docs/agentes.md']) {
    assert.doesNotMatch(read(f), /pagar\.html|maqueta\.html|Excepci[oó]n vigente|excepci[oó]n vigente/, f);
  }
});
