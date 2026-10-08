import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Point at the routed preview, not the Vite port: the API is a separate artifact.
const baseURL = process.env.CTF_E2E_BASE_URL ??
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:80');
// Replit's managed Chromium includes its Nix runtime libraries. A downloaded
// Playwright binary may not resolve those libraries on this host.
const executablePath = process.env.CTF_E2E_CHROMIUM_PATH ??
  (existsSync('/repl/tools/bin/chromium') ? '/repl/tools/bin/chromium' : undefined);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
    launchOptions: { executablePath },
  },
});
