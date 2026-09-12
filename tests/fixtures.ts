import type { Model, Proposal, Snapshot } from '../src/types.ts';

export const BASE = 'a'.repeat(40);
export const HEAD = 'b'.repeat(40);
export const NEXT = 'c'.repeat(40);
export function snapshot(): Snapshot {
  const files = {
    'package.json': JSON.stringify({ scripts: { 'test:e2e': 'playwright test' }, devDependencies: { '@playwright/test': '*' } }),
    'playwright.config.ts': "export default { testDir: './e2e' };",
    'e2e/checkout.spec.ts': "import { test, expect } from '@playwright/test';\ntest('total', async ({ page }) => {\n  await expect(page.getByTestId('total')).toHaveText('£90.00');\n});\n",
    'requirements.md': 'Invalid discount codes must display an alert and preserve the total.',
    'src/checkout.ts': "export const invalidCodeMessage = 'Discount code is not valid';",
  };
  return { repository: 'example/shop', head: HEAD, files, paths: Object.keys(files),
    changes: [{ path: 'src/checkout.ts', status: 'modified', patch: '+ invalid code handling' }], warnings: [] };
}
export function proposal(): Proposal {
  return {
    decision: 'propose_tests', summary: 'Cover an invalid discount code.', reasons: ['The supplied acceptance criteria define the error behaviour.'],
    files: [{ path: 'e2e/invalid-code.spec.ts', reason: 'Cover the invalid-code requirement.', content:
      "import { test, expect } from '@playwright/test';\ntest('invalid code', async ({ page }) => {\n  await page.goto('/checkout');\n  await page.getByRole('textbox', { name: 'Discount code' }).fill('INVALID');\n  await page.getByRole('button', { name: 'Apply discount' }).click();\n  await expect(page.getByRole('alert')).toHaveText('Discount code is not valid');\n});\n" }],
  };
}
export function fakeModel(value = proposal()): Model & { calls: number } {
  return { calls: 0, async propose() { this.calls++; return structuredClone(value); } };
}
