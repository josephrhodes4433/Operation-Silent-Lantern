import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// The runner provisions a disposable real PostgreSQL cluster. Never target a classroom.
export async function verifyAnonymousSessions({ base, outputDir, testCode }) {
  assert.equal(new URL(base).hostname, "127.0.0.1");
  assert.equal(testCode, "ctf-recording-fixture-only");
  const marker = await fetch(`${base}/__ctf_recording_fixture`).then(r => r.json());
  assert.equal(marker.marker, "ctf-recording-fixture-only");
  assert.equal(marker.identityRemoved, true);
  assert.equal(marker.migrationPreserved, true);
  const require = createRequire(import.meta.url);
  const { chromium, expect } = require("../../artifacts/iron-meridian-ctf/node_modules/@playwright/test");
  const browser = await chromium.launch({ headless: true,
    executablePath: "/nix/store/71577rskzyhch3axhdqx7faygc2xyn4v-playwright-browsers-1.55.0-with-cjk/chromium-1187/chrome-linux/chrome" });
  let checks = 3;
  const check = (condition, message) => { assert.ok(condition, message); checks++; };
  const reports = [];
  try {
    for (const app of ["ctf", "lantern"]) {
      const prefix = app === "ctf" ? "/" : "/silent-lantern/";
      const storageKey = app === "ctf" ? "iron-meridian-session" : "silent-lantern-session";
      const api = async (route, method = "GET", body, expected = 200, authorized = false) => {
        const r = await fetch(`${base}/api/${app}${route}`, { method,
          headers: { "content-type": "application/json", ...(authorized ? { "x-instructor-code": testCode } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}) });
        const json = await r.json();
        assert.equal(r.status, expected, `${app} ${method} ${route}: ${JSON.stringify(json)}`);
        checks++;
        return json;
      };
      const anonymous = (teamName, extra = {}) => ({ sessionId: randomUUID(), teamName, instructorName: "Training Instructor",
        ...(app === "lantern" ? { roeAcknowledged: true } : {}), ...extra });
      const noIdentity = value => {
        const raw = JSON.stringify(value);
        check(!/\"(?:name|email|instructorEmail|teamMembers|firstName|lastName)\":/.test(raw), "API omits retired identity and roster fields");
        check(!raw.includes("legacy@example.test") && !raw.includes("Legacy Learner") && !raw.includes("Yesterday Teammate"), "Historical personal details are not exposed");
      };
      check((await api("/window")).state === "not_started", "A page visit does not start the clock");
      const legacy = await api(`/progress/${marker.oldSession}`);
      noIdentity(legacy);
      check(legacy.windowId === null && Object.values(legacy.answers).some(a => a.value === "Historical fixture response" && a.earnedPoints > 0), "Legacy work and accepted scores remain read-only");
      const prior = await api(`/progress/${marker.priorSession}`);
      await api("/progress", "POST", anonymous("No personal data", { email: "rejected@example.test" }), 400);
      await api("/progress", "POST", anonymous("No roster", { additionalTeamMembers: ["Do not retain"] }), 400);
      check((await api("/window")).state === "not_started", "Rejected check-ins do not start the window");

      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
      await context.addInitScript(({ key, sid }) => {
        if (localStorage.getItem("fixture-seeded")) return;
        localStorage.setItem("fixture-seeded", "1");
        localStorage.setItem("old-learner-profile", JSON.stringify({ name: "Retired Customer", email: "retired@example.test" }));
        localStorage.setItem("old-check-in-draft", JSON.stringify({ email: "retired@example.test" }));
        localStorage.setItem(key, JSON.stringify({ sessionId: sid, name: "Retired Customer", email: "retired@example.test", instructorEmail: "retired-teacher@example.test" }));
      }, { key: storageKey, sid: marker.oldSession });
      const page = await context.newPage();
      const retainedRecipients = [];
      page.on("request", request => {
        if (request.url().startsWith(base) && `${request.url()} ${request.postData() ?? ""}`.includes("transient-recipient@example.test")) retainedRecipients.push(request.url());
      });
      await page.goto(`${base}${prefix}activity`);
      await expect(page.getByTestId("button-new-session")).toBeVisible();
      check(!(await page.evaluate(() => JSON.stringify(localStorage))).includes("retired@example.test"), "Old browser identity is scrubbed without losing the resume token");
      await page.getByTestId("button-new-session").click();
      await page.getByTestId("input-teamName").fill("Archive Eagles");
      await page.getByTestId("input-instructorName").fill("Training Instructor");
      if (app === "lantern") await page.getByRole("checkbox").check();
      check(await page.locator('input[type="email"],[data-testid="input-firstName"],[data-testid="input-lastName"]').count() === 0, "Check-in contains no learner names or email inputs");
      await page.screenshot({ path: path.join(outputDir, `${app}-anonymous-check-in.jpg`), fullPage: true });
      const registration = page.waitForResponse(r => r.request().method() === "POST" && r.url().endsWith(`/api/${app}/progress`));
      await page.getByTestId("button-start").click();
      const created = await (await registration).json();
      noIdentity(created);
      check(created.teamName === "Archive Eagles" && created.instructorName === "Training Instructor", "Anonymous check-in saves only permitted identifiers");
      const win = await api("/window");
      check(win.state === "open" && win.windowId === created.windowId, "First group starts the shared window");
      check(Date.parse(win.expiresAt) - Date.parse(win.startedAt) === 86400000, "Window lasts exactly 24 hours");
      const second = await api("/progress", "POST", anonymous("Second Team"));
      check(second.windowId === win.windowId && (await api("/window")).expiresAt === win.expiresAt, "Later groups share the original deadline");
      await api("/progress", "POST", anonymous("  archive   EAGLES "), 409);
      await api("/progress", "POST", anonymous(""), 400);
      await api("/progress", "POST", anonymous("customer@example.test"), 400);
      await api("/progress", "POST", anonymous("No email", { instructorName: "teacher@example.test" }), 400);
      const retry = await api("/progress", "POST", anonymous("Do not overwrite", { sessionId: created.sessionId, instructorName: "Another Instructor" }));
      check(retry.teamName === created.teamName && retry.instructorName === created.instructorName, "Retries do not overwrite the registered team");
      const activity = await api("/activity");
      const written = activity.questions.find(q => q.manualReview && q.section === 1) ?? activity.questions.find(q => q.manualReview);
      assert.ok(written);
      await api(`/progress/${created.sessionId}/answers/${written.id}`, "PUT", { value: "Training-only evidence response for the instructor to review." });
      let saved = await api(`/progress/${created.sessionId}`);
      const review = note => api(`/instructor/submissions/${created.sessionId}/review/${written.id}`, "PUT",
        { decision: "approved_with_feedback", points: written.points, note, responseUpdatedAt: saved.answers[written.id].updatedAt }, 200, true);
      await review("Training feedback delivered inside the app.");
      saved = await api(`/progress/${created.sessionId}`);
      check(saved.answers[written.id].earnedPoints === written.points && saved.answers[written.id].instructorNote.includes("inside the app"), "In-app acceptance awards points and stores feedback");
      await page.reload();
      await expect(page.getByTestId("text-score")).toBeVisible();
      const stored = JSON.parse(await page.evaluate(key => localStorage.getItem(key), storageKey));
      check(Object.keys(stored).every(k => ["sessionId", "teamName", "instructorName"].includes(k)), "Browser session contains only anonymous resume metadata");
      await page.goto(`${base}${prefix}results`);
      await expect(page.getByTestId("button-email-self")).toBeVisible();
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", { name: /Download/i }).first().click();
      const download = await downloaded;
      const text = await readFile(await download.path(), "utf8");
      check(text.includes("Archive Eagles") && !text.includes("retired@example.test") && !text.includes("Legacy Learner"), "Downloaded results omit customer identity");
      await page.getByTestId("button-email-self").click();
      await page.getByTestId("input-share-recipient").fill("transient-recipient@example.test");
      await page.getByTestId("button-open-draft").click();
      await expect(page.getByTestId("input-share-recipient")).toHaveCount(0);
      check(!(await page.evaluate(() => JSON.stringify({ local: localStorage, session: sessionStorage }))).includes("transient-recipient@example.test") && retainedRecipients.length === 0, "Sharing clears recipient and never sends it to the app or storage");
      await page.getByTestId("button-email-instructor").click();
      check(await page.getByTestId("input-share-recipient").inputValue() === "", "Instructor copy requires a fresh transient recipient");
      await page.getByTestId("button-cancel-share").click();
      noIdentity(await api("/instructor/submissions", "GET", undefined, 200, true));
      const board = await api("/leaderboard");
      check(board.every(t => Object.keys(t).every(k => ["teamNumber", "teamName", "percentage"].includes(k))), "Leaderboard reveals only team identity and progress");
      await api("/instructor/window/reopen", "POST", undefined, 401);
      await api("/instructor/window/reopen", "POST", undefined, 409, true);
      check((await api("/window")).expiresAt === win.expiresAt, "Clock cannot be reset early");
      await fetch(`${base}/__ctf_recording_fixture/expire/${app}`, { method: "POST", headers: { "x-fixture-run-id": marker.runId } }).then(r => assert.equal(r.status, 200));
      check((await api("/window")).state === "expired", "Expiry is enforced by the server clock");
      await api(`/progress/${created.sessionId}/answers/${written.id}`, "PUT", { value: "Blocked revision" }, 423);
      await api(`/progress/${created.sessionId}/submit`, "POST", undefined, 423);
      await api("/progress", "POST", anonymous("Blocked late arrival"), 423);
      if (app === "lantern") await api(`/progress/${created.sessionId}/hints/1`, "POST", undefined, 423);
      await review("Late instructor feedback remains available.");
      check((await api(`/progress/${created.sessionId}`)).answers[written.id].value === saved.answers[written.id].value, "Denied writes never alter saved answers");
      await expect(page.getByTestId("panel-window-locked")).toBeVisible({ timeout: 12000 });
      await page.goto(`${base}${prefix}leaderboard`);
      await expect(page.getByTestId("panel-window-locked")).toBeVisible();
      const teacher = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const instructor = await teacher.newPage();
      await instructor.goto(`${base}${prefix}instructor`);
      await instructor.getByTestId("input-code").fill(testCode);
      await instructor.getByTestId("button-verify").click();
      await instructor.getByTestId("tab-archives").click();
      await expect(instructor.getByTestId("session-archives")).toBeVisible();
      check(await instructor.locator("table").count() >= 3, "Instructors can access all dated archives while learners are locked");
      check(!(await instructor.locator("body").innerText()).includes("Legacy Learner"), "Instructor archives omit retired customer details");
      await instructor.getByTestId("select-session-date").selectOption(prior.sessionDate);
      await instructor.getByTestId(`button-open-${marker.priorSession}`).click();
      await expect(instructor.getByTestId("button-back-archives")).toBeVisible();
      await instructor.setViewportSize({ width: 390, height: 844 });
      check(await instructor.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Instructor archive remains usable on mobile");
      await instructor.screenshot({ path: path.join(outputDir, `${app}-anonymous-instructor.jpg`), fullPage: true });
      await page.getByTestId("input-reopen-code").fill("incorrect-fixture-password");
      await page.getByTestId("button-reopen").click();
      await expect(page.getByTestId("text-reopen-error")).toBeVisible();
      check((await api("/window")).state === "expired", "Wrong password cannot reopen the activity");
      await page.getByTestId("input-reopen-code").fill(testCode);
      await page.getByTestId("button-reopen").click();
      await expect(page.getByTestId("panel-window-locked")).toHaveCount(0);
      const reopened = await api("/window");
      check(reopened.state === "not_started" && reopened.windowId !== win.windowId && reopened.expiresAt === null, "Password reopening preserves history and waits for the next first team");
      await api(`/progress/${created.sessionId}/answers/${written.id}`, "PUT", { value: "Old window cannot be reused" }, 423);
      await page.goto(`${base}${prefix}activity`);
      await expect(page.getByTestId("button-new-session")).toBeVisible();
      const newTeam = await api("/progress", "POST", anonymous("Archive Eagles"));
      check(newTeam.sessionId !== created.sessionId && newTeam.windowId === reopened.windowId && Object.keys(newTeam.answers).length === 0, "New window reuses team names without mixing answers");
      check((await api(`/progress/${created.sessionId}`)).answers[written.id].instructorNote.includes("Late instructor"), "Archived responses and late feedback remain intact");
      if (app === "lantern") check((await fetch(`${base}/api/ctf/window`).then(r => r.json())).state === "open", "The two CTF clocks are independent");
      reports.push({ app, passed: true, team: created.teamName, windowHours: 24 });
      await context.close(); await teacher.close();
    }
  } finally { await browser.close(); }
  await writeFile(path.join(outputDir, "anonymous-session-verification.json"), JSON.stringify({ checks, reports, disposableDatabase: true }, null, 2));
  console.log(`ANONYMOUS SESSION VERIFICATION PASSED: ${checks} checks across both apps using disposable PostgreSQL only.`);
}
