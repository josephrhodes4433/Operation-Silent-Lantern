import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";

export async function verifyTeamReviews({ base, outputDir, testCode }) {
  const marker = await fetch(`${base}/__ctf_recording_fixture`).then(r => r.json());
  assert.equal(marker.marker, "ctf-recording-fixture-only");
  let checks = 0;
  const check = (value, message) => { assert.ok(value, message); checks++; };
  const summary = [];
  for (const app of ["ctf", "lantern"]) {
    const request = async (route, method = "GET", data, expected = 200, authenticated = true) => {
      const response = await fetch(`${base}/api/${app}${route}`, { method, headers: {
        "content-type": "application/json", ...(authenticated ? { "x-instructor-code": testCode } : {}),
      }, ...(data ? { body: JSON.stringify(data) } : {}) });
      const json = await response.json();
      assert.equal(response.status, expected, `${app} ${method} ${route}: ${JSON.stringify(json)}`);
      checks++;
      return json;
    };
    for (const route of ["/instructor/review-queue", "/instructor/notifications"]) await request(route, "GET", null, 401, false);
    const activity = await request("/activity");
    const guide = await request("/instructor/answer-guide");
    check(activity.questions.every(q => q.manualReview === !["single", "multiple"].includes(q.kind)), "Only effective non-choices require review");
    const sid = randomUUID();
    const identity = { sessionId: sid, name: "Zoe Demo", email: "zoe@example.test", instructorEmail: "instructor@example.test", teamNumber: 9,
      ...(app === "lantern" ? { roeAcknowledged: true } : {}) };
    await request("/progress", "POST", identity);
    const repeat = await request("/progress", "POST", { ...identity, name: "Do not overwrite shared identity" });
    check(repeat.name === "Zoe Demo", "Idempotent creates cannot overwrite a shared team's identity");
    await request("/progress", "POST", { ...identity, sessionId: randomUUID() }, 409);
    const manual = activity.questions.find(q => q.manualReview);
    const token = `/progress/${sid}`;
    for (const q of activity.questions.filter(q => q.id < manual.id)) {
      const entry = guide.entries.find(e => e.id === q.id);
      await request(`${token}/answers/${q.id}`, "PUT", { value: q.kind === "multiple" ? entry.answers : entry.answers[0] });
    }
    await request(`${token}/answers/${manual.id}`, "PUT", { value: "Initial vague demonstration response." });
    const saved = await request(token);
    const firstVersion = saved.answers[String(manual.id)].updatedAt;
    check(saved.answers[String(manual.id)].earnedPoints === 0, "Pending responses earn no points");
    const reviewRoute = `/instructor/submissions/${sid}/review/${manual.id}`;
    const review = (decision, note = "", responseUpdatedAt = firstVersion, expected = 200) =>
      request(reviewRoute, "PUT", { decision, note, points: 0, responseUpdatedAt }, expected);
    await review("denied", "", firstVersion, 400);
    await review("approved_with_feedback", "", firstVersion, 400);
    await review("denied", "Cite the evidence source and explain your observation.");
    check(!(await request("/instructor/review-queue")).some(x => x.sessionId === sid), "Denied responses leave the pending queue");
    await review("approved", "", firstVersion, 409);
    await request(`${token}/answers/${manual.id}`, "PUT", { value: " Initial  vague demonstration response. " }, 409);
    await request(`${token}/answers/${manual.id}`, "PUT", { value: "Revised demonstration: I cite the source artifact, explain the observation, and state a limitation." });
    let queue = await request("/instructor/review-queue?sort=time_asc");
    let item = queue.find(x => x.sessionId === sid && x.questionId === manual.id);
    check(!!item && item.updatedAt !== firstVersion, "Revisions return to the queue with a new response version");
    await review("approved", "", firstVersion, 409);
    await review("approved_with_feedback", "Evidence source and limitation are now explained.", item.updatedAt);
    let current = await request(token);
    check(current.answers[String(manual.id)].earnedPoints === manual.points, "Accepted response earns full points regardless of supplied points");
    check(current.answers[String(manual.id)].instructorNote.includes("limitation"), "Accepted feedback reaches the team");
    check(current.answers[String(manual.id)].reviewStatus === "approved", "Explicit acceptance persisted");
    await request(`${token}/submit`, "POST", {}, 409);
    check((await request("/instructor/notifications")).length === 0, "Incomplete teams produce no completion notification");
    const secondId = randomUUID();
    await request("/progress", "POST", { ...identity, sessionId: secondId, teamNumber: 10, name: "Amy Demo" });
    for (const q of activity.questions.filter(q => q.id < manual.id)) {
      const entry = guide.entries.find(e => e.id === q.id);
      await request(`/progress/${secondId}/answers/${q.id}`, "PUT", { value: q.kind === "multiple" ? entry.answers : entry.answers[0] });
    }
    await request(`/progress/${secondId}/answers/${manual.id}`, "PUT", { value: "Amy pending sample." });
    // Change an accepted response: points must disappear immediately, then return on acceptance.
    await request(`${token}/answers/${manual.id}`, "PUT", { value: "Zoe pending second revision with a clearer source." });
    current = await request(token);
    check(current.answers[String(manual.id)].earnedPoints === 0 && current.answers[String(manual.id)].reviewStatus === "pending", "Editing an accepted response clears its approval and points");
    for (const sort of ["time_asc", "time_desc", "name_asc", "name_desc"]) {
      queue = await request(`/instructor/review-queue?sort=${sort}`);
      const filtered = queue.filter(x => [sid, secondId].includes(x.sessionId));
      const expected = sort === "name_asc" || sort === "time_asc" ? secondId : sid;
      check(filtered[0].sessionId === expected, `${sort} ordering`);
    }
    for (const q of activity.questions) {
      current = await request(token);
      if (current.answers[String(q.id)]?.correct) continue;
      const entry = guide.entries.find(e => e.id === q.id);
      const special = { 108: "CASE:JTF-0427-TEAM9", 112: "MAJOR:IMEI:490154203237518", 115: "ALIAS:FALCON", 117: "IMSI:123456789012345", 124: "TPL:FALCON-2345-VESPER" };
      const value = q.manualReview ? (app === "lantern" && special[q.id] || entry.sampleResponse || entry.referenceAnswers?.[0] || `Demonstration evidence for ${q.id}; cite actual classroom evidence in a real activity.`)
        : q.kind === "multiple" ? entry.answers : entry.answers[0];
      await request(`${token}/answers/${q.id}`, "PUT", { value });
      if (q.manualReview) {
        current = await request(token);
        await request(`/instructor/submissions/${sid}/review/${q.id}`, "PUT", {
          decision: "approved", note: "", points: 0, responseUpdatedAt: current.answers[String(q.id)].updatedAt,
        });
      }
    }
    current = await request(token);
    check(Object.values(current.answers).every(a => a.correct === true), "Every question is correct or explicitly accepted");
    const expectedPoints = activity.questions.reduce((sum, q) => sum + q.points, 0);
    check(current.totalPoints === expectedPoints, "Full accepted/correct score equals activity maximum");
    const board = await request("/leaderboard");
    check(board.find(x => x.teamNumber === 9).percentage === 100, "Accepted/correct team reaches exactly 100 percent");
    check(board.every(x => JSON.stringify(Object.keys(x).sort()) === JSON.stringify(["percentage", "teamNumber"])), "Public leaderboard contains no PII, tokens, answers or scores");
    const submitted = await request(`${token}/submit`, "POST", {});
    check(!!submitted.submittedAt, "Final submission persists");
    let notes = await request("/instructor/notifications");
    check(notes.length === 1 && notes[0].teamNumber === 9 && notes[0].readAt === null, "One unread completion notification is stored");
    const again = await request("/instructor/notifications");
    check(again.length === 1, "Polling does not duplicate notifications");
    await request(`/instructor/notifications/${notes[0].id}/read`, "PUT", {});
    notes = await request("/instructor/notifications");
    check(!!notes[0].readAt, "Read acknowledgement persists across requests");
    summary.push({ app, questions: activity.questions.length, nonChoice: activity.questions.filter(q => q.manualReview).length, totalPoints: current.totalPoints, leaderboardPercentage: 100 });
  }
  writeFileSync(path.join(outputDir, "team-review-api-verification.json"), JSON.stringify({ checks, summary, isolatedPostgres: true }, null, 2));
  console.log("TEAM REVIEW API VERIFICATION", checks, "checks", summary);
}
