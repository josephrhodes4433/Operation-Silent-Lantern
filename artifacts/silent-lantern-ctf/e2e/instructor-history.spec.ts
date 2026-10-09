import { test, expect, type Page } from '@playwright/test';

const code = 'lantern-browser-regression-only';
const alpha = '00000000-0000-4000-8000-000000000001';
const bravo = '00000000-0000-4000-8000-000000000002';
const api = '/api/lantern';
const historyPath = (sid: string) => `${api}/instructor/submissions/${sid}/history/6`;

async function unlock(page: Page) {
  await page.getByTestId('input-code').fill(code);
  await page.getByTestId('button-verify').click();
  await expect(page.getByTestId('button-lock')).toBeVisible();
  await page.getByTestId('tab-subs').click();
  await expect(page.getByTestId(`button-sub-${alpha}`)).toBeVisible();
}

// Return a real API response only after the test releases it. This exercises
// query cancellation/unmount races without substituting fake history data.
async function holdHistory(page: Page, sid: string) {
  let release!: () => void;
  let arrived!: () => void;
  let finished!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const seen = new Promise<void>(resolve => { arrived = resolve; });
  const done = new Promise<void>(resolve => { finished = resolve; });
  const pattern = `**${historyPath(sid)}`;
  await page.route(pattern, async route => {
    const response = await route.fetch();
    arrived();
    await held;
    try {
      await route.fulfill({ response });
    } finally {
      finished();
    }
  });
  return { seen, release: async () => { release(); await done; await page.unroute(pattern); } };
}

