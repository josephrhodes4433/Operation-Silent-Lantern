import { readFileSync } from "node:fs";
import path from "node:path";
import { api, exampleAnswer, narration, overlay, pause, recorder, selectAnswer } from "./updated-recording-utils.mjs";

export async function captureUpdatedStudent(options) {
  const { base, outputDir, testCode, lanternMode } = options;
  const activityId = lanternMode ? "lantern" : "ctf";
  const prefix = lanternMode ? "silent-lantern" : "iron-meridian";
  const home = `${base}${lanternMode ? "/silent-lantern/" : "/"}`;
  const request = (...args) => api(base, activityId, testCode, ...args);
  const activity = await request("/activity");
  const guide = await request("/instructor/answer-guide");
  const oldPlan = JSON.parse(readFileSync(path.join(outputDir, "narration-plan.json"), "utf8"));
  const r = await recorder({ ...options, prefix, role: "student", home });
  const { page } = r;
  const questions = [];
  let sid;
  const submitUI = async (card, q, value) => {
    const savedResponse = page.waitForResponse(resp => resp.url().endsWith(`/answers/${q.id}`) && resp.request().method() === "PUT" && resp.status() === 200);
    await selectAnswer(card, q, value);
    if (lanternMode || !q.manualReview) await card.getByTestId(`button-validate-${q.id}`).click();
    await savedResponse;
    await card.getByTestId("banner-result").waitFor();
  };
  const remoteDecision = async (q, decision, note = "") => {
    const p = await request(`/progress/${sid}`);
    await request(`/instructor/submissions/${sid}/review/${q.id}`, "PUT", {
      decision, note, points: q.points, responseUpdatedAt: p.answers[String(q.id)].updatedAt,
    });
    await page.getByTestId("button-refresh").click();
  };
  try {
    await r.scene("intro", "Register one shared team", narration(outputDir, `student-${lanternMode ? "lantern" : "iron"}-intro`), async () => {
      await page.getByTestId("input-firstName").fill("Student");
      await page.getByTestId("input-lastName").fill("Demo");
      await page.getByTestId("input-email").fill("student@example.test");
      await page.getByTestId("input-instructorEmail").fill("instructor@example.test");
      await page.getByTestId("input-teamName").fill("Demo Team");
      if (lanternMode) await page.getByTestId("checkbox-roe").check();
      await pause(1000);
      await page.getByTestId("button-start").click();
      await page.getByTestId(`card-question-${activity.questions[0].id}`).waitFor();
      sid = await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
          try { const v = JSON.parse(localStorage.getItem(key)); if (v?.sessionId) return v.sessionId; } catch {}
        }
        return null;
      });
      if (!sid) throw new Error("Missing shared team session");
    });
    let firstChoice = true, firstManual = true;
    for (const section of activity.sections ?? activity.missions) {
      const sectionId = section.id;
      const sectionQuestions = activity.questions.filter(q => q.section === sectionId);
      if (!sectionQuestions.length) continue;
      let audio;
      if (!lanternMode && sectionId === 8) audio = narration(outputDir, "student-iron-final-section");
      else {
        const old = oldPlan.segments.find(s => s.app === prefix && s.id === `section-${sectionId}`);
        audio = { ...old, filePath: path.join(outputDir, "narration", old.audioFile ?? `${prefix}-${old.id}.mp3`) };
      }
      await r.scene(`section-${sectionId}`, section.title, audio, async () => {
        for (const q of sectionQuestions) {
          const start = r.now();
          const card = page.getByTestId(`card-question-${q.id}`);
          await card.waitFor();
          await card.scrollIntoViewIfNeeded();
          const entry = guide.entries.find(e => e.id === q.id);
          const value = exampleAnswer(q, entry, activityId);
          if (firstChoice && !q.manualReview) {
            const correct = Array.isArray(value) ? value : [value];
            const wrong = q.options.find(o => !correct.includes(o));
            if (wrong) {
              await submitUI(card, q, q.kind === "multiple" ? [wrong] : wrong);
              await card.getByTestId("banner-result").getByText(/Not correct/i).waitFor();
              await pause(950);
            }
            firstChoice = false;
          }
          if (q.manualReview && firstManual) {
            await submitUI(card, q, "Initial demonstration response; insufficient evidence detail.");
            await pause(450);
            await remoteDecision(q, "denied", "Identify the source and explain the finding and its limitation.");
            await card.getByTestId("banner-result").getByText(/Denied by your instructor/i).waitFor();
            await card.scrollIntoViewIfNeeded();
            await pause(850);
            firstManual = false;
          }
          await submitUI(card, q, value);
          if (q.manualReview) {
            await pause(350);
            await remoteDecision(q, "approved_with_feedback", "Accepted in this isolated demonstration. Use and cite your actual assigned evidence.");
            await card.getByTestId("banner-result").getByText(/Accepted by your instructor/i).waitFor();
            await card.scrollIntoViewIfNeeded();
          }
          await pause(300);
          const p = await request(`/progress/${sid}`);
          if (!p.answers[String(q.id)]?.correct) throw new Error(`${prefix} question ${q.id} not completed`);
          questions.push({ questionId: q.id, manualReview: q.manualReview, start, end: r.now(), value, points: p.answers[String(q.id)].earnedPoints });
          if (q.id !== activity.questions.at(-1).id) await page.getByTestId("button-next").click();
        }
      }, sectionQuestions.length * 3.6);
    }
    await r.scene("finish", "Results, final submission, and Leaderboard", narration(outputDir, "student-finish"), async () => {
      await page.getByTestId("button-finish").click();
      await page.getByTestId("button-submit").waitFor();
      await page.getByTestId("button-submit").click();
      await page.getByText(/Marked ready for review/i).waitFor();
      await pause(1400);
      const p = await request(`/progress/${sid}`);
      if (!p.submittedAt || p.answeredCount !== activity.questions.length) throw new Error("Final submission incomplete");
      await page.getByTestId("nav-leaderboard").click();
      await overlay(page);
      await page.getByTestId("text-percent-3").getByText("100%", { exact: true }).waitFor();
      await pause(1500);
    });
    const p = await request(`/progress/${sid}`);
    return await r.close({ sessionId: sid, questions, questionCount: activity.questions.length,
      totalPoints: p.totalPoints, submittedAt: p.submittedAt, home, activity: activityId });
  } catch (e) {
    console.error(e.stack ?? e);
    await page.screenshot({ path: path.join(outputDir, `${prefix}-updated-student-error.png`) }).catch(() => {});
    await r.close({ failed: true, error: String(e), questions }).catch(() => r.context.close());
    throw e;
  }
}
