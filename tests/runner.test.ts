import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReviewedProposal } from '../src/runner.ts';
import type { BrowserRunRequest, RevisionExecution, RevisionSandbox } from '../src/runner.ts';

const request: BrowserRunRequest = { repository: 'example/shop', baseRevision: 'a'.repeat(40), headRevision: 'b'.repeat(40), files: [{ path: 'e2e/checkout.spec.ts', content: 'reviewed test' }], installCommand: ['npm', 'ci'], testCommand: ['npm', 'run', 'test:e2e'], previewUrl: 'https://preview.invalid' };
function execution(revision: string, exitCode: number, failedTests: string[] = []): RevisionExecution {
  return { revision, phase: 'completed', exitCode, report: `${revision}/report.json`, traces: [`${revision}/trace.zip`], screenshots: [`${revision}/failure.png`], retries: 1, failedTests };
}
function sandbox(results: RevisionExecution[]): RevisionSandbox & { revisions: string[] } {
  return { revisions: [], async execute(_request, revision) { this.revisions.push(revision); return results.shift()!; } };
}

test('a passing head records evidence and does not spend a base run', async () => {
  const fake = sandbox([execution(request.headRevision, 0)]);
  const report = await runReviewedProposal(request, fake);
  assert.equal(report.status, 'passed'); assert.deepEqual(fake.revisions, [request.headRevision]);
  assert.equal(report.executions[0].retries, 1); assert.equal(report.executions[0].traces.length, 1); assert.equal(report.executions[0].screenshots.length, 1);
});
test('a test passing at base and failing at head is an application failure', async () => {
  const fake = sandbox([execution(request.headRevision, 1, ['checkout total']), execution(request.baseRevision, 0)]);
  assert.equal((await runReviewedProposal(request, fake)).status, 'application_failure');
  assert.deepEqual(fake.revisions, [request.headRevision, request.baseRevision]);
});
test('the same failure at base and head is an outdated test without changing assertions', async () => {
  const fake = sandbox([execution(request.headRevision, 1, ['checkout total']), execution(request.baseRevision, 1, ['checkout total'])]);
  assert.equal((await runReviewedProposal(request, fake)).status, 'outdated_tests');
});
test('infrastructure errors and missing comparison evidence are not application failures', async () => {
  const environment = { ...execution(request.headRevision, 1), phase: 'environment_failure' as const, error: 'sandbox unavailable' };
  assert.equal((await runReviewedProposal(request, sandbox([environment]))).status, 'environment_failure');
  const missing = { ...execution(request.baseRevision, 1), report: null };
  assert.equal((await runReviewedProposal(request, sandbox([execution(request.headRevision, 1, ['checkout']), missing]))).status, 'inconclusive');
});
test('untrusted paths, moving revisions and insecure preview URLs never reach the sandbox', async () => {
  for (const changed of [
    { ...request, files: [{ path: '../package.json', content: 'x' }] },
    { ...request, headRevision: 'main' },
    { ...request, previewUrl: 'http://preview.invalid' },
  ]) {
    const fake = sandbox([]);
    await assert.rejects(runReviewedProposal(changed, fake));
    assert.deepEqual(fake.revisions, []);
  }
});
