import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFile } from 'node:child_process';
import { createServer } from 'node:http';

// Fixture repo with a synthetic .env: the sweep must flag a leaked DATABASE_URL (whole or password only) and pass a clean tree.
function fixture(leak) {
  const d = mkdtempSync(join(tmpdir(), 'sweep-'));
  mkdirSync(join(d, 'scripts'));
  copyFileSync(new URL('../scripts/secrets-sweep.sh', import.meta.url), join(d, 'scripts/secrets-sweep.sh'));
  writeFileSync(join(d, '.env'), 'DATABASE_URL=postgresql://app.fakeref:Zk39xQpLm27w@host.example.com:5432/postgres\n');
  writeFileSync(join(d, '.gitignore'), '.env\n');
  writeFileSync(join(d, 'notes.txt'), leak ?? 'nothing here\n');
  const git = (...a) => spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' });
  git('init', '-q'); git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'fixture');
  return join(d, 'scripts/secrets-sweep.sh');
}
const sweep = (leak) => spawnSync('sh', [fixture(leak)], { encoding: 'utf8' });

test('secrets-sweep: a clean tree passes; a leaked DATABASE_URL or just its password fails', () => {
  assert.equal(sweep().status, 0);
  assert.equal(sweep('postgresql://app.fakeref:Zk39xQpLm27w@host.example.com:5432/postgres\n').status, 1);
  assert.equal(sweep('password is Zk39xQpLm27w\n').status, 1);
});

test('secrets-sweep with a URL: it requests the payer route /pay/x and not the removed /pagar/x', async () => {
  const seen = [];
  const srv = createServer((req, res) => { seen.push(req.url); res.writeHead(404).end('nope'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const script = fixture();
  const { code } = await new Promise((resolve) => execFile('sh', [script, `http://127.0.0.1:${srv.address().port}`], (err) => resolve({ code: err ? err.code : 0 })));
  srv.close();
  assert.equal(code, 0);
  assert.ok(seen.includes('/pay/x'), `routes requested: ${seen}`);
  assert.ok(!seen.includes('/pagar/x'));
});
