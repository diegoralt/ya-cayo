import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Fixture repo with a synthetic .env: the sweep must flag a leaked DATABASE_URL (whole or password only) and pass a clean tree.
function sweep(leak) {
  const d = mkdtempSync(join(tmpdir(), 'sweep-'));
  mkdirSync(join(d, 'scripts'));
  copyFileSync(new URL('../scripts/secrets-sweep.sh', import.meta.url), join(d, 'scripts/secrets-sweep.sh'));
  writeFileSync(join(d, '.env'), 'DATABASE_URL=postgresql://app.fakeref:Zk39xQpLm27w@host.example.com:5432/postgres\n');
  writeFileSync(join(d, '.gitignore'), '.env\n');
  writeFileSync(join(d, 'notes.txt'), leak ?? 'nothing here\n');
  const git = (...a) => spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' });
  git('init', '-q'); git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'fixture');
  return spawnSync('sh', [join(d, 'scripts/secrets-sweep.sh')], { encoding: 'utf8' });
}

test('secrets-sweep: a clean tree passes; a leaked DATABASE_URL or just its password fails', () => {
  assert.equal(sweep().status, 0);
  assert.equal(sweep('postgresql://app.fakeref:Zk39xQpLm27w@host.example.com:5432/postgres\n').status, 1);
  assert.equal(sweep('password is Zk39xQpLm27w\n').status, 1);
});
