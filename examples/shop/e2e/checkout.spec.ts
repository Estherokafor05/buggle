import { test, expect } from '@playwright/test';

test('applies a valid discount code', async ({ page }) => {
  await page.goto('/checkout');
  await page.getByRole('textbox', { name: 'Discount code' }).fill('SAVE10');
  await page.getByRole('button', { name: 'Apply discount' }).click();
  await expect(page.getByTestId('order-total')).toHaveText('£90.00');
});
