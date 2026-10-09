import { defineConfig } from '@playwright/test';

const baseURL = process.env.LANTERN_E2E_URL;
if (process.env.LANTERN_E2E_ISOLATED !== '1' || !process.env.LANTERN_E2E_RUN_ID ||
    !baseURL || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL)) {
  throw new Error('Use test:e2e:history; instructor tests require the disposable database harness.');
}
export default defineConfig({
  testDir: './e2e',
  testMatch: 'instructor-history.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  use: {
    baseURL, headless: true, viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
    launchOptions: process.env.LANTERN_E2E_CHROMIUM_PATH
      ? { executablePath: process.env.LANTERN_E2E_CHROMIUM_PATH } : {},
  },
});
