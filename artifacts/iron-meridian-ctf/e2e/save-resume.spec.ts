import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { api, flag, onboard, progress, saved } from './helpers';

test('learner onboarding, autosave, in-flight navigation, recovery, private resume and results', async ({ page, context, request, browser, baseURL }) => {
  const { sid, name } = await onboard(page);
  const answerUrl = `${api}/progress/${sid}/answers/1`;

  await test.step('fixed answers validate and can be retried without a penalty', async () => {
    await page.getByTestId('option-1-1').check();
    await saved(page, 1);
    await expect(page.getByTestId('banner-result')).toContainText('Not correct');
    await page.getByTestId('option-1-0').check();
    await page.getByTestId('button-validate-1').click();
    await saved(page, 1);
    await expect(page.getByTestId('banner-result')).toContainText('Correct. 5 points');
    await expect.poll(async () => (await progress(request, sid)).totalPoints).toBe(5);
  });

  await test.step('navigate away while an older save is in flight; the newest edit wins', async () => {
    let entered!: () => void;
    let release!: () => void;
    const arrived = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    let first = true;
    await page.route(`**${answerUrl}`, async route => {
      if (first) { first = false; entered(); await gate; }
      await route.continue();
    });
    await page.getByTestId('option-1-1').check();
    await arrived;
    await page.getByTestId('option-1-0').check();
    await page.getByTestId('button-next').click();
    await expect(page.getByTestId('card-question-2')).toBeVisible();
    release();
    await expect.poll(() => page.evaluate(s => localStorage.getItem(`iron-draft-${s}-1`), sid)).toBeNull();
    await expect.poll(async () => (await progress(request, sid)).answers['1']?.value).toBe('Ctrl+T');
    await page.unroute(`**${answerUrl}`);
    await page.getByTestId('button-prev').click();
    await expect(page.getByTestId('option-1-0')).toBeChecked();
    await expect(page.getByTestId('banner-result')).toContainText('Correct');
  });

  await test.step('reload before the debounce recovers a local draft and saves it', async () => {
    await flag(page, sid, 5);
    await page.getByTestId('input-answer-5').fill('Required = Yes');
    await page.reload();
    await expect(page.getByTestId('input-answer-5')).toHaveValue('Required = Yes');
    await saved(page, 5);
    await expect(page.getByTestId('banner-result')).toContainText('Correct');
    await expect.poll(async () => (await progress(request, sid)).answers['5']?.value).toBe('Required = Yes');
  });

  await test.step('connection loss shows a retry, retains the draft and recovers after reload', async () => {
    await flag(page, sid, 120);
    await context.setOffline(true);
    await page.getByTestId('input-answer-120').fill('Offline evidence draft with independent validation.');
    await expect(page.getByTestId('button-retry-save-120')).toBeVisible();
    expect(await page.evaluate(s => localStorage.getItem(`iron-draft-${s}-120`), sid)).toContain('Offline evidence');
    await context.setOffline(false);
    await page.getByTestId('button-retry-save-120').click();
    await saved(page, 120);
    await expect(page.getByTestId('banner-result')).toContainText('Awaiting instructor review');
    // A failed newer draft must override the older server value on refresh.
    await page.route(`**${api}/progress/${sid}/answers/120`, route => route.abort('failed'));
    await page.getByTestId('input-answer-120').fill('Recovered newer evidence draft.');
    await expect(page.getByTestId('button-retry-save-120')).toBeVisible();
    await page.unroute(`**${api}/progress/${sid}/answers/120`);
    await page.reload();
    await expect(page.getByTestId('input-answer-120')).toHaveValue('Recovered newer evidence draft.');
    await saved(page, 120);
  });

  await test.step('300 words save; 301 remain local and are rejected by the API', async () => {
    const legal = Array(300).fill('evidence').join(' ');
    await page.getByTestId('input-answer-120').fill(legal);
    await expect(page.getByTestId('text-wordcount')).toHaveText('300 / 300 words');
    await saved(page, 120);
    let puts = 0;
    const observe = (req: import('@playwright/test').Request) => {
      if (req.method() === 'PUT' && req.url().endsWith('/answers/120')) puts++;
    };
    page.on('request', observe);
    await page.getByTestId('input-answer-120').fill(`${legal} excess`);
    await expect(page.getByTestId('text-wordcount')).toContainText('301 / 300 words');
    await expect(page.getByTestId('status-save-120')).toContainText('Not saved: over word limit');
    await page.waitForTimeout(1200); // Deliberately wait beyond the 900ms debounce.
    expect(puts).toBe(0);
    page.off('request', observe);
    const rejected = await request.put(`${api}/progress/${sid}/answers/120`, { data: { value: `${legal} excess` } });
    expect(rejected.status()).toBe(400);
    expect((await progress(request, sid)).answers['120'].value).toBe(legal);
    await page.getByTestId('input-answer-120').fill('Final evidence summary for instructor review.');
    await saved(page, 120);
  });

  await test.step('private link resumes in a clean browser; invalid keys fail clearly', async () => {
    await page.getByTestId('button-finish').click();
    await expect(page.getByTestId('row-result-120')).toBeVisible();
    const linkText = await page.getByText('Keep this link private:', { exact: false }).textContent();
    const privateLink = linkText!.replace('Keep this link private: ', '').trim();
    expect(new URL(privateLink).searchParams.get('resume')).toBe(sid);
    const fresh = await browser.newContext({ baseURL });
    try {
      const returning = await fresh.newPage();
      // Exercise the URL produced by Results, not a independently rebuilt link.
      await returning.goto(`${privateLink}&flag=120`);
      await expect(returning.getByTestId('card-question-120')).toBeVisible();
      await expect(returning.getByTestId('input-answer-120')).toHaveValue('Final evidence summary for instructor review.');
      await expect(returning.getByLabel('Progress')).toContainText(name);
      await returning.goto(`/activity?resume=${crypto.randomUUID()}`);
      await expect(returning.getByText('Saved session not found')).toBeVisible({ timeout: 30_000 });
      await returning.getByTestId('button-reset-session').click();
      await expect(returning.getByTestId('input-name')).toBeVisible();
    } finally { await fresh.close(); }
  });

  await test.step('results download and email draft contain the saved answers; nothing is sent', async () => {
    await expect(page.getByTestId('row-result-120')).toContainText('Final evidence summary for instructor review.');
    const href = await page.getByTestId('link-mailto').getAttribute('href');
    const mail = new URL(href!);
    expect(mail.protocol).toBe('mailto:');
    expect(decodeURIComponent(mail.pathname)).toBe('instructor@example.invalid');
    expect(mail.searchParams.get('subject')).toContain(name);
    expect(mail.searchParams.get('body')).toContain('Final evidence summary for instructor review.');
    // Inspect the href only: never launch a mail application or send email.
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('button-download').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('iron-meridian-results.txt');
    const text = await readFile((await download.path())!, 'utf8');
    expect(text).toContain(name);
    expect(text).toContain('Answer: Ctrl+T');
    expect(text).toContain('Final evidence summary for instructor review.');
    expect(text).toContain('(not answered)');
    await page.getByTestId('button-submit').click();
    await expect(page.getByTestId('button-submit')).toHaveText('Marked ready for review');
    expect((await progress(request, sid)).submittedAt).toBeTruthy();
  });
});
