import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { api, exampleAnswer, mediaDuration, overlay, pause, selectAnswer } from "./updated-recording-utils.mjs";

async function startRecording(options, role) {
  const { createContext, outputDir, prefix, home, brand } = options;
  const clips = JSON.parse(readFileSync(path.join(outputDir, "workflow-speech-assets.json"), "utf8"));
  const context = await createContext(`${prefix}-anonymous-${role}`);
  const page = context.pages()[0] ?? await context.newPage();
  const video = page.video();
  await page.goto(home + (role === "student" ? "" : "instructor"));
  const started = performance.now();
  const scenes = [];
  const now = () => (performance.now() - started) / 1000;
  const tag = async text => {
    await overlay(page);
    await page.locator("#updated-demo").evaluate((el, text) => { el.textContent = text; }, text);
  };
  const scene = async (id, action) => {
    const clip = clips.find(c => c.id === `${brand}-${role}-${id}`);
    assert.ok(clip, `Missing speech for ${brand}-${role}-${id}`);
    const duration = mediaDuration(clip.filePath) + 3;
    const start = now();
    const cue = async (fraction, work) => {
      await pause(Math.max(0, (duration * fraction - (now() - start)) * 1000));
      await work();
    };
    console.log(`${prefix} ${role}: ${clip.title} (${duration.toFixed(1)}s)`);
    await tag("DEMONSTRATION | SYNTHETIC TRAINING DATA | AI NARRATION");
    await action(cue, tag);
    await pause(Math.max(500, (duration - (now() - start)) * 1000));
    scenes.push({ ...clip, start, end: now() });
  };
  const close = async () => {
    const total = now();
    await context.close();
    const destination = path.join(outputDir, `${prefix}-anonymous-${role}-raw.webm`);
    // Copy before fixture teardown: temp recordings may be on another filesystem.
    copyFileSync(await video.path(), destination);
    const manifest = { role, prefix, video: destination, offset: Math.max(0, mediaDuration(destination) - total), scenes,
      syntheticData: true, aiNarration: true, workflow: "anonymous-shared-24-hour-sessions" };
    writeFileSync(path.join(outputDir, `${prefix}-anonymous-${role}-capture.json`), JSON.stringify(manifest, null, 2));
    return manifest;
  };
  return { context, page, scene, close };
}

