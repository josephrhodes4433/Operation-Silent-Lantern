import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { pool } from "@workspace/db";
import { GetLanternActivityResponse, SaveLanternAnswerResponse, ListLanternSubmissionsResponse } from "@workspace/api-zod";
import router from "../routes/lantern";
import { evaluateLantern, lanternQuestions, publicLanternActivity } from "../lib/lantern-activity";
import { lanternProgress, type Progress } from "../lib/lantern-progress";

// Run with a disposable test-only instructor code, never a real credential.
const CODE = "isolated-lantern-verification";
if (process.env.CTF_INSTRUCTOR_CODE !== CODE) throw new Error("Run with the documented test-only instructor code.");
const app = express();
app.use(express.json());
app.use("/api", router);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Missing test server");
const base = `http://127.0.0.1:${address.port}/api/lantern`;
const sid = randomUUID();
const dataset = new Map([
  [5, ["ALIAS:Harbor"]], [8, ["MAJOR:keyword:BEACON"]], [10, ["IMSI:001011234567890"]],
  [14, ["AUTH:TRAINING-DEMO"]], [15, ["Movement Window Note"]], [16, ["TPL:Harbor-7890-BEACON"]],
]);
const previousKeys = await pool.query<{question_id: number; accepted_answers: string[]}>("SELECT * FROM lantern_keys");
let assertions = 0;
async function call<T = Progress>(method: string, path: string, body?: unknown, status = 200, teacher = false): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json", ...(teacher ? { "x-instructor-code": CODE } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  assertions++;
  return data as T;
}
const save = (questionId: number, value: string | string[], status = 200) => call<ReturnType<typeof SaveLanternAnswerResponse.parse>>("PUT", `/progress/${sid}/answers/${questionId}`, { value }, status);
const progress = () => call("GET", `/progress/${sid}`);
try {
  const activity = await call<ReturnType<typeof GetLanternActivityResponse.parse>>("GET", "/activity");
  assert.equal(activity.questions.length, 18);
  assert.equal(activity.questions.reduce((sum: number, q: {points: number}) => sum + q.points, 0), 125);
  assert.equal(activity.sections.length, 6);
  assert.equal(activity.questions.filter((q: {isFlag: boolean}) => q.isFlag).length, 6);
  assert.ok(activity.questions.every((q: object) => !("acceptedAnswers" in q)));
  await call("GET", "/instructor/keys", undefined, 401);
  await call("POST", "/instructor/verify", {code: CODE}, 200);
  await call("GET", "/progress/not-a-uuid", undefined, 400);
  const details = {sessionId: sid, name: "Verification team", email: "learner@example.test", instructorEmail: "instructor@example.test", teamNumber: 3, roeAcknowledged: true};
  await call("POST", "/progress", {...details, roeAcknowledged: false}, 400);
  await call("POST", "/progress", details);
  await call("POST", "/progress", {...details, name: "Cannot overwrite"});
  assert.equal((await progress()).name, details.name);
  await save(5, "ALIAS:Harbor", 403);
  assert.equal((await save(1, "B. Triage Scan first, then targeted extractions")).earnedPoints, 5);
  assert.equal((await save(2, "CASE:JTF-0427-TEAM4")).correct, false);
  assert.equal((await save(2, "CASE:JTF-0427-TEAM3")).correct, true);
  assert.equal((await save(3, ".ufdx")).earnedPoints, 5);
  // More concurrent saves than the pool's default size must not deadlock.
  // Key reads inside a transaction must reuse that transaction's connection.
  const simultaneous = await Promise.all(Array.from({length: 12}, () => save(3, ".ufdx")));
  assert.ok(simultaneous.every(result => result.correct));
  assert.equal((await progress()).unlockedMission, 2);
  const firstHint = await call("POST", `/progress/${sid}/hints/1`);
  assert.equal(firstHint.penaltyPoints, 2);
  assert.equal((await call("POST", `/progress/${sid}/hints/1`)).penaltyPoints, 2);
  await call("POST", `/progress/${sid}/hints/2`);
  await call("POST", `/progress/${sid}/hints/3`, undefined, 403);
  // Verify key-pending behavior without assuming an existing classroom's setup.
  const keyless = evaluateLantern(lanternQuestions[4], "ALIAS:Harbor", new Map(), 3, false);
  assert.equal(keyless.status, "unkeyed");
  assert.equal(keyless.earnedPoints, 0);
  await call("PUT", "/instructor/keys/10", {acceptedAnswers: ["IMSI:not-digits"]}, 400, true);
  await call("PUT", "/instructor/keys/2", {acceptedAnswers: ["CASE:JTF-0427-TEAM3"]}, 400, true);
  await call("PUT", "/instructor/keys/14", {acceptedAnswers: [`AUTH:${CODE}`]}, 400, true);
  for (const [id, acceptedAnswers] of dataset) await call("PUT", `/instructor/keys/${id}`, {acceptedAnswers}, 200, true);
  assert.ok(!JSON.stringify(await call("GET", "/activity")).includes("TRAINING-DEMO"));
  assert.ok(!JSON.stringify(publicLanternActivity(dataset)).includes("acceptedAnswers"));
  assert.equal((await save(4, ["Chats"])).correct, false);
  const types = ["Chats", "Call logs", "Locations", "Contacts", "Documents"];
  assert.equal((await save(4, [...types, "Videos"])).correct, true);
  assert.equal((await save(5, "ALIAS:Harbor")).correct, true);
  assert.equal((await progress()).unlockedMission, 3);
  await save(6, "Timestamp and location with the instruction thread source.");
  await call("PUT", `/instructor/submissions/${sid}/review/6`, {points: 6, note: "Too high"}, 400, true);
  await call("PUT", `/instructor/submissions/${sid}/review/6`, {points: 4, note: "Add exact source"}, 200, true);
  assert.equal((await save(6, "Timestamp and location with the instruction thread source.")).earnedPoints, 4);
  assert.equal((await progress()).answers["6"].instructorPoints, 4);
  await save(6, "Revised timestamp and location with exact source.");
  assert.equal((await progress()).answers["6"].instructorPoints, null);
  await save(7, "Keyword and phone number.");
  await save(8, "MAJOR:keyword:BEACON");
  await save(9, "Major");
  await call("POST", `/progress/${sid}/hints/3`);
  assert.equal((await progress()).penaltyPoints, 6);
  await call("POST", `/progress/${sid}/hints/4`, undefined, 409);
  await save(10, "IMSI:001011234567890");
  await save(11, "SIM contact corroborates the courier's instruction thread.");
  await save(12, "TurboLink and SIM adapter");
  assert.equal((await progress()).unlockedMission, 5);
  assert.equal((await progress()).trainingAuthorizationCode, null);
  await save(14, "AUTH:TRAINING-DEMO", 403);
  await save(15, "Movement Window Note", 403);
  await call("PUT", `/instructor/submissions/${sid}/authorization`, {granted: true}, 409, true);
  await call("PUT", `/progress/${sid}/authorization`, {notes: ""}, 400);
  await call("PUT", `/progress/${sid}/authorization`, {notes: "Preserved authorized iOS handling. No processing before authorization; provenance recorded."});
  assert.equal((await progress()).trainingAuthorizationCode, null);
  const granted = await call("PUT", `/instructor/submissions/${sid}/authorization`, {granted: true}, 200, true);
  assert.equal(granted.trainingAuthorizationCode, "AUTH:TRAINING-DEMO");
  await call("PUT", `/progress/${sid}/authorization`, {notes: "Cannot silently replace reviewed notes"}, 409);
  await save(13, "Preserved Extraction");
  await save(14, "AUTH:TRAINING-DEMO");
  await save(15, "Movement Window Note");
  assert.equal((await progress()).unlockedMission, 6);
  await call("POST", `/progress/${sid}/submit`, undefined, 409);
  await call("PUT", "/instructor/keys/16", {acceptedAnswers: ["TPL:Harbor-1111-BEACON"]}, 200, true);
  assert.equal((await save(16, "TPL:Harbor-1111-BEACON")).correct, false);
  assert.equal((await progress()).answers["16"].correct, false);
  await call("PUT", "/instructor/keys/16", {acceptedAnswers: dataset.get(16)}, 200, true);
  await save(16, "TPL:Harbor-7890-BEACON");
  await save(17, "The courier is Harbor. The network targets logistics. The rendezvous is documented in the location reference. The timestamp establishes the next window. A SIM message corroborates the connection. Recommend authorized follow-up and preserve the cited UFED outputs.");
  await save(18, "Instruction thread timestamp and corroborating location reference, each with UFED provenance.");
  for (const q of lanternQuestions.filter(q => q.manualReview)) {
    await call("PUT", `/instructor/submissions/${sid}/review/${q.id}`, {points: q.points, note: "Reviewed sources"}, 200, true);
  }
  assert.equal((await progress()).rawPoints, 125);
  assert.equal((await progress()).totalPoints, 119);
  await call("PUT", `/instructor/submissions/${sid}/adjustments`, {speedBonus: 2, tradecraftBonus: true}, 400, true);
  const adjusted = await call("PUT", `/instructor/submissions/${sid}/adjustments`, {speedBonus: 5, tradecraftBonus: true}, 200, true);
  assert.equal(adjusted.totalPoints, 129);
  assert.ok((await call("POST", `/progress/${sid}/submit`)).submittedAt);
  const list = await call<ReturnType<typeof ListLanternSubmissionsResponse.parse>>("GET", "/instructor/submissions", undefined, 200, true);
  assert.ok(list.some((row: {sessionId: string; teamNumber: number}) => row.sessionId === sid && row.teamNumber === 3));
  const resumed = await progress();
  assert.equal(resumed.answeredCount, 18);
  assert.equal(resumed.name, details.name);
  await call("PUT", `/instructor/submissions/${sid}/authorization`, {granted: false}, 200, true);
  assert.equal((await progress()).trainingAuthorizationCode, null);
  assert.equal((await progress()).unlockedMission, 5);
  await call("POST", `/progress/${sid}/submit`, undefined, 409);
  // Re-evaluation must use today's keys, never stored historical status.
  const row = (await pool.query("SELECT * FROM lantern_progress WHERE session_id=$1", [sid])).rows[0];
  const noKeys = lanternProgress(row, new Map());
  assert.equal(noKeys.answers["5"].status, "unkeyed");
  assert.equal(noKeys.unlockedMission, 2);
  console.log(`SILENT LANTERN verification passed: ${assertions} API assertions plus grading, redaction and dynamic-key checks.`);
} finally {
  await pool.query("DELETE FROM lantern_progress WHERE session_id=$1", [sid]);
  for (const id of dataset.keys()) {
    const previous = previousKeys.rows.find(row => row.question_id === id);
    if (previous) await pool.query("UPDATE lantern_keys SET accepted_answers=$2::jsonb WHERE question_id=$1", [id, JSON.stringify(previous.accepted_answers)]);
    else await pool.query("DELETE FROM lantern_keys WHERE question_id=$1", [id]);
  }
  server.close();
  await pool.end();
}
