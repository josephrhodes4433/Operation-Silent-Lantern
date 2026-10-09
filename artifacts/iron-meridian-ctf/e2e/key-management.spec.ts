import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { api, flag, onboard, progress, saved, TEST_INSTRUCTOR_CODE } from './helpers';

test('isolated instructor keys regrade saved classroom answers and survive reload', async ({ page, request, browser }) => {
  // This check happens before any mutations. A flag or URL alone is not proof
  // that an arbitrary API is disposable; require the runner's per-run marker.
  expect(process.env.CTF_E2E_ISOLATED).toBe('1');
  const marker = await request.get('/__ctf_e2e');
  expect(marker.ok()).toBeTruthy();
  expect(await marker.json()).toEqual({ isolated: true, runId: process.env.CTF_E2E_RUN_ID });
  const headers = { 'x-instructor-code': TEST_INSTRUCTOR_CODE };
  const keysUrl = `${api}/instructor/keys`;
  const keyUrl = `${keysUrl}/13`;
  const malformedNumbers = ['NaN', 'Infinity', '-Infinity', '12oops', '1e309'];
  const activity = await (await request.get(`${api}/activity`)).json();
  const numeric = activity.questions.find((q: { id: number }) => q.id === 13);
  expect(numeric.kind).toBe('number');
  expect(numeric.points).toBe(10);
  expect(numeric.correctAnswerAvailable).toBe(false);

  const { sid } = await onboard(page);
  await flag(page, sid, 13);
  await page.getByTestId('input-answer-13').fill('1,234');
  await saved(page, 13);
  await expect(page.getByTestId('banner-result')).toContainText('Pending: no answer key');
  await expect(page.getByTestId('button-validate-13')).toHaveCount(0);

  const second = randomUUID();
  expect((await request.post(`${api}/progress`, { data: {
    sessionId: second, name: `Isolated key learner ${second}`,
    email: 'key-fixture@example.invalid', instructorEmail: 'instructor@example.invalid',
  } })).status()).toBe(201);
  // Unrelated fixed/manual responses and submission markers must be preserved.
  for (const session of [sid, second]) {
    expect((await request.put(`${api}/progress/${session}/answers/1`, { data: { value: 'Ctrl+T' } })).ok()).toBeTruthy();
  }
  expect((await request.put(`${api}/progress/${second}/answers/13`, { data: { value: '1235' } })).ok()).toBeTruthy();
  expect((await request.put(`${api}/progress/${sid}/answers/120`, { data: { value: 'Preserve reviewed evidence.' } })).ok()).toBeTruthy();
  expect((await request.put(`${api}/instructor/submissions/${sid}/review/120`, {
    headers, data: { points: 7, note: 'Retain this instructor review' },
  })).ok()).toBeTruthy();
  for (const session of [sid, second]) {
    expect((await request.post(`${api}/progress/${session}/submit`)).ok()).toBeTruthy();
  }
  const before = new Map([
    [sid, await progress(request, sid)],
    [second, await progress(request, second)],
  ]);
  expect(before.get(sid).totalPoints).toBe(12);
  expect(before.get(second).totalPoints).toBe(5);

  const unlock = async (target: Page) => {
    await target.getByTestId('input-code').fill(TEST_INSTRUCTOR_CODE);
    await target.getByTestId('button-verify').click();
    await expect(target.getByTestId('input-key-13')).toBeVisible();
  };
  await page.goto('/instructor');
  await page.getByTestId('input-code').fill('wrong-isolated-code');
  await page.getByTestId('button-verify').click();
  await expect(page.getByTestId('text-gate-error')).toHaveText('That code was not accepted.');
  await expect(page.getByTestId('row-key-13')).toHaveCount(0);

  await test.step('missing and wrong codes cannot read or change classroom keys', async () => {
    const deniedCodes: Record<string, string>[] = [{}, { 'x-instructor-code': 'wrong-isolated-code' }];
    for (const deniedHeaders of deniedCodes) {
      expect((await request.get(keysUrl, { headers: deniedHeaders })).status()).toBe(401);
      expect((await request.put(keyUrl, { headers: deniedHeaders, data: { acceptedAnswers: ['1235'] } })).status()).toBe(401);
    }
    expect(await (await request.get(keysUrl, { headers })).json()).toEqual([]);
    expect((await progress(request, sid)).answers['13'].status).toBe('unkeyed');
    expect((await progress(request, second)).answers['13'].status).toBe('unkeyed');
  });

  const assertClassroom = async (firstCorrect: boolean, secondCorrect: boolean) => {
    const listResponse = await request.get(`${api}/instructor/submissions`, { headers });
    expect(listResponse.ok()).toBeTruthy();
    const list = await listResponse.json();
    for (const [session, correct, base] of [[sid, firstCorrect, 12], [second, secondCorrect, 5]] as const) {
      const learner = await progress(request, session);
      const detailResponse = await request.get(`${api}/instructor/submissions/${session}`, { headers });
      expect(detailResponse.ok()).toBeTruthy();
      const detail = await detailResponse.json();
      const original = before.get(session);
      expect(learner.answers['13']).toMatchObject({
        value: original.answers['13'].value, updatedAt: original.answers['13'].updatedAt,
        correct, status: correct ? 'correct' : 'incorrect', earnedPoints: correct ? 10 : 0,
      });
      expect(learner.totalPoints).toBe(base + (correct ? 10 : 0));
      expect(detail).toEqual(learner);
      expect(list.find((row: { sessionId: string }) => row.sessionId === session).totalPoints).toBe(learner.totalPoints);
      expect(learner.answers['1']).toEqual(original.answers['1']);
      if (session === sid) expect(learner.answers['120']).toEqual(original.answers['120']);
      expect(learner.answeredCount).toBe(original.answeredCount);
      expect(learner.savedAt).toBe(original.savedAt);
      expect(learner.submittedAt).toBe(original.submittedAt);
    }
  };

  await unlock(page);
  const saveKey = async (value: string, acceptedAnswers: string[]) => {
    await page.getByTestId('input-key-13').fill(value);
    const responsePromise = page.waitForResponse(r => r.url().endsWith('/instructor/keys/13') && r.request().method() === 'PUT');
    await page.getByTestId('button-save-key-13').click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ questionId: 13, acceptedAnswers });
    await expect(page.getByTestId('row-key-13')).toContainText('Key saved');
  };

  await test.step('invalid key writes leave the pending classroom unchanged', async () => {
    await expect(page.getByTestId('button-save-key-13')).toBeDisabled();
    await page.getByTestId('input-key-13').fill('  \n ');
    await expect(page.getByTestId('button-save-key-13')).toBeDisabled();
    for (const acceptedAnswers of [[], ['   '], ...malformedNumbers.map(value => [value])]) {
      expect((await request.put(keyUrl, { headers, data: { acceptedAnswers } })).status()).toBe(400);
    }
    expect((await request.put(`${keysUrl}/1`, { headers, data: { acceptedAnswers: ['not a dataset key'] } })).status()).toBe(400);
    expect(await (await request.get(keysUrl, { headers })).json()).toEqual([]);
    expect(await progress(request, sid)).toEqual(before.get(sid));
    expect(await progress(request, second)).toEqual(before.get(second));
  });

  await test.step('UI key creation normalizes numbers and regrades both saved learners', async () => {
    await saveKey(' 1,234 \n 1234.0 \n\n', ['1,234', '1234.0']);
    await assertClassroom(true, false);
    const publicActivity = await (await request.get(`${api}/activity`)).json();
    expect(publicActivity.questions.find((q: { id: number }) => q.id === 13).correctAnswerAvailable).toBe(true);
    expect(publicActivity.questions.every((q: object) => !('acceptedAnswers' in q))).toBe(true);
    // A new learner proves the real save evaluator uses numeric equivalence,
    // not only regrading projections for records saved before key creation.
    const numericSession = randomUUID();
    expect((await request.post(`${api}/progress`, { data: {
      sessionId: numericSession, name: 'Isolated numeric normalization',
      email: 'numeric@example.invalid', instructorEmail: 'instructor@example.invalid',
    } })).ok()).toBeTruthy();
    for (const value of ['1234', ' 1,234 ', '1234.00', '01234']) {
      const response = await request.put(`${api}/progress/${numericSession}/answers/13`, { data: { value } });
      expect(response.ok()).toBeTruthy();
      expect(await response.json()).toMatchObject({ correct: true, status: 'correct', earnedPoints: 10, totalPoints: 10 });
    }
    for (const value of ['1235', 'NaN', 'Infinity']) {
      const response = await request.put(`${api}/progress/${numericSession}/answers/13`, { data: { value } });
      expect(response.ok()).toBeTruthy();
      expect(await response.json()).toMatchObject({ correct: false, status: 'incorrect', earnedPoints: 0, totalPoints: 0 });
    }
  });

  await test.step('malformed numeric edits preserve the active key and every learner score', async () => {
    const activeKeys = await (await request.get(keysUrl, { headers })).json();
    const firstProgress = await progress(request, sid);
    const secondProgress = await progress(request, second);
    // A valid alternative must not make a mixed edit partially succeed.
    for (const value of malformedNumbers) {
      for (const acceptedAnswers of [[value], ['1235', value]]) {
        const response = await request.put(keyUrl, { headers, data: { acceptedAnswers } });
        expect(response.status()).toBe(400);
        expect(await response.json()).toMatchObject({ error: expect.stringContaining('finite number') });
        expect(await (await request.get(keysUrl, { headers })).json()).toEqual(activeKeys);
        expect(await progress(request, sid)).toEqual(firstProgress);
        expect(await progress(request, second)).toEqual(secondProgress);
        await assertClassroom(true, false);
      }
    }

    await page.getByTestId('input-key-13').fill('1235\nNaN');
    const responsePromise = page.waitForResponse(r => r.url().endsWith('/instructor/keys/13') && r.request().method() === 'PUT');
    await page.getByTestId('button-save-key-13').click();
    expect((await responsePromise).status()).toBe(400);
    const row = page.getByTestId('row-key-13');
    await expect(row.getByRole('alert')).toContainText('Every accepted answer must be a finite number');
    await expect(row.getByRole('alert')).toContainText('No keys were changed');
    await expect(row.getByRole('status')).toHaveCount(0);
    await expect(page.getByTestId('input-key-13')).toHaveValue('1235\nNaN');
    expect(await (await request.get(keysUrl, { headers })).json()).toEqual(activeKeys);
    await assertClassroom(true, false);
    await page.reload();
    await unlock(page);
    await expect(page.getByTestId('input-key-13')).toHaveValue('1,234\n1234.0');
  });

  const learnerContext = await browser.newContext({ baseURL: process.env.CTF_E2E_ISOLATED_URL });
  try {
    const learner = await learnerContext.newPage();
    await flag(learner, sid, 13);
    await expect(learner.getByTestId('banner-result')).toContainText('Correct. 10 points');
    await expect(learner.getByTestId('text-score')).toContainText('22');
    await test.step('replacing a key removes stale points and awards the other learner', async () => {
      await saveKey(' 1,235 ', ['1,235']);
      await expect(page.getByTestId('row-key-13').getByRole('alert')).toHaveCount(0);
      await assertClassroom(false, true);
      await learner.reload();
      await expect(learner.getByTestId('input-answer-13')).toHaveValue('1,234');
      await expect(learner.getByTestId('banner-result')).toContainText('Not correct');
      await expect(learner.getByTestId('text-score')).toContainText('12');
      await flag(learner, second, 13);
      await expect(learner.getByTestId('input-answer-13')).toHaveValue('1235');
      await expect(learner.getByTestId('banner-result')).toContainText('Correct. 10 points');
      await expect(learner.getByTestId('text-score')).toContainText('15');
      await learner.reload();
      await expect(learner.getByTestId('banner-result')).toContainText('Correct. 10 points');
    });

    await test.step('saved keys persist after reload and reauthentication', async () => {
      await page.reload();
      await expect(page.getByTestId('form-verify')).toBeVisible();
      await unlock(page);
      await expect(page.getByTestId('input-key-13')).toHaveValue('1,235');
      expect(await (await request.get(keysUrl, { headers })).json()).toEqual([{ questionId: 13, acceptedAnswers: ['1,235'] }]);
      await assertClassroom(false, true);
      await page.getByTestId('tab-subs').click();
      await page.getByTestId(`button-sub-${sid}`).click();
      await expect(page.getByTestId('review-13')).toContainText('Status: incorrect | earned 0');
    });
  } finally {
    await learnerContext.close();
  }
});
