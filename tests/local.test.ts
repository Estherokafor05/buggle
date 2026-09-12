import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectLocal } from '../src/local.ts';

test('local inspection ignores secret files and symlinks without running repository code', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'buggle-local-'));
  try {
    await writeFile(join(dir, 'package.json'), '{"scripts":{"postinstall":"exit 99"}}');
    await writeFile(join(dir, '.env'), 'SENSITIVE_VALUE=example');
    await writeFile(join(dir, 'source.txt'), 'not selected');
    await symlink(join(dir, 'source.txt'), join(dir, 'README.md'));
    const s = await inspectLocal(dir);
    assert.ok(s.files['package.json']);
    assert.equal(s.paths.includes('.env'), false);
    assert.equal(s.paths.includes('README.md'), false);
    assert.equal(JSON.stringify(s).includes('SENSITIVE_VALUE'), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
