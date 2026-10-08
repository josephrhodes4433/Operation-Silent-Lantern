import { test, expect } from '@playwright/test';
import { api, flag, onboard, progress, saved, TEST_INSTRUCTOR_CODE } from './helpers';

test('instructor access fails closed and scoring survives a learner resume', async ({ page, request }) => {
  // Never read CTF_INSTRUCTOR_CODE. Full scoring requires the documented temporary
  // development override, not the real classroom credential.
  expect(process.env.CTF_E2E_TEST_INSTRUCTOR, 'Use the temporary test-only instructor override described in e2e/README.md').toBe('1');
  const { sid } = await onboard(page);
  await flag(page, sid, 120);
  await page.getByTestId('input-answer-120').fill('Instructor regression evidence with raw database validation.');
  await saved(page, 120);
  const reviewUrl = `${api}/instructor/submissions/${sid}/review/120`;
  for (const path of ['/instructor/keys', '/instructor/submissions', `/instructor/submissions/${sid}`]) {
    expect((await request.get(`${api}${path}`)).status()).toBe(401);
  }
  expect((await request.put(reviewUrl, { data: { points: 40, note: 'unauthorised' } })).status()).toBe(401);
  expect((await progress(request, sid)).totalPoints).toBe(0);

  await page.goto('/instructor');
  await page.getByTestId('input-code').fill('not-the-instructor-code');
  await page.getByTestId('button-verify').click();
  await expect(page.getByTestId('text-gate-error')).toHaveText('That code was not accepted.');
  await expect(page.getByTestId('tab-subs')).toHaveCount(0);
  await page.getByTestId('input-code').fill(TEST_INSTRUCTOR_CODE);
  await page.getByTestId('button-verify').click();
  await expect(page.getByTestId('tab-subs')).toBeVisible();
  await page.getByTestId('tab-subs').click();
  await page.getByTestId(`button-sub-${sid}`).click();
  await page.getByTestId('input-points-120').fill('41');
  await expect(page.getByTestId('button-review-120')).toBeDisabled();
  const headers = { 'x-instructor-code': TEST_INSTRUCTOR_CODE };
  expect((await request.put(reviewUrl, { headers, data: { points: 41, note: 'too many' } })).status()).toBe(400);
  expect((await request.put(reviewUrl, { headers, data: { points: -1, note: 'negative' } })).status()).toBe(400);
  await page.getByTestId('input-points-120').fill('23');
  await page.getByTestId('input-note-120').fill('Regression review: cite the second validation tool.');
  await page.getByTestId('button-review-120').click();
  await expect(page.getByTestId('button-review-120')).toHaveText('Saved');
  await expect.poll(async () => (await progress(request, sid)).totalPoints).toBe(23);
  await page.getByTestId('button-lock').click();
  await expect(page.getByTestId('form-verify')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('form-verify')).toBeVisible();
  expect(await page.evaluate(() => Object.values(localStorage).some(v => String(v).includes('iron-meridian-browser-regression-only')))).toBe(false);
  await flag(page, sid, 120);
  await expect(page.getByTestId('card-question-120')).toContainText('Regression review: cite the second validation tool.');
  await expect(page.getByTestId('text-score')).toContainText('23');
  await page.getByTestId('link-to-results').click();
  await expect(page.getByTestId('row-result-120')).toContainText('23 / 40 pts');
});
