import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileRepository } from '../src/profile.ts';
import { validateProposal } from '../src/model.ts';
import { analyse } from '../src/worker.ts';
import { snapshot, fakeModel, proposal } from './fixtures.ts';

test('profile learns Playwright, scripts, selectors and the test directory', () => {
  const p = profileRepository(snapshot());
  assert.equal(p.framework, 'playwright');
  assert.equal(p.testDirectory, 'e2e');
  assert.equal(p.scripts['test:e2e'], 'playwright test');
  assert.equal(p.selectorUsage.getByTestId, 1);
  assert.deepEqual(p.warnings, []);
});
test('documentation changes do not spend a model call', async () => {
  const s = snapshot(); s.changes = [{ path: 'README.md', status: 'modified' }];
  const model = fakeModel();
  const report = await analyse(s, model);
  assert.equal(report.proposal.decision, 'no_change'); assert.equal(model.calls, 0);
});
test('missing or truncated context prevents generation', async () => {
  const s = snapshot(); s.warnings.push('Truncated comparison');
  const model = fakeModel();
  const report = await analyse(s, model);
  assert.equal(report.proposal.decision, 'needs_context'); assert.equal(model.calls, 0);
});
test('a proposal is always explicitly unexecuted and requires human review', async () => {
  const model = fakeModel(); const report = await analyse(snapshot(), model);
  assert.equal(model.calls, 1);
  assert.equal(report.proposal.decision, 'propose_tests');
  assert.deepEqual(report.validation, { browserExecution: 'not_run', humanReviewRequired: true });
});
test('proposals cannot escape the test directory or modify application code', () => {
  const s = snapshot(); const p = proposal();
  for (const path of ['e2e/../src/app.spec.ts', 'src/app.ts', '.github/workflows/ci.spec.ts']) {
    p.files[0].path = path;
    assert.throws(() => validateProposal(p, s, profileRepository(s)));
  }
});
test('changing an existing assertion becomes needs-context', async () => {
  const s = snapshot(); const p = proposal();
  p.files = [{ path: 'e2e/checkout.spec.ts', reason: 'Change expectation', content: s.files['e2e/checkout.spec.ts'].replace('£90.00', '£100.00') }];
  const report = await analyse(s, fakeModel(p));
  assert.equal(report.proposal.decision, 'needs_context');
  assert.match(report.proposal.reasons.join(' '), /assertion/);
  assert.deepEqual(report.proposal.files, []);
});
test('obvious skips and sleeps are rejected rather than silently accepted', () => {
  const s = snapshot();
  for (const pattern of ['test.skip(', 'page.waitForTimeout(', 'eval(']) {
    const p = proposal(); p.files[0].content += pattern;
    assert.throws(() => validateProposal(p, s, profileRepository(s)));
  }
});
test('call budget prevents a model request', async () => {
  const model = fakeModel(); const report = await analyse(snapshot(), model, { reserveModelCall: () => false });
  assert.equal(report.proposal.decision, 'needs_context'); assert.equal(model.calls, 0);
});
