import { defineConfig } from '@playwright/test';
import common from './playwright.config';

const baseURL = process.env.CTF_E2E_ISOLATED_URL;
if (process.env.CTF_E2E_ISOLATED !== '1' || !process.env.CTF_E2E_RUN_ID ||
    !baseURL || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL)) {
  throw new Error('Run test:e2e:keys; key mutations require the disposable database harness.');
}

export default defineConfig(common, {
  testIgnore: [],
  testMatch: '**/key-management.spec.ts',
  use: { baseURL },
});