test('private instructor histories expand, refresh, follow learner selection, and disappear on lock', async ({ page, request, baseURL }) => {
  // Fail closed before any mutations: loopback alone does not prove isolation.
  const identity = await request.get('/__lantern_e2e');
  expect(identity.ok()).toBeTruthy();
  expect(await identity.json()).toEqual({ isolated: true, runId: process.env.LANTERN_E2E_RUN_ID });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Never follow a misconfigured app API to the classroom or external origin.
  await page.route('**/*', route => new URL(route.request().url()).origin === baseURL
    ? route.continue() : route.abort());
  const historyRequests: string[] = [];
  page.on('request', req => {
    if (/\/instructor\/submissions\/[^/]+\/history\/\d+$/.test(new URL(req.url()).pathname)) {
      historyRequests.push(new URL(req.url()).pathname);
      expect(req.headers()['x-instructor-code']).toBe(code);
    }
  });

  const teacher = { 'x-instructor-code': code };
  const denied = await request.put(`${api}/instructor/submissions/${alpha}/review/6`, {
    headers: teacher,
    data: { decision: 'denied', points: 0, note: 'Alpha private revision feedback', responseUpdatedAt: '2026-01-01T00:00:00Z' },
  });
  expect(denied.ok()).toBeTruthy();
  const revised = await request.put(`${api}/progress/${alpha}/answers/6`, {
    data: { value: 'Alpha revised private response with timestamp and source' },
  });
  expect(revised.ok()).toBeTruthy();
  await page.clock.install();
  await page.goto('/silent-lantern/instructor');

  await test.step('locked gate and an incorrect code never expose histories', async () => {
    await expect(page.getByTestId('form-verify')).toBeVisible();
    await expect(page.getByTestId('button-history-6')).toHaveCount(0);
    await page.getByTestId('input-code').fill('wrong-synthetic-code');
    await page.getByTestId('button-verify').click();
    await expect(page.getByTestId('text-gate-error')).toContainText('not accepted');
    expect(historyRequests).toEqual([]);
  });

  await test.step('history loads only when expanded and is scoped per question', async () => {
    await unlock(page);
    await page.getByTestId(`button-sub-${alpha}`).click();
    await expect(page.getByTestId('review-6')).toContainText('Alpha revised private response');
    await expect(page.getByTestId('button-history-6')).toHaveAttribute('aria-expanded', 'false');
    expect(historyRequests).toEqual([]);
    await page.getByTestId('button-history-6').click();
    await expect(page.getByTestId('button-history-6')).toHaveAttribute('aria-expanded', 'true');
    const history = page.getByTestId('history-6');
    await expect(history.locator(':scope > ol > li')).toHaveCount(3);
    await expect(history.locator(':scope > ol > li').nth(0)).toContainText('Imported latest snapshot');
    await expect(history.locator(':scope > ol > li').nth(1)).toContainText('Version 1 | Instructor decision | denied | 0 pts');
    await expect(history.locator(':scope > ol > li').nth(1)).toContainText('Alpha private revision feedback');
    await expect(history.locator(':scope > ol > li').nth(2)).toContainText('Version 2 | Learner submission | pending');
    await expect(history.locator(':scope > ol > li').nth(2)).toContainText('Alpha revised private response');
    await page.getByTestId('button-history-7').click();
    await expect(page.getByTestId('history-7')).toContainText('No written submissions recorded.');
    await expect(history).toBeVisible();
    await page.getByTestId('button-history-7').click();
    await expect(page.getByTestId('history-7')).toHaveCount(0);
    await page.getByTestId('button-history-6').click();
    await expect(history).toHaveCount(0);
    await expect(page.getByTestId('button-history-6')).toHaveAttribute('aria-expanded', 'false');
    await page.getByTestId('button-history-6').click();
    await expect(history.locator(':scope > ol > li')).toHaveCount(3);
    // Freeze periodic refetches: the next decision must refresh by invalidation,
    // not happen to pass because the five-second poll eventually runs.
    await page.clock.pauseAt(new Date());
  });

  await test.step('a newly saved decision appears in the expanded history without reload or polling', async () => {
    const before = historyRequests.filter(url => url === historyPath(alpha)).length;
    await page.getByTestId('input-points-6').fill('4');
    await page.getByTestId('input-note-6').fill('Alpha newly saved private approval');
    const saved = page.waitForResponse(response =>
      response.url().endsWith(`/submissions/${alpha}/review/6`) && response.request().method() === 'PUT');
    const refreshed = Promise.all([
      page.waitForResponse(response => response.url().endsWith(historyPath(alpha))),
      page.waitForResponse(response => response.url().endsWith(`${api}/instructor/submissions/${alpha}`)),
    ]);
    await page.getByTestId('button-approve-6').click();
    expect((await saved).ok()).toBeTruthy();
    for (const response of await refreshed) expect(response.ok()).toBeTruthy();
    // React Query batches observer notifications with zero-delay timers.
    // Flush them without reaching the five-second polling interval.
    await page.clock.runFor(100);
    await expect(page.getByTestId('review-6')).toContainText('Status: approved | earned 4');
    const entries = page.getByTestId('history-6').locator(':scope > ol > li');
    await expect(entries).toHaveCount(4);
    await expect(entries.last()).toContainText('Version 2 | Instructor decision | approved | 4 pts');
    await expect(entries.last()).toContainText('Alpha newly saved private approval');
    expect(historyRequests.filter(url => url === historyPath(alpha)).length).toBeGreaterThan(before);
    await page.clock.resume();
  });

  await test.step('switching learners resets expansion and cannot display another learner’s history', async () => {
    await page.getByTestId(`button-sub-${bravo}`).click();
    await expect(page.getByTestId('review-6')).toContainText('Bravo private response');
    await expect(page.getByTestId('history-6')).toHaveCount(0);
    await expect(page.getByTestId('button-history-6')).toHaveAttribute('aria-expanded', 'false');
    await page.getByTestId('button-history-6').click();
    await expect(page.getByTestId('history-6').locator(':scope > ol > li')).toHaveCount(1);
    await expect(page.getByTestId('history-6')).toContainText('Bravo private response');
    await expect(page.locator('body')).not.toContainText('Alpha newly saved private approval');
    const late = await holdHistory(page, alpha);
    await page.getByTestId(`button-sub-${alpha}`).click();
    await expect(page.getByTestId('button-history-6')).toHaveAttribute('aria-expanded', 'false');
    await page.getByTestId('button-history-6').click();
    await late.seen;
    await page.getByTestId(`button-sub-${bravo}`).click();
    await expect(page.getByTestId('review-6')).toContainText('Bravo private response');
    await late.release();
    await expect(page.getByTestId('history-6')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Alpha newly saved private approval');
  });

  await test.step('lock hides private data even when a history response arrives late', async () => {
    const late = await holdHistory(page, bravo);
    await page.getByTestId('button-history-6').click();
    await late.seen;
    await page.getByTestId('button-lock').click();
    await expect(page.getByTestId('form-verify')).toBeVisible();
    await late.release();
    const before = historyRequests.length;
    await page.clock.fastForward(15_000);
    expect(historyRequests).toHaveLength(before);
    await expect(page.getByTestId('history-6')).toHaveCount(0);
    await expect(page.getByTestId('button-history-6')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('private response');
    await expect(page.locator('body')).not.toContainText('private approval');
    expect((await request.get(historyPath(alpha))).status()).toBe(401);
    expect((await request.get(historyPath(bravo), { headers: { 'x-instructor-code': 'wrong-synthetic-code' } })).status()).toBe(401);
    await page.getByTestId('input-code').fill('wrong-synthetic-code');
    await page.getByTestId('button-verify').click();
    await expect(page.getByTestId('text-gate-error')).toContainText('not accepted');
    await expect(page.getByTestId('history-6')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('form-verify')).toBeVisible();
    await expect(page.getByTestId('input-code')).toHaveValue('');
    expect(historyRequests).toHaveLength(before);
  });

  await test.step('fresh instructor access fetches the selected learner’s history again', async () => {
    const before = historyRequests.filter(url => url === historyPath(alpha)).length;
    await unlock(page);
    await expect(page.getByTestId('history-6')).toHaveCount(0);
    await page.getByTestId(`button-sub-${alpha}`).click();
    await expect(page.getByTestId('button-history-6')).toHaveAttribute('aria-expanded', 'false');
    await page.getByTestId('button-history-6').click();
    await expect(page.getByTestId('history-6').locator(':scope > ol > li')).toHaveCount(4);
    await expect(page.getByTestId('history-6')).toContainText('Alpha newly saved private approval');
    await expect(page.getByTestId('history-6')).not.toContainText('Bravo private response');
    expect(historyRequests.filter(url => url === historyPath(alpha)).length).toBeGreaterThan(before);
    expect(errors).toEqual([]);
  });
});
