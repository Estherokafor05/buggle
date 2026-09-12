import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { OpenAIModel } from '../src/model.ts';
import { GithubSource } from '../src/github.ts';
import { profileRepository } from '../src/profile.ts';
import { BASE, HEAD, proposal, snapshot } from './fixtures.ts';

test('model request uses structured output, supplied source and explicit no-storage setting', async () => {
  let called = false;
  const fetcher: typeof fetch = async (url, init) => {
    called = true; assert.equal(String(url), 'https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
    assert.equal(JSON.parse(body.input).repositoryEvidence.head, HEAD);
    assert.match(body.instructions, /Do not claim tests passed/);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(proposal()) }] }] });
  };
  const s = snapshot(); const output = await new OpenAIModel('test-key', 'test-model', fetcher).propose(s, profileRepository(s));
  assert.equal(called, true); assert.equal(output.decision, 'propose_tests');
});
test('incomplete model output and refusals do not become accepted test results', async () => {
  const s = snapshot();
  for (const envelope of [
    { status: 'incomplete', output: [] },
    { status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'No' }] }] },
    { status: 'completed', output: [{ content: [{ type: 'output_text', text: '{broken' }] }] },
  ]) {
    const model = new OpenAIModel('test-key', 'test-model', async () => Response.json(envelope));
    await assert.rejects(() => model.propose(s, profileRepository(s)));
  }
});
test('GitHub source scopes its installation token and pins contents to the pushed SHA', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const s = snapshot(); const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url.pathname + url.search);
    assert.equal(url.origin, 'https://api.github.com'); assert.equal(init?.redirect, 'error');
    if (url.pathname.endsWith('/access_tokens')) {
      assert.deepEqual(JSON.parse(String(init?.body)), { repositories: ['shop'], permissions: { contents: 'read' } });
      return Response.json({ token: 'fixture-token', expires_at: new Date(Date.now() + 3600_000).toISOString() });
    }
    if (url.pathname.includes('/compare/')) return Response.json({ status: 'ahead', files: s.changes.map(c => ({ filename: c.path, status: c.status, patch: c.patch })) });
    if (url.pathname.includes('/git/commits/')) return Response.json({ tree: { sha: 'd'.repeat(40) } });
    if (url.pathname.includes('/git/trees/')) return Response.json({ truncated: false, tree: s.paths.map(path => ({ path, mode: '100644', type: 'blob', size: 100 })) });
    if (url.pathname.includes('/contents/')) {
      assert.equal(url.searchParams.get('ref'), HEAD);
      const path = decodeURIComponent(url.pathname.split('/contents/')[1]);
      return Response.json({ type: 'file', encoding: 'base64', content: Buffer.from(s.files[path]).toString('base64') });
    }
    return Response.json({ object: { sha: HEAD } });
  };
  const source = new GithubSource({ repository: s.repository, installationId: 42, appId: '1', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), fetcher });
  assert.equal(await source.branchHead(s.repository, 'refs/heads/main'), HEAD);
  const output = await source.snapshot({ repository: s.repository, installationId: 42, ref: 'refs/heads/main', base: BASE, head: HEAD });
  assert.equal(output.files['src/checkout.ts'], s.files['src/checkout.ts']);
  assert.equal(output.head, HEAD); assert.deepEqual(output.warnings, []);
  assert.equal(calls.filter(p => p.endsWith('/access_tokens')).length, 1);
});
