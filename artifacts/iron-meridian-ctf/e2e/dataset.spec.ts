import { test, expect } from '@playwright/test';
import { api, flag, onboard, saved } from './helpers';

test('dataset pending/keyed validation, multi-select and long email fallback', async ({ page, request }) => {
  const { sid } = await onboard(page);
  let keyed = false;
  const activity = await (await request.get(`${api}/activity`)).json();
  const q = activity.questions.find((q: { id: number }) => q.id === 13);
  const grade = (value: string) => {
    const correct = keyed ? Number(value.replace(/,/g, '')) === 1234 : null;
    return {
      correct, earnedPoints: correct ? q.points : 0,
      status: keyed ? correct ? 'correct' : 'incorrect' : 'unkeyed',
      feedback: 'Isolated browser dataset fixture',
    };
  };
  // Isolate classroom keys without changing ctf_keys. The routes persist real
  // learner answers but project controlled dataset grades for browser assertions.
  // This is UI contract coverage, not an end-to-end shared-key management test.
  await page.route(`**${api}/activity`, route => route.fulfill({
    json: { ...activity, questions: activity.questions.map((item: { id: number }) => item.id === 13 ? { ...item, correctAnswerAvailable: keyed } : item) },
  }));
  await page.route(`**${api}/progress/${sid}`, async route => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.answers['13']) Object.assign(body.answers['13'], grade(body.answers['13'].value));
    body.totalPoints = Object.values(body.answers).reduce((sum: number, a: any) => sum + a.earnedPoints, 0);
    await route.fulfill({ response, json: body });
  });
  await page.route(`**${api}/progress/${sid}/answers/13`, async route => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, ...grade(route.request().postDataJSON().value) } });
  });

  await test.step('no dataset key means pending, never falsely correct', async () => {
    await flag(page, sid, 13);
    await expect(page.getByTestId('button-validate-13')).toHaveCount(0);
    await page.getByTestId('input-answer-13').fill('1,234');
    await saved(page, 13);
    await expect(page.getByTestId('banner-result')).toContainText('Pending: no answer key');
  });

  await test.step('configured numeric dataset key validates incorrect and correct retries', async () => {
    keyed = true;
    await page.reload();
    await expect(page.getByTestId('button-validate-13')).toBeVisible();
    await page.getByTestId('input-answer-13').fill('1235');
    await page.getByTestId('button-validate-13').click();
    await saved(page, 13);
    await expect(page.getByTestId('banner-result')).toContainText('Not correct');
    await page.getByTestId('input-answer-13').fill('1,234');
    await page.getByTestId('button-validate-13').click();
    await saved(page, 13);
    await expect(page.getByTestId('banner-result')).toContainText('Correct. 10 points');
    await page.reload();
    await expect(page.getByTestId('input-answer-13')).toHaveValue('1,234');
    await expect(page.getByTestId('banner-result')).toContainText('Correct');
  });

  await test.step('multi-select requires the exact set, and clearing resets progress', async () => {
    await flag(page, sid, 3);
    await page.getByTestId('option-3-0').check();
    await saved(page, 3);
    await expect(page.getByTestId('banner-result')).toContainText('Not correct');
    await page.getByTestId('option-3-2').check();
    await page.getByTestId('button-validate-3').click();
    await saved(page, 3);
    await expect(page.getByTestId('banner-result')).toContainText('Correct. 5 points');
    await page.getByTestId('option-3-0').uncheck();
    await page.getByTestId('option-3-2').uncheck();
    await saved(page, 3);
    await expect(page.getByTestId('banner-result')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('option-3-0')).not.toBeChecked();
    await expect(page.getByTestId('option-3-2')).not.toBeChecked();
    await expect(page.getByTestId('text-progress')).toContainText('1 of');
  });

  await test.step('large encoded written responses use an attachment reminder rather than a truncated mailto', async () => {
    await flag(page, sid, 120);
    const response = Array(300).fill('証拠資料').join(' ');
    await page.getByTestId('input-answer-120').fill(response);
    await saved(page, 120);
    await page.getByTestId('button-finish').click();
    const href = await page.getByTestId('link-mailto').getAttribute('href');
    const mail = new URL(href!);
    expect(mail.searchParams.get('body')).toContain('Please attach the downloaded results file');
    expect(mail.searchParams.get('body')).not.toContain('証拠資料');
    await expect(page.getByTestId('row-result-120')).toContainText(response);
    // Never click mailto: no email is sent.
  });
});
