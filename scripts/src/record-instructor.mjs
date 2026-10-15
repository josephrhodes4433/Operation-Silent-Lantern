// Records actual instructor UI in the existing disposable recording fixture.
// Never accepts a live classroom URL or reads the classroom instructor secret.
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

// Capture shorter reading holds, then restore each chapter to its narration
// length in the renderer. UI actions and their actual results stay intact.
const capturePace = 0.35;
const pause = ms => new Promise(r => setTimeout(r, ms * capturePace));
function command(tool, args) {
  const r = spawnSync(tool, args, { encoding: "utf8", maxBuffer: 4e6 });
  if (r.status !== 0) throw new Error(`${tool}: ${r.stderr}`);
  return r.stdout;
}
function seconds(file) {
  return Number(command("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim());
}

export async function captureInstructor({ base, lanternMode, createContext, outputDir, testCode }) {
  const proof = await fetch(`${base}/__ctf_recording_fixture`).then(r => r.json());
  if (proof.marker !== "ctf-recording-fixture-only" || testCode !== proof.marker) throw new Error("Not a disposable fixture");
  const app = lanternMode ? "lantern" : "iron";
  const prefix = lanternMode ? "silent-lantern" : "iron-meridian";
  const title = lanternMode ? "SILENT LANTERN" : "IRON MERIDIAN";
  const api = `${base}/api/${lanternMode ? "lantern" : "ctf"}`;
  const home = `${base}${lanternMode ? "/silent-lantern/" : "/"}`;
  const clips = JSON.parse(readFileSync(path.join(outputDir, "instructor-speech.json"), "utf8")).filter(x => x.app === app);
  const apiCall = async (route, method = "GET", body) => {
    const r = await fetch(api + route, { method, headers: { "content-type": "application/json", "x-instructor-code": testCode }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!r.ok) throw new Error(`${app} ${route}: ${r.status} ${await r.text()}`);
    return r.json();
  };
  const activity = await apiCall("/activity");
  const guide = await apiCall("/instructor/answer-guide");
  const sid = randomUUID();
  const manual = activity.questions.find(q => q.manualReview);
  if (!manual) throw new Error("No written question");
  await apiCall("/progress", "POST", {
    sessionId: sid, name: "Student Demo", email: "student@example.test",
    instructorEmail: "instructor@example.test", ...(lanternMode ? { teamNumber: 3, roeAcknowledged: true } : {}),
  });
  // Prepare a sample session outside the recorded UI. All review decisions in
  // the video are made through the real instructor controls.
  for (const q of activity.questions.filter(q => lanternMode ? q.section === 1 : q.id <= 2)) {
    if (q.manualReview || q.id === 108) continue;
    const entry = guide.entries.find(e => e.id === q.id);
    const value = q.id === 108 ? "CASE:JTF-0427-TEAM3" : q.kind === "multiple" ? entry.answers : entry.answers[0];
    await apiCall(`/progress/${sid}/answers/${q.id}`, "PUT", { value });
  }
  const firstAnswer = lanternMode ? "I would use preservation when needed." : "I found five messaging apps.";
  await apiCall(`/progress/${sid}/answers/${manual.id}`, "PUT", { value: firstAnswer });
  const context = await createContext(`${prefix}-instructor`);
  const page = context.pages()[0] ?? await context.newPage();
  const video = page.video();
  const chapters = [];
  let started;
  const restoreBadge = async () => {
    await page.evaluate(() => {
      if (document.querySelector("#instructor-demo")) return;
      const tag = document.createElement("div");
      tag.id = "instructor-demo";
      tag.style.cssText = "position:fixed;z-index:99999;bottom:10px;right:10px;padding:9px 14px;background:#101a2f;color:white;border:1px solid #f9a943;font:600 12px system-ui;pointer-events:none";
      tag.textContent = "INSTRUCTOR DEMO • SYNTHETIC DATA • AI NARRATION";
      document.body.append(tag);
    });
  };
  const chapter = async (index, action) => {
    await restoreBadge();
    const start = (Date.now() - started) / 1000;
    const clip = clips.find(x => x.index === index);
    const duration = seconds(clip.filePath);
    console.log(`${title}: ${index + 1}. ${clip.title} (${duration.toFixed(1)}s narration)`);
    await action();
    const remaining = (duration + 3) * capturePace - (Date.now() - started) / 1000 + start;
    if (remaining > 0) await new Promise(r => setTimeout(r, remaining * 1000));
    chapters.push({ ...clip, start, end: (Date.now() - started) / 1000, audioDuration: duration });
  };
  const tab = async name => {
    await page.getByTestId(`tab-${name}`).scrollIntoViewIfNeeded();
    await page.getByTestId(`tab-${name}`).click();
    await pause(1000);
  };
  const openStudent = async () => {
    await tab("subs");
    await page.getByTestId(`button-sub-${sid}`).click();
    await page.getByTestId(`review-${manual.id}`).waitFor();
  };
  const reviewCard = () => page.getByTestId(`review-${manual.id}`);
  const viewCard = async () => {
    await reviewCard().scrollIntoViewIfNeeded();
    await pause(1000);
  };
  try {
    await page.goto(home + "activity");
    await page.getByTestId("input-firstName").waitFor();
    started = Date.now();
    await chapter(0, async () => {
      await pause(12000);
      await page.goto(home + "instructor");
      await restoreBadge();
      await page.getByTestId("input-code").fill(testCode);
      await pause(2500);
      await page.getByTestId("button-verify").click();
      await page.getByTestId("input-guide-search").waitFor();
    });
    if (!lanternMode) {
      await chapter(1, async () => {
        await page.getByTestId("select-guide-section").selectOption("3");
        await pause(6500);
        await page.getByTestId("select-guide-section").selectOption("all");
        await page.getByTestId("input-guide-search").fill("false positives");
        await page.getByTestId("guide-entry-61").waitFor();
        await page.getByTestId("guide-entry-61").scrollIntoViewIfNeeded();
      });
      await chapter(2, async () => {
        await tab("keys");
        const row = page.locator('[data-testid^="row-key-"]').first();
        await row.waitFor();
        await pause(9000);
        await row.scrollIntoViewIfNeeded();
        await row.getByRole("button", { name: "Save verified key", exact: true }).click();
        await row.getByText("Key saved", { exact: true }).waitFor();
        await pause(5000);
        await tab("author");
      });
      await chapter(3, async () => {
        await openStudent();
        await pause(9000);
        await page.getByTestId("review-1").scrollIntoViewIfNeeded();
        await pause(5000);
        await viewCard();
      });
      await chapter(4, async () => {
        await viewCard();
        await page.getByTestId(`input-points-${manual.id}`).fill("0");
        await page.getByTestId(`input-note-${manual.id}`).fill("Please identify all five apps, cite the source view, and state any limitation.");
        await page.getByTestId(`button-review-${manual.id}`).click();
        await page.waitForFunction(id => document.querySelector(`[data-testid="button-review-${id}"]`)?.textContent?.trim() === "Saved", manual.id);
        await pause(9000);
        await apiCall(`/progress/${sid}/answers/${manual.id}`, "PUT", {
          value: guide.entries.find(e => e.id === manual.id).sampleResponse + " Demonstration only: verify names and coverage against the assigned extraction.",
        });
        await tab("guide");
        await openStudent();
        await viewCard();
        await page.getByTestId(`input-points-${manual.id}`).fill(String(manual.points));
        await page.getByTestId(`input-note-${manual.id}`).fill("Demonstration revision: the app list and source method are now explained. Verify against classroom evidence.");
        await page.getByTestId(`button-review-${manual.id}`).click();
        await page.waitForFunction(id => document.querySelector(`[data-testid="button-review-${id}"]`)?.textContent?.trim() === "Saved", manual.id);
        const saved = await apiCall(`/instructor/submissions/${sid}`);
        if (saved.answers[String(manual.id)].instructorPoints !== manual.points) throw new Error("IRON review did not persist");
      });
      await chapter(5, async () => {
        await tab("subs");
        await page.getByTestId(`button-sub-${sid}`).scrollIntoViewIfNeeded();
        await pause(18000);
        await page.getByTestId("button-lock").scrollIntoViewIfNeeded();
        await page.getByTestId("button-lock").click();
        await page.getByTestId("input-code").waitFor();
      });
    } else {
      await chapter(1, async () => {
        await page.getByTestId("select-guide-section").selectOption("4");
        await pause(10000);
        await tab("keys");
        await page.getByTestId("row-key-112").waitFor();
        await pause(6000);
        await page.getByTestId("row-key-124").scrollIntoViewIfNeeded();
      });
      await chapter(2, async () => {
        await tab("subs");
        await page.getByTestId("checkbox-pending-only").check();
        await pause(8000);
        await page.getByTestId(`button-sub-${sid}`).click();
        await pause(6000);
        await viewCard();
      });
      await chapter(3, async () => {
        await page.getByTestId(`input-note-${manual.id}`).fill("Describe a specific preservation or inactivity-timer concern; explain the workflow and limitation. No live preserved extraction is required.");
        await pause(7000);
        await page.getByTestId(`button-deny-${manual.id}`).click();
        await reviewCard().getByText(/Status: denied/).waitFor();
        const p = await apiCall(`/instructor/submissions/${sid}`);
        if (p.answers[String(manual.id)].reviewStatus !== "denied" || p.unlockedMission !== 1) throw new Error("Denial or mission gate did not persist");
      });
      await chapter(4, async () => {
        // The learner action is simulated through the real save endpoint; this
        // recording remains focused on the instructor's response to it.
        await apiCall(`/progress/${sid}/answers/${manual.id}`, "PUT", {
          value: "When authorization for examination is pending, I would use the documented Preserved Extraction workflow to preserve data within authorized scope. SafeGuard addresses an iOS inactivity-timer concern. I would document the device state, follow the approved workflow, and not browse content outside authorization. This is a knowledge-based explanation; I have not performed a live preserved extraction.",
        });
        await reviewCard().getByText(/Status: pending/).waitFor({ timeout: 12000 });
        await page.getByTestId(`button-history-${manual.id}`).click();
        await page.getByTestId(`history-${manual.id}`).getByText("Chronological history — submissions and decisions").waitFor();
        await pause(10000);
        await page.getByTestId(`input-note-${manual.id}`).fill("The revision now distinguishes preservation from inactivity-timer protection and states scope limits.");
        await page.getByTestId(`input-points-${manual.id}`).fill(String(manual.points));
        await page.getByTestId(`button-approve-${manual.id}`).click();
        await reviewCard().getByText(/Status: approved/).waitFor();
        // This later flag is legitimately gated by the written approval.
        await apiCall(`/progress/${sid}/answers/108`, "PUT", { value: "CASE:JTF-0427-TEAM3" });
        const p = await apiCall(`/instructor/submissions/${sid}`);
        if (p.answers[String(manual.id)].reviewStatus !== "approved" || p.unlockedMission < 2) throw new Error("Approval did not unlock mission 2");
      });
      await chapter(5, async () => {
        await page.getByTestId(`history-${manual.id}`).scrollIntoViewIfNeeded();
        await pause(13000);
        await page.getByTestId("panel-bonuses").scrollIntoViewIfNeeded();
        await page.getByTestId("select-speed").selectOption("1");
        await page.getByTestId("checkbox-tradecraft").check();
        await page.getByTestId("button-adjust").click();
        await pause(1500);
        const p = await apiCall(`/instructor/submissions/${sid}`);
        if (p.speedBonus !== 1 || p.tradecraftBonus <= 0) throw new Error("Bonus did not persist");
      });
      await chapter(6, async () => {
        await page.getByTestId("checkbox-pending-only").scrollIntoViewIfNeeded();
        await page.getByTestId("checkbox-pending-only").uncheck();
        await pause(19000);
        await page.getByTestId("button-lock").scrollIntoViewIfNeeded();
        await page.getByTestId("button-lock").click();
        await page.getByTestId("input-code").waitFor();
      });
    }
    await page.screenshot({ path: path.join(outputDir, `${prefix}-instructor-final.png`) });
    // recordVideo begins before initial navigation; retain that actual offset.
    const total = (Date.now() - started) / 1000;
    await context.close();
    const raw = await video.path();
    const out = path.join(outputDir, `${prefix}-instructor-raw.webm`);
    // /tmp and workspace may be different mounts; never rename across them.
    copyFileSync(raw, out);
    const rawDuration = seconds(out);
    const offset = Math.max(0, rawDuration - total);
    const manifest = { app, title, video: out, offset, chapters, demoOnly: true, noRealEmail: true };
    writeFileSync(path.join(outputDir, `${prefix}-instructor-coverage.json`), JSON.stringify(manifest, null, 2));
    return manifest;
  } catch (e) {
    await page.screenshot({ path: path.join(outputDir, `${prefix}-instructor-error.png`) }).catch(() => {});
    await context.close();
    throw e;
  }
}
