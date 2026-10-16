import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";

// Run only through record-ctf-walkthroughs.mjs's disposable PostgreSQL fixture.
export async function verifyDatedTeams({ base, outputDir, testCode }) {
  assert.equal(new URL(base).hostname, "127.0.0.1");
  const marker = await fetch(`${base}/__ctf_recording_fixture`).then(r => r.json());
  assert.equal(marker.marker, "ctf-recording-fixture-only");
  assert.equal(marker.migrationPreserved, true);
  assert.equal(testCode, "ctf-recording-fixture-only");
  const require = createRequire(import.meta.url);
  const { chromium } = require("../../artifacts/iron-meridian-ctf/node_modules/@playwright/test");
  const browser = await chromium.launch({ headless: true,
    executablePath: "/nix/store/71577rskzyhch3axhdqx7faygc2xyn4v-playwright-browsers-1.55.0-with-cjk/chromium-1187/chrome-linux/chrome" });
  let checks = 1;
  const check = (condition, message) => { assert.ok(condition, message); checks++; };
  const report = [];
  try {
    for (const app of ["ctf", "lantern"]) {
      const prefix = app === "ctf" ? "/" : "/silent-lantern/";
      const api = async (route, method = "GET", body, expected = 200, authorized = true) => {
        const response = await fetch(`${base}/api/${app}${route}`, { method, headers: {
          "content-type": "application/json", ...(authorized ? { "x-instructor-code": testCode } : {}),
        }, ...(body ? { body: JSON.stringify(body) } : {}) });
        const json = await response.json();
        assert.equal(response.status, expected, `${app} ${method} ${route}: ${JSON.stringify(json)}`);
        checks++;
        return json;
      };
      const seed = (name, extra = {}) => ({ sessionId: randomUUID(), name: "Synthetic Learner", email: "synthetic@example.test",
        instructorEmail: "instructor@example.test", teamName: name, ...(app === "lantern" ? { roeAcknowledged: true } : {}), ...extra });
      const legacy = await api(`/progress/${marker.oldSession}`);
      check(legacy.teamName === "Team 74", "Legacy team number retains its familiar label");
      check(legacy.teamMembers.join() === "Legacy Learner", "Only known historical members are listed");
      check(Object.values(legacy.answers).some(a => a.value === "Historical fixture response" && a.reviewStatus === "approved" && a.earnedPoints > 0), "Prior accepted work and points remain available");
      const prior = await api(`/progress/${marker.priorSession}`);
      check(/^\d{4}-\d{2}-\d{2}$/.test(prior.sessionDate), "Calendar session dates are strings, never serialized timestamps");
      const student = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await student.newPage();
      const badDestinations = [];
      await page.route("**/api/**", route => {
        if (new URL(route.request().url()).origin !== base) {
          badDestinations.push(route.request().url()); return route.abort();
        }
        return route.continue();
      });
      await page.goto(`${base}${prefix}activity`);
      await page.getByTestId("input-firstName").fill("Taylor");
      await page.getByTestId("input-lastName").fill("Learner");
      await page.getByTestId("input-email").fill("taylor@example.test");
      await page.getByTestId("input-instructorEmail").fill("instructor@example.test");
      await page.getByTestId("input-teamName").fill("Archive Eagles");
      await page.getByTestId("input-teamMembers").fill("Riley Example\nMorgan Example");
      if (app === "lantern") await page.getByTestId("checkbox-roe").check();
      const registered = page.waitForResponse(r => r.url() === `${base}/api/${app}/progress` && r.request().method() === "POST");
      await page.getByTestId("button-start").click();
      const response = await registered;
      assert.equal(response.status(), 200);
      const current = await response.json();
      check(current.teamName === "Archive Eagles", "Team name travels from check-in through the API");
      check(current.teamMembers.join("|") === "Taylor Learner|Riley Example|Morgan Example", "Full group roster is persisted");
      check(current.sessionDate > prior.sessionDate && current.sessionId !== prior.sessionId, "Same name is reusable on a later date without sharing saved work");
      const activity = await api("/activity", "GET", undefined, 200, false);
      const written = activity.questions.find(q => q.manualReview && q.section === 1) ?? activity.questions.find(q => q.manualReview);
      assert.ok(written);
      await api(`/progress/${current.sessionId}/answers/${written.id}`, "PUT", { value: "A saved response belonging only to today's team." });
      await page.reload();
      await page.getByTestId("input-teamName").waitFor({ state: "detached" });
      await page.getByText("Archive Eagles", { exact: false }).first().waitFor();
      const saved = await api(`/progress/${current.sessionId}`);
      check(saved.sessionDate === current.sessionDate && saved.teamMembers.length === 3, "Reload preserves the original session day and roster");
      check(saved.answers[written.id].value.includes("only to today's"), "Saved work remains attached to the correct team");
      check(!Object.keys((await api(`/progress/${marker.priorSession}`)).answers).length, "Yesterday's same-named team is unchanged");
      await api("/progress", "POST", seed("  archive   EAGLES "), 409, false);
      await api("/progress", "POST", seed("   "), 400, false);
      await api("/progress", "POST", seed("x".repeat(61)), 400, false);
      await api("/progress", "POST", seed("Bad\u0000Name"), 400, false);
      await api("/progress", "POST", seed("Oversized roster", { additionalTeamMembers: Array(30).fill("Example Member") }), 400, false);
      const idempotent = await api("/progress", "POST", { ...seed("Archive Eagles"), sessionId: current.sessionId }, 200, false);
      check(idempotent.teamMembers.length === 3, "Retry does not overwrite saved identity or roster");
      const unicode = await api("/progress", "POST", seed("  Café   A & B  ", { sessionDate: "1999-01-01" }), 200, false);
      check(unicode.teamName === "Café A & B" && unicode.sessionDate === current.sessionDate, "Name spacing is normalized and session date is server-owned");
      const board = await api("/leaderboard", "GET", undefined, 200, false);
      check(board.filter(t => t.teamName === "Archive Eagles").length === 1, "Default board shows only the current day");
      check(board.every(t => JSON.stringify(Object.keys(t).sort()) === JSON.stringify(["percentage", "teamName", "teamNumber"])), "Public board excludes rosters, emails, tokens, scores and responses");
      const olderBoard = await api(`/leaderboard?date=${prior.sessionDate}`, "GET", undefined, 200, false);
      check(olderBoard.length === 1 && olderBoard[0].teamName === "Archive Eagles", "Historical board dates remain separate");
      await api("/leaderboard?date=2026-02-30", "GET", undefined, 400, false);
      await api("/instructor/submissions", "GET", undefined, 401, false);
      const records = await api("/instructor/submissions");
      check(records.some(s => s.sessionId === marker.oldSession) && records.some(s => s.sessionId === marker.priorSession), "Every instructor can access earlier sessions with different recorded instructor emails");
      const queue = await api("/instructor/review-queue");
      check(queue.some(q => q.sessionId === current.sessionId && q.teamName === current.teamName && q.sessionDate === current.sessionDate), "Review queue identifies names and dates");
      const notes = await api("/instructor/notifications");
      check(notes.some(n => n.teamName === prior.teamName && n.sessionDate === prior.sessionDate), "Completion notifications identify the correct dated team");

      const teacher = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const instructor = await teacher.newPage();
      await instructor.goto(`${base}${prefix}instructor`);
      await instructor.getByTestId("input-code").fill(testCode);
      await instructor.getByTestId("button-verify").click();
      await instructor.getByTestId("tab-archives").click();
      await instructor.getByTestId("session-archives").waitFor();
      await instructor.getByText("Riley Example", { exact: true }).waitFor();
      await instructor.getByText("Yesterday Teammate", { exact: true }).waitFor();
      await instructor.getByText("Legacy Learner", { exact: true }).first().waitFor();
      check(await instructor.locator("table").count() >= 3, "One real roster table is shown for each recorded date");
      await instructor.screenshot({ path: path.join(outputDir, `${app}-dated-session-rosters.jpg`), fullPage: true });
      await instructor.getByTestId("select-session-date").selectOption(prior.sessionDate);
      check(await instructor.locator("table").count() === 1, "Instructor can filter to an earlier calendar date");
      await instructor.getByRole("button", { name: /Open responses/ }).first().click();
      await instructor.getByTestId("button-back-archives").waitFor();
      await instructor.getByText("Yesterday Learner", { exact: false }).first().waitFor();
      await instructor.getByTestId("button-back-archives").click();
      await instructor.getByTestId("session-archives").waitFor();
      await instructor.setViewportSize({ width: 390, height: 844 });
      check(await instructor.locator("body").evaluate(el => el.scrollWidth <= window.innerWidth), "Archive tables scroll inside their container on mobile");
      await instructor.getByTestId("button-lock").click();
      await instructor.getByTestId("form-verify").waitFor();
      check(await instructor.getByTestId("session-archives").count() === 0, "Locking hides the roster archive");
      check(badDestinations.length === 0, "Student API requests never leave the disposable fixture");
      await student.close(); await teacher.close();
      report.push({ app, passed: true, legacyDate: legacy.sessionDate, priorDate: prior.sessionDate, currentDate: current.sessionDate });
    }
  } finally { await browser.close(); }
  writeFileSync(path.join(outputDir, "dated-team-verification.json"), JSON.stringify({ checks, migrationPreserved: true, report }, null, 2));
  console.log(`DATED TEAM VERIFICATION PASSED: ${checks} checks; both student and instructor browser journeys used disposable PostgreSQL only.`);
}
