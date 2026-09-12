import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { normalizePush, readablePath, safePath, verifyBearer, verifySignature } from '../src/security.ts';
import { BASE, HEAD } from './fixtures.ts';

test('webhook authentication covers the original bytes and rejects tampering', () => {
  const body = Buffer.from('{"message":"£90"}');
  const signature = `sha256=${createHmac('sha256', 'test-secret').update(body).digest('hex')}`;
  assert.equal(verifySignature(body, signature, 'test-secret'), true);
  assert.equal(verifySignature(Buffer.from('{}'), signature, 'test-secret'), false);
  assert.equal(verifySignature(body, 'sha256=oops', 'test-secret'), false);
  assert.equal(verifySignature(body, undefined, 'test-secret'), false);
});
test('API bearer authentication does not accept missing or partial tokens', () => {
  assert.equal(verifyBearer('Bearer token', 'token'), true);
  assert.equal(verifyBearer('Bearer tok', 'token'), false);
  assert.equal(verifyBearer(undefined, 'token'), false);
});
test('only configured repository and installation can enqueue work', () => {
  const policy = { repository: 'example/shop', installationId: 42, botLogin: 'buggle[bot]' };
  const payload = { repository: { full_name: 'example/shop' }, installation: { id: 42 }, ref: 'refs/heads/main', before: BASE, after: HEAD };
  assert.equal('ignored' in normalizePush(payload, policy), false);
  assert.throws(() => normalizePush({ ...payload, installation: { id: 43 } }, policy));
  assert.throws(() => normalizePush({ ...payload, repository: { full_name: 'elsewhere/shop' } }, policy));
  assert.ok('ignored' in normalizePush({ ...payload, ref: 'refs/heads/buggle/proposal' }, policy));
  assert.ok('ignored' in normalizePush({ ...payload, deleted: true }, policy));
  assert.ok('ignored' in normalizePush({ ...payload, ref: 'refs/tags/v1' }, policy));
  assert.ok('ignored' in normalizePush({ ...payload, sender: { login: 'buggle[bot]' } }, policy));
});
test('source selection excludes secret files and path traversal', () => {
  for (const path of ['../test.spec.ts', '/tmp/test.spec.ts', 'e2e\\test.spec.ts', 'e2e/../test.spec.ts']) assert.equal(safePath(path), false);
  for (const path of ['.env', '.env.production', 'keys/private.pem', 'credentials.json', 'node_modules/foo/index.ts', '.git/config']) assert.equal(readablePath(path), false);
  assert.equal(readablePath('e2e/checkout.spec.ts'), true);
});
