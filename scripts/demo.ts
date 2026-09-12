import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { inspectLocal } from '../src/local.ts';
import { JobStore } from '../src/store.ts';
import { processNext } from '../src/worker.ts';
import type { Model, Source } from '../src/types.ts';

const root = fileURLToPath(new URL('../examples/shop/', import.meta.url));
const fixture = await inspectLocal(root);
fixture.repository = 'demo/shop';
fixture.head = 'b'.repeat(40);
fixture.files['src/checkout.ts'] = await readFile(resolve(root, 'src/checkout.ts'), 'utf8');
fixture.changes = [{ path: 'src/checkout.ts', status: 'modified', patch: "+ if (code) throw new Error('Discount code is not valid');" }];
const source: Source = { async branchHead() { return fixture.head; }, async snapshot() { return fixture; } };
// Deliberately deterministic: this demo requires no credentials, makes no network
// calls and must never be presented as evidence of live model generation.
const model: Model = { async propose() { return {
  decision: 'propose_tests', summary: 'Add an invalid discount code scenario.',
  reasons: ['The supplied requirements explicitly define the alert and unchanged order total.'],
  files: [{ path: 'e2e/invalid-discount.spec.ts', reason: 'Cover requirements missing from the valid-code test.', content:
    "import { test, expect } from '@playwright/test';\n\ntest('rejects an invalid discount without changing the total', async ({ page }) => {\n  await page.goto('/checkout');\n  await page.getByRole('textbox', { name: 'Discount code' }).fill('INVALID');\n  await page.getByRole('button', { name: 'Apply discount' }).click();\n  await expect(page.getByRole('alert')).toHaveText('Discount code is not valid');\n  await expect(page.getByTestId('order-total')).toHaveText('£100.00');\n});\n" }],
}; } };
const store = new JobStore(':memory:');
const { job } = store.enqueue('demo-delivery', {
  repository: fixture.repository, installationId: 1, ref: 'refs/heads/feature/discount', base: 'a'.repeat(40), head: fixture.head,
});
await processNext(store, source, model, { maxCallsPerHour: 10 });
const result = store.get(job.id)!;
store.close();
const output = resolve('.buggle/demo-report.json');
await mkdir(resolve('.buggle'), { recursive: true });
await writeFile(output, JSON.stringify({ mode: 'offline_fixture', ...result }, null, 2));
console.log(JSON.stringify({ mode: 'offline_fixture', status: result.status,
  proposal: result.result?.proposal.summary, browserExecution: 'not_run', report: output }, null, 2));
if (result.status !== 'completed' || result.result?.proposal.decision !== 'propose_tests') process.exitCode = 1;
