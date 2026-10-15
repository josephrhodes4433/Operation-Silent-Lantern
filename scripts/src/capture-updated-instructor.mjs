import { randomUUID } from "node:crypto";
import path from "node:path";
import { api, exampleAnswer, narration, overlay, pause, recorder } from "./updated-recording-utils.mjs";

export async function captureUpdatedInstructor(options) {
  const { base, outputDir, testCode, lanternMode } = options;
  const activityId = lanternMode ? "lantern" : "ctf";
  const prefix = lanternMode ? "silent-lantern" : "iron-meridian";
  const home = `${base}${lanternMode ? "/silent-lantern/" : "/"}`;
  const request = (...args) => api(base, activityId, testCode, ...args);
  const activity = await request("/activity");
  const guide = await request("/instructor/answer-guide");
  const q = activity.questions.find(q => q.manualReview);
  const sample = exampleAnswer(q, guide.entries.find(e => e.id === q.id), activityId, 4);
  const seeded = [];
  for (const [teamNumber, name] of [[4, "Alex Demo"], [5, "Jamie Demo"]]) {
    const sessionId = randomUUID();
    await request("/progress", "POST", { sessionId, name, teamNumber,
      email: `team${teamNumber}@example.test`, instructorEmail: "instructor@example.test",
      ...(lanternMode ? { roeAcknowledged: true } : {}) });
    for (const before of activity.questions.filter(x => x.id < q.id)) {
      await request(`/progress/${sessionId}/answers/${before.id}`, "PUT", {
        value: exampleAnswer(before, guide.entries.find(e => e.id === before.id), activityId, teamNumber),
      });
    }
    await request(`/progress/${sessionId}/answers/${q.id}`, "PUT", { value: teamNumber === 5
      ? exampleAnswer(q, guide.entries.find(e => e.id === q.id), activityId, 5)
      : "Initial demonstration response without evidence details." });
    seeded.push(sessionId);
  }
  const [alex, jamie] = seeded;
  const r = await recorder({ ...options, prefix, role: "instructor", home });
  const { page } = r;
  const unlock = async () => {
    await page.getByTestId("input-code").fill(testCode);
    await page.getByTestId("button-verify").click();
    await page.getByTestId("button-open-queue").waitFor();
  };
  const queue = async () => {
    await page.getByTestId("button-open-queue").scrollIntoViewIfNeeded();
    await page.getByTestId("button-open-queue").click();
    await page.getByTestId("select-queue-sort").waitFor();
  };
  const card = sid => page.getByTestId(`queue-item-${sid}-${q.id}`);
  try {
    await r.scene("intro", "Brief teams and unlock Instructor", narration(outputDir, `instructor-${lanternMode ? "lantern" : "iron"}-intro`), async () => {
      await pause(1500);
      await unlock();
      await pause(1000);
    });
    await r.scene("guide", "Prepare the guide and evidence references", narration(outputDir, `instructor-${lanternMode ? "lantern" : "iron"}-guide`), async () => {
      await page.getByTestId("select-guide-section").selectOption(lanternMode ? "4" : "3");
      await pause(1500);
      await page.getByTestId("tab-keys").click();
      await page.locator('[data-testid^="row-key-"]').first().waitFor();
      await pause(1500);
      await page.locator('[data-testid^="row-key-"]').first().scrollIntoViewIfNeeded();
    });
    await r.scene("queue", "Find and sort all pending responses", narration(outputDir, "instructor-queue"), async () => {
      await queue();
      await card(alex).waitFor();
      for (const sort of ["time_desc", "name_desc", "name_asc", "time_asc"]) {
        await page.getByTestId("select-queue-sort").selectOption(sort);
        await pause(800);
      }
      await card(alex).scrollIntoViewIfNeeded();
    });
    await r.scene("deny", "Deny with actionable feedback", narration(outputDir, "instructor-deny"), async () => {
      const row = card(alex);
      if (!await row.getByTestId(`button-deny-${q.id}`).isDisabled()) throw new Error("Denial enabled without feedback");
      if (!await row.getByTestId(`button-accept-feedback-${q.id}`).isDisabled()) throw new Error("Feedback acceptance enabled without feedback");
      await row.getByTestId(`input-note-${q.id}`).fill("Identify the evidence source, explain your observation, and state a limitation. Then revise and resubmit.");
      await pause(1300);
      await row.getByTestId(`button-deny-${q.id}`).click();
      await row.waitFor({ state: "hidden" });
      const p = await request(`/progress/${alex}`);
      if (p.answers[String(q.id)].reviewStatus !== "denied" || p.answers[String(q.id)].earnedPoints !== 0) throw new Error("Denial not persisted");
    });
    await r.scene("accept-feedback", "Review a revision and accept with feedback", narration(outputDir, "instructor-accept-feedback"), async () => {
      await request(`/progress/${alex}/answers/${q.id}`, "PUT", { value: sample });
      await page.getByTestId("tab-guide").click();
      await queue();
      const row = card(alex);
      await row.waitFor();
      await row.scrollIntoViewIfNeeded();
      await pause(1700);
      await row.getByTestId(`input-note-${q.id}`).fill("The revised demonstration now identifies its source and reasoning. Use the actual assigned evidence in class.");
      await row.getByTestId(`button-accept-feedback-${q.id}`).click();
      await row.waitFor({ state: "hidden" });
      const p = await request(`/progress/${alex}`);
      if (p.answers[String(q.id)].earnedPoints !== q.points) throw new Error("Acceptance did not add full points");
    });
    await r.scene("accept", "Accept without feedback", narration(outputDir, "instructor-accept-plain"), async () => {
      const row = card(jamie);
      await row.scrollIntoViewIfNeeded();
      await pause(1300);
      await row.getByTestId(`button-accept-${q.id}`).click();
      await row.waitFor({ state: "hidden" });
      await page.getByTestId("panel-queue-empty").waitFor();
    });
    await r.scene("completion", "Receive completion notifications and view the Leaderboard", narration(outputDir, "instructor-completions"), async () => {
      await page.getByTestId("button-open-completions").scrollIntoViewIfNeeded();
      await page.getByTestId("button-open-completions").click();
      const notes = await request("/instructor/notifications");
      if (!notes.some(n => n.teamNumber === 3)) throw new Error("Missing completed team notification");
      const note = notes.find(n => n.teamNumber === 3);
      await page.getByTestId(`notification-${note.id}`).waitFor();
      await pause(1800);
      await page.getByTestId(`button-read-${note.id}`).click();
      await pause(900);
      const refreshed = await request("/instructor/notifications");
      if (!refreshed.find(n => n.id === note.id).readAt) throw new Error("Notification read state not persisted");
      await page.getByTestId("nav-leaderboard").click();
      await overlay(page);
      await page.getByTestId("text-percent-3").getByText("100%", { exact: true }).waitFor();
      await pause(1800);
    });
    await r.scene("close", "Debrief and lock private access", narration(outputDir, "instructor-close"), async () => {
      await page.getByTestId("nav-instructor").click();
      await overlay(page);
      await unlock();
      await page.getByTestId("button-lock").click();
      await page.getByTestId("input-code").waitFor();
      await pause(1000);
    });
    return await r.close({ home, activity: activityId, demoTeams: [3, 4, 5], allThreeReviewActionsVerified: true });
  } catch (e) {
    console.error(e.stack ?? e);
    await page.screenshot({ path: path.join(outputDir, `${prefix}-updated-instructor-error.png`) }).catch(() => {});
    await r.close({ failed: true, error: String(e) }).catch(() => r.context.close());
    throw e;
  }
}