export async function captureWorkflowGuides(options) {
  const { base, testCode, outputDir, lanternMode, runId } = options;
  assert.equal(new URL(base).hostname, "127.0.0.1");
  const proof = await fetch(`${base}/__ctf_recording_fixture`).then(r => r.json());
  assert.equal(proof.marker, "ctf-recording-fixture-only");
  assert.equal(proof.runId, runId);
  const activityId = lanternMode ? "lantern" : "ctf";
  const prefix = lanternMode ? "silent-lantern" : "iron-meridian";
  const brand = lanternMode ? "lantern" : "iron";
  const home = `${base}${lanternMode ? "/silent-lantern/" : "/"}`;
  const request = (...args) => api(base, activityId, testCode, ...args);
  const activity = await request("/activity");
  const guide = await request("/instructor/answer-guide");
  const ordered = [...activity.questions].sort((a, b) => a.section - b.section || a.id - b.id);
  const choice = ordered.find(q => !q.manualReview);
  const written = ordered.find(q => q.manualReview && q.kind === "long");
  assert.ok(choice && written);
  const valueFor = (q, teamName) => q.id === 108 && lanternMode
    ? `CASE:JTF-0427-${teamName}` : exampleAnswer(q, guide.entries.find(e => e.id === q.id), activityId);
  const register = async teamName => request("/progress", "POST", {
    sessionId: randomUUID(), teamName, instructorName: "Course Instructor",
    ...(lanternMode ? { roeAcknowledged: true } : {}),
  });
  const decision = async (sid, q, kind, note = "") => {
    const progress = await request(`/progress/${sid}`);
    return request(`/instructor/submissions/${sid}/review/${q.id}`, "PUT", {
      decision: kind, note, points: q.points, responseUpdatedAt: progress.answers[String(q.id)].updatedAt,
    });
  };
  const complete = async (team, stopBefore) => {
    const progress = await request(`/progress/${team.sessionId}`);
    for (const q of ordered) {
      if (q.id === stopBefore) break;
      const old = progress.answers[String(q.id)];
      if (old?.status === "correct" && (!q.manualReview || old.reviewStatus === "approved")) continue;
      await request(`/progress/${team.sessionId}/answers/${q.id}`, "PUT", { value: valueFor(q, team.teamName) });
      if (q.manualReview) await decision(team.sessionId, q, "approved_with_feedback", "Demonstration evidence checked. Verify the assigned training source in a real class.");
    }
  };
  const control = async (action, body) => {
    const response = await fetch(`${base}/__ctf_recording_fixture/${action}/${activityId}`, {
      method: "POST", headers: { "content-type": "application/json", "x-fixture-run-id": runId },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.ok(response.ok, `Fixture control ${action}: ${response.status}`);
    return response.json();
  };
  const optionsWithBrand = { ...options, prefix, brand, home };
  const section = async (page, q) => {
    await page.getByTestId(`button-section-${q.section}`).click();
    // Both activities show one question at a time. Section buttons open their
    // first question, not an arbitrary later question in the same section.
    for (let i = 0; i < ordered.length; i++) {
      await pause(120);
      const card = page.getByTestId(`card-question-${q.id}`);
      if (await card.count()) { await card.scrollIntoViewIfNeeded(); return; }
      const next = page.getByTestId("button-next");
      assert.ok(await next.count() && !await next.isDisabled(), `Cannot navigate to question ${q.id}`);
      await next.click();
    }
    throw new Error(`Question ${q.id} was not reached`);
  };
  const saveUI = async (page, q, value) => {
    const card = page.getByTestId(`card-question-${q.id}`);
    await card.scrollIntoViewIfNeeded();
    const saved = page.waitForResponse(r => r.request().method() === "PUT" && r.url().endsWith(`/answers/${q.id}`) && r.status() === 200);
    await selectAnswer(card, q, value);
    if (lanternMode || !q.manualReview) await card.getByTestId(`button-validate-${q.id}`).click();
    await saved;
    await pause(800);
  };
  const ready = async () => {
    if ((await request("/window")).state === "expired") await request("/instructor/window/reopen", "POST");
  };
  const roles = (process.env.CTF_WORKFLOW_ROLE ?? "student,instructor").split(",");
  const recordings = [];
  if (roles.includes("student")) {
    await ready();
    const recording = await startRecording(optionsWithBrand, "student");
    const { page } = recording;
    let team;
    try {
      await recording.scene("join", async cue => {
        await cue(.0, async () => { await page.goto(home); await pause(1000); });
        await cue(.22, async () => {
          await page.goto(home + "activity");
          await page.getByTestId("input-teamName").fill("Night Watch");
          await page.getByTestId("input-instructorName").fill("Course Instructor");
          if (lanternMode) await page.getByRole("checkbox").check();
        });
        await cue(.57, async () => {
          const registered = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith(`/api/${activityId}/progress`));
          await page.getByTestId("button-start").click();
          team = await (await registered).json();
          assert.ok(team.sessionId && !team.email && !team.name);
          await page.getByTestId(`card-question-${choice.id}`).waitFor();
        });
        await cue(.82, async () => { await page.getByTestId("text-window-countdown").scrollIntoViewIfNeeded(); });
      });
      await recording.scene("choices", async cue => {
        await cue(.0, async () => {
          await section(page, choice);
          const value = valueFor(choice, team.teamName);
          const answers = Array.isArray(value) ? value : [value];
          const wrong = choice.options.find(o => !answers.includes(o));
          assert.ok(wrong);
          await saveUI(page, choice, choice.kind === "multiple" ? [wrong] : wrong);
        });
        await cue(.30, async () => { await saveUI(page, choice, valueFor(choice, team.teamName)); });
        await cue(.56, async () => { await page.reload(); await page.getByTestId("text-score").waitFor(); await section(page, choice); });
        await cue(.77, async () => { await page.getByTestId("text-score").scrollIntoViewIfNeeded(); });
      });
      await recording.scene("written", async (cue, tag) => {
        await cue(.0, async () => {
          await tag("LATER IN THE DEMONSTRATION | WRITTEN-RESPONSE REVIEW");
          await complete(team, written.id);
          await page.reload(); await page.getByTestId("text-score").waitFor(); await section(page, written);
          await saveUI(page, written, "Initial demonstration response: a finding without a clear source, scope or limitation.");
        });
        await cue(.30, async () => {
          await decision(team.sessionId, written, "denied", "Identify the training evidence source, explain the finding and state its limitation. Revise and save a new attempt.");
          await page.getByTestId("button-refresh").click();
          await page.getByTestId(`card-question-${written.id}`).scrollIntoViewIfNeeded();
        });
        await cue(.55, async () => { await saveUI(page, written, valueFor(written, team.teamName)); });
        await cue(.77, async () => {
          await decision(team.sessionId, written, "approved_with_feedback", "The revised demonstration now states its source, scope and limitation. Use only the assigned training evidence.");
          await page.getByTestId("button-refresh").click();
          await page.getByTestId(`card-question-${written.id}`).scrollIntoViewIfNeeded();
        });
      });
      await recording.scene("finish", async (cue, tag) => {
        await cue(.0, async () => {
          await complete(team);
          await page.goto(home + "results");
          const submit = page.getByTestId("button-submit");
          await submit.waitFor();
          if (!await submit.isDisabled()) await submit.click();
          await pause(1000);
        });
        await cue(.22, async () => {
          await page.getByRole("button", { name: /Download/i }).first().click();
          await page.getByTestId("button-email-self").click();
          await page.getByTestId("input-share-recipient").fill("demo@example.test");
          await pause(2000);
          await page.getByTestId("button-open-draft").click();
        });
        await cue(.53, async () => { await page.goto(home + "leaderboard"); await pause(1500); });
        await cue(.73, async () => {
          await control("expire"); await page.reload();
          await page.getByTestId("panel-window-locked").waitFor();
          await tag("SIMULATED 24-HOUR EXPIRY | ISOLATED DEMONSTRATION");
        });
      });
      const submitted = await request(`/progress/${team.sessionId}`);
      assert.ok(submitted.submittedAt, "Student video must show an actual in-app submission");
      recordings.push(await recording.close());
    } catch (error) {
      await page.screenshot({ path: path.join(outputDir, `${prefix}-student-workflow-error.jpg`), fullPage: true }).catch(() => {});
      await recording.context.close(); throw error;
    }
  }
  if (roles.includes("instructor")) {
    await ready();
    const finished = await register("Finished Demo");
    await complete(finished);
    await request(`/progress/${finished.sessionId}/submit`, "POST");
    const historical = await control("archive", { sourceSessionId: finished.sessionId });
    const teams = [];
    for (const name of ["Harbor", "Summit", "Beacon"]) {
      const team = await register(name);
      await complete(team, written.id);
      await request(`/progress/${team.sessionId}/answers/${written.id}`, "PUT", {
        value: name === "Beacon" ? "Initial demonstration finding without a source or limitation." : valueFor(written, name),
      });
      teams.push(team);
    }
    const [harbor, summit, beacon] = teams;
    const recording = await startRecording(optionsWithBrand, "instructor");
    const { page } = recording;
    const unlock = async () => {
      await page.getByTestId("input-code").fill(testCode);
      await page.getByTestId("button-verify").click();
      await page.getByTestId("button-open-queue").waitFor();
    };
    const queue = async () => { await page.getByTestId("button-open-queue").click(); await page.getByTestId("select-queue-sort").waitFor(); };
    const row = team => page.getByTestId(`queue-item-${team.sessionId}-${written.id}`);
    try {
      await recording.scene("prepare", async cue => {
        await cue(.0, async () => { await page.goto(home + "activity"); await page.getByTestId("input-teamName").waitFor(); });
        await cue(.40, async () => { await page.goto(home + "instructor"); await unlock(); });
        await cue(.55, async () => { await page.goto(home + "activity"); await page.getByTestId("text-window-countdown").waitFor(); });
        await cue(.72, async () => { await page.goto(home + "instructor"); await unlock(); await page.getByTestId("tab-guide").click(); await page.getByTestId("select-guide-section").selectOption(lanternMode ? "2" : "1"); });
        await cue(.87, async () => { await page.getByTestId("tab-keys").click(); await page.locator('[data-testid^="row-key-"]').first().waitFor(); });
      });
      await recording.scene("review", async cue => {
        await cue(.0, queue);
        await cue(.12, async () => { await page.getByTestId("select-queue-sort").selectOption("time_desc"); await pause(700); await page.getByTestId("select-queue-sort").selectOption("name_asc"); });
        await cue(.31, async () => {
          await row(harbor).scrollIntoViewIfNeeded();
          await row(harbor).getByTestId(`button-accept-${written.id}`).click();
          await row(harbor).waitFor({ state: "hidden" });
        });
        await cue(.48, async () => {
          await row(summit).scrollIntoViewIfNeeded();
          await row(summit).getByTestId(`input-note-${written.id}`).fill("Accepted: source, reasoning and limitation are clear. Continue using only the training evidence.");
          await row(summit).getByTestId(`button-accept-feedback-${written.id}`).click();
          await row(summit).waitFor({ state: "hidden" });
        });
        await cue(.67, async () => {
          await row(beacon).scrollIntoViewIfNeeded();
          await row(beacon).getByTestId(`input-note-${written.id}`).fill("Identify the training source, explain your finding and state a limitation. Revise and save a new attempt.");
          await row(beacon).getByTestId(`button-deny-${written.id}`).click();
          await row(beacon).waitFor({ state: "hidden" });
        });
      });
      await recording.scene("archives", async cue => {
        await cue(.0, async () => {
          await request(`/progress/${beacon.sessionId}/answers/${written.id}`, "PUT", { value: valueFor(written, beacon.teamName) });
          await page.getByTestId("tab-guide").click(); await queue();
          await row(beacon).scrollIntoViewIfNeeded();
          if (lanternMode) {
            await page.getByTestId("tab-archives").click();
            await page.getByTestId(`button-open-${beacon.sessionId}`).click();
            await page.getByTestId(`button-history-${written.id}`).scrollIntoViewIfNeeded();
            await page.getByTestId(`button-history-${written.id}`).click();
            await page.getByTestId(`history-${written.id}`).waitFor();
            await pause(1600);
          }
        });
        await cue(.24, async () => {
          if (lanternMode) { await page.getByTestId("button-back-archives").click(); await queue(); }
          await row(beacon).getByTestId(`button-accept-${written.id}`).click();
          await row(beacon).waitFor({ state: "hidden" });
          const progress = await request(`/progress/${beacon.sessionId}`);
          assert.equal(progress.answers[String(written.id)].earnedPoints, written.points);
        });
        await cue(.39, async () => {
          await page.getByTestId("tab-archives").click(); await page.getByTestId("session-archives").waitFor();
          await page.getByTestId("select-session-date").selectOption(historical.sessionDate);
        });
        await cue(.59, async () => {
          await page.getByTestId(`button-open-${historical.sessionId}`).click(); await page.getByTestId("button-back-archives").waitFor();
        });
        await cue(.75, async () => { await page.getByTestId("button-open-completions").click(); await pause(1000); });
        await cue(.88, async () => { await page.goto(home + "leaderboard"); await pause(1200); });
      });
      await recording.scene("reopen", async (cue, tag) => {
        await cue(.0, async () => {
          await control("expire"); await page.goto(home + "activity");
          await page.getByTestId("panel-window-locked").waitFor();
          await tag("SIMULATED 24-HOUR EXPIRY | NO LIVE CLASSROOM AFFECTED");
        });
        await cue(.23, async () => { await page.getByTestId("link-locked-instructor").click(); await unlock(); });
        await cue(.43, async () => {
          await page.goto(home + "activity");
          await page.getByTestId("input-reopen-code").fill(testCode);
          await page.getByTestId("button-reopen").click();
          await pause(1000);
          assert.equal((await request("/window")).state, "not_started");
        });
        await cue(.71, async () => { await page.goto(home + "instructor"); await unlock(); await page.getByTestId("tab-archives").click(); await page.getByTestId("session-archives").waitFor(); });
      });
      recordings.push(await recording.close());
    } catch (error) {
      await page.screenshot({ path: path.join(outputDir, `${prefix}-instructor-workflow-error.jpg`), fullPage: true }).catch(() => {});
      await recording.context.close(); throw error;
    }
  }
  return recordings;
}
