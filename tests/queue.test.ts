import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobStore } from '../src/store.ts';
import { processNext } from '../src/worker.ts';
import { BASE, HEAD, NEXT, fakeModel, snapshot } from './fixtures.ts';
import type { Push, Source } from '../src/types.ts';

const push: Push = { repository: 'example/shop', installationId: 1, ref: 'refs/heads/main', base: BASE, head: HEAD };
test('deliveries and equivalent commits are deduplicated across a restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'buggle-'));
  try {
    const path = join(dir, 'jobs.sqlite'); let store = new JobStore(path);
    const first = store.enqueue('delivery-one', push);
    assert.equal(store.enqueue('delivery-one', push).duplicate, true);
    assert.equal(store.enqueue('delivery-two', push).job.id, first.job.id);
    assert.equal(store.claim()?.status, 'running');
    store.close(); store = new JobStore(path); store.recover();
    assert.equal(store.get(first.job.id)?.status, 'queued');
    assert.equal(store.enqueue('delivery-one', push).duplicate, true);
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('an old commit is superseded before model generation', async () => {
  const store = new JobStore(':memory:'); const model = fakeModel();
  const { job } = store.enqueue('delivery', push);
  const source: Source = { async branchHead() { return NEXT; }, async snapshot() { throw new Error('Must not read an old snapshot'); } };
  await processNext(store, source, model, { maxCallsPerHour: 10 });
  assert.equal(store.get(job.id)?.status, 'superseded'); assert.equal(model.calls, 0); store.close();
});
test('late delivery cannot replace the current commit result', async () => {
  const store = new JobStore(':memory:'); const model = fakeModel();
  const latest = store.enqueue('latest', { ...push, head: NEXT });
  const old = store.enqueue('late-old', push);
  const s = snapshot(); s.head = NEXT;
  const source: Source = { async branchHead() { return NEXT; }, async snapshot() { return s; } };
  await processNext(store, source, model, { maxCallsPerHour: 10 });
  await processNext(store, source, model, { maxCallsPerHour: 10 });
  assert.equal(store.get(latest.job.id)?.status, 'completed');
  assert.equal(store.get(old.job.id)?.status, 'superseded'); assert.equal(model.calls, 1); store.close();
});
test('a push arriving during generation invalidates the completed proposal', async () => {
  const store = new JobStore(':memory:'); const model = fakeModel();
  const { job } = store.enqueue('delivery', push);
  let checks = 0;
  const source: Source = { async branchHead() { return ++checks < 3 ? HEAD : NEXT; }, async snapshot() { return snapshot(); } };
  await processNext(store, source, model, { maxCallsPerHour: 10 });
  assert.equal(store.get(job.id)?.status, 'superseded'); assert.equal(store.get(job.id)?.result, null); store.close();
});
test('hourly model cap is enforced in persistent state', () => {
  const store = new JobStore(':memory:'); const now = Date.now();
  assert.equal(store.reserveModelCall(1, now), true);
  assert.equal(store.reserveModelCall(1, now + 1), false);
  assert.equal(store.reserveModelCall(1, now + 3_600_001), true); store.close();
});
test('only actionable failed or needs-context jobs can be retried', () => {
  const store = new JobStore(':memory:'); const { job } = store.enqueue('retry', push);
  assert.equal(store.retry(job.id), false);
  store.finish(job.id, 'failed', null, 'Temporary failure');
  assert.equal(store.retry(job.id), true); assert.equal(store.get(job.id)?.status, 'queued'); store.close();
});
