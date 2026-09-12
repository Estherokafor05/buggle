import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: process.env.PREVIEW_URL, trace: 'retain-on-failure' },
});
