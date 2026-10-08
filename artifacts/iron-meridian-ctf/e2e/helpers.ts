import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const api = '/api/ctf';
// Public, deliberately non-secret code. Only use with a temporary dev override.
export const TEST_INSTRUCTOR_CODE = 'iron-meridian-browser-regression-only';

export async function onboard(page: Page) {
  const name = `Browser regression ${randomUUID()}`;
  await page.goto('/activity');
  await page.getByTestId('button-start').click();
  await expect(page.getByTestId('input-name')).toBeVisible();
  await expect(page.getByTestId('card-question-1')).toHaveCount(0);
  await page.getByTestId('input-name').fill(name);
  await page.getByTestId('input-email').fill('browser-regression@example.invalid');
  await page.getByTestId('input-instructorEmail').fill('instructor@example.invalid');
  await page.getByTestId('button-start').click();
  await expect(page.getByTestId('card-question-1')).toBeVisible();
  const sid = await page.evaluate(() => JSON.parse(localStorage.getItem('iron-meridian-session')!).sessionId as string);
  return { sid, name };
}

export async function progress(request: APIRequestContext, sid: string) {
  const response = await request.get(`${api}/progress/${sid}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

export async function flag(page: Page, sid: string, id: number) {
  await page.goto(`/activity?resume=${sid}&flag=${id}`);
  await expect(page.getByTestId(`card-question-${id}`)).toBeVisible();
}

export async function saved(page: Page, id: number) {
  await expect(page.getByTestId(`status-save-${id}`)).toHaveText(/^Saved /);
}
