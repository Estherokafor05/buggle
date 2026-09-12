import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createBuggleServer } from '../src/server.ts';
import { JobStore } from '../src/store.ts';
import { processNext } from '../src/worker.ts';
import { BASE, HEAD, fakeModel, snapshot } from './fixtures.ts';

test('HTTP webhook -> durable job -> proposal -> authenticated result', async t => {
  const store = new JobStore(':memory:');
  const options = { repository: 'example/shop', installationId: 42, botLogin: 'buggle[bot]', webhookSecret: 'test-webhook-secret', apiToken: 'test-api-token' };
  const server = createBuggleServer(store, options);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); store.close(); });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const body = JSON.stringify({ repository: { full_name: 'example/shop' }, installation: { id: 42 }, ref: 'refs/heads/main', before: BASE, after: HEAD });
  const headers = {
    'Content-Type': 'application/json', 'X-GitHub-Event': 'push', 'X-GitHub-Delivery': 'http-delivery',
    'X-Hub-Signature-256': `sha256=${createHmac('sha256', options.webhookSecret).update(body).digest('hex')}`,
  };
  assert.equal((await fetch(`${baseUrl}/webhooks/github`, { method: 'POST', body })).status, 401);
  const queued = await fetch(`${baseUrl}/webhooks/github`, { method: 'POST', headers, body });
  assert.equal(queued.status, 202);
  const result = await queued.json() as { id: string; duplicate: boolean };
  assert.equal(result.duplicate, false);
  const duplicate = await fetch(`${baseUrl}/webhooks/github`, { method: 'POST', headers, body });
  assert.equal((await duplicate.json() as { duplicate: boolean }).duplicate, true);
  const model = fakeModel();
  await processNext(store, { async branchHead() { return HEAD; }, async snapshot() { return snapshot(); } }, model, { maxCallsPerHour: 10 });
  assert.equal((await fetch(`${baseUrl}/runs/${result.id}`)).status, 401);
  const output = await fetch(`${baseUrl}/runs/${result.id}`, { headers: { Authorization: `Bearer ${options.apiToken}` } });
  assert.equal(output.status, 200);
  const run = await output.json() as { status: string; result: { proposal: { files: unknown[] }; validation: { browserExecution: string } } };
  assert.equal(run.status, 'completed'); assert.equal(run.result.proposal.files.length, 1);
  assert.equal(run.result.validation.browserExecution, 'not_run'); assert.equal(model.calls, 1);
  assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
});
