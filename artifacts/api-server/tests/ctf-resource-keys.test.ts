import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { questions, evaluate, publicActivity, mergeQuestions, isManual } from "../src/lib/ctf-activity";
import { questionCatalog } from "../src/lib/ctf-question-authoring";
import { lanternQuestions, publicLanternActivity, evaluateLantern } from "../src/lib/lantern-activity";
import { lanternProgress, type LanternRow } from "../src/lib/lantern-progress";
import { reviewLanternResponse, requireWrittenApproval, sameLanternResponse } from "../src/lib/lantern-review";

export const fixtureKeys = new Map<number, string[]>([
  [5, ["ALIAS:LANTERN"]], [8, ["MAJOR:keyword:VESPER"]], [10, ["IMSI:123456789012345"]],
  [14, ["AUTH:training-fixture"]], [15, ["Planning manifest"]], [16, ["TPL:LANTERN-2345-VESPER"]],
]);
const stamp = "2026-10-08T12:00:00.000Z";
export function fixtureRow(): LanternRow {
  const row: LanternRow = {
    session_id: "12345678-1234-4234-8234-123456789abc",
    name: "Fixture learner", email: "fixture@example.invalid", instructor_email: "instructor@example.invalid", team_number: 3,
    answers: {}, authorization_notes: "Documented preserved handling", authorization_granted: true,
    hints: [], speed_bonus: 0, tradecraft_bonus: 0, saved_at: new Date(stamp), submitted_at: null,
  };
  for (const q of lanternQuestions) {
    const value = q.manualReview ? "Evidence-backed fixture response"
      : q.id === 2 ? "CASE:JTF-0427-TEAM3"
      : q.kind === "multiple" ? q.acceptedAnswers
      : q.acceptedAnswers[0] ?? fixtureKeys.get(q.id)![0];
    row.answers[String(q.id)] = {
      questionId: q.id, value, correct: null, earnedPoints: 0, status: q.manualReview ? "manual" : "unkeyed",
      updatedAt: stamp, instructorPoints: q.manualReview ? q.points : null, instructorNote: null,
      ...(q.manualReview ? { reviewStatus: "approved" as const } : {}),
    };
  }
  return row;
}

test("complete eight-station bank preserves every ID, total and DELTA/GOLF tasking", () => {
  assert.equal(questions.length, 120);
  assert.equal(questions.reduce((sum, q) => sum + q.points, 0), 1370);
  assert.deepEqual(questions.map(q => q.id), Array.from({ length: 120 }, (_, i) => i + 1));
  const activity = publicActivity(new Map());
  assert.equal(activity.sections.length, 8);
  assert.equal(activity.questions.filter(q => q.section === 5).length, 13);
  assert.equal(activity.questions.filter(q => q.section === 7).length, 7);
  assert.match(activity.sections[4].inject, /Photos.sqlite/);
  assert.match(activity.sections[6].inject, /plug-in chains/);
  assert.equal(activity.sections[6].flags, "103–109");
});

test("every supplied fixed answer validates, and instructor-only keys never leak", () => {
  const fixed = questions.filter(q => q.category === "auto");
  assert.equal(fixed.length, 79);
  for (const q of fixed) {
    assert.equal(evaluate(q, q.kind === "multiple" ? q.acceptedAnswers : q.acceptedAnswers[0], new Map()).correct, true, `Flag ${q.id}`);
    assert.equal(evaluate(q, "Definitely not a valid answer", new Map()).correct, false, `Flag ${q.id} rejects wrong answers`);
  }
  const serialized = JSON.stringify(publicActivity(new Map()));
  assert.ok(!serialized.includes("facilitatorAnswers"));
  assert.ok(!serialized.includes("facilitatorNote"));
  assert.ok(!serialized.includes("dcheat425"));
  assert.ok(!serialized.includes("638FFDCD3F2FFECCBB0483B6B94F5834"));
});

test("valid formatting variants pass but incomplete answers and extra selections fail", () => {
  assert.equal(evaluate(questions.find(q => q.id === 5)!, "Required = Yes", new Map()).correct, true);
  assert.equal(evaluate(questions.find(q => q.id === 64)!, ".kml", new Map()).correct, true);
  assert.equal(evaluate(questions.find(q => q.id === 67)!, "Tools > SQLite Wizard; Table view > SQLite Wizard icon", new Map()).correct, true);
  assert.equal(evaluate(questions.find(q => q.id === 67)!, "Tools > SQLite Wizard", new Map()).correct, false);
  assert.equal(evaluate(questions.find(q => q.id === 78)!, "Additional Files", new Map()).correct, false);
  const hash = questions.find(q => q.id === 3)!;
  assert.equal(evaluate(hash, ["MD5"], new Map()).correct, false);
  assert.equal(evaluate(hash, ["MD5", "SHA256", "SHA1"], new Map()).correct, false);
  assert.equal(evaluate(questions.find(q => q.id === 36)!, "Nanoseconds since UTC 2001", new Map()).correct, true);
  assert.equal(evaluate(questions.find(q => q.id === 36)!, "In UTC", new Map()).correct, false);
});

test("dataset references require activation, preserve class keys and do not bind unrelated flags", () => {
  const unread = questions.find(q => q.id === 14)!;
  assert.deepEqual(unread.facilitatorAnswers, ["81"]);
  assert.equal(evaluate(unread, "81", new Map()).status, "unkeyed");
  assert.equal(evaluate(unread, "81", new Map([[14, ["81"]]])).correct, true);
  assert.equal(evaluate(unread, "99", new Map([[14, ["99"]]])).correct, true);
  assert.equal(evaluate(unread, "81", new Map([[14, ["99"]]])).correct, false);
  assert.equal(questions.find(q => q.id === 28)!.facilitatorAnswers, undefined);
  assert.equal(questions.find(q => q.id === 100)!.facilitatorAnswers, undefined);
  for (const id of [51, 54, 61, 66, 79, 102, 108, 117, 118, 120]) assert.ok(isManual(questions.find(q => q.id === id)!));
  const custom = { ...unread, prompt: "Instructor-authored different question", facilitatorAnswers: undefined, facilitatorNote: undefined, acceptedAnswers: [], validationMode: "dataset" as const };
  assert.equal(mergeQuestions([custom]).find(q => q.id === 14)!.prompt, custom.prompt);
  assert.equal(mergeQuestions([custom]).find(q => q.id === 14)!.facilitatorAnswers, undefined);
  const catalog = questionCatalog(questions, new Map());
  assert.deepEqual(catalog.missingIds, []);
  assert.deepEqual(catalog.questions.find(q => q.id === 14)!.facilitatorAnswers, ["81"]);
});

test("SILENT LANTERN remains six UFED-only missions with strict formats and optional media", () => {
  const activity = publicLanternActivity(fixtureKeys);
  assert.equal(activity.sections.length, 6);
  assert.equal(activity.questions.length, 18);
  assert.equal(activity.questions.filter(q => q.isFlag).length, 6);
  assert.equal(activity.totalPoints, lanternQuestions.reduce((sum, q) => sum + q.points, 0));
  assert.ok(!JSON.stringify(activity).includes("AUTH:training-fixture"));
  const content = lanternQuestions.find(q => q.id === 4)!;
  assert.equal(evaluateLantern(content, [...content.acceptedAnswers, "Images", "Videos"], fixtureKeys, 3, false).correct, true);
  assert.equal(evaluateLantern(content, ["Chats", "Locations"], fixtureKeys, 3, false).correct, false);
  assert.equal(evaluateLantern(lanternQuestions[1], "CASE:JTF-0427-TEAM4", fixtureKeys, 3, false).correct, false);
});

test("written approval gates progression, denial requires feedback and stale reviews are rejected", () => {
  const row = fixtureRow();
  row.answers["6"].reviewStatus = "pending";
  const pending = lanternProgress(row, fixtureKeys);
  assert.equal(pending.reviewGateQuestionId, 6);
  assert.equal(pending.unlockedMission, 2);
  assert.equal(pending.answers["6"].earnedPoints, 0);
  assert.throws(() => requireWrittenApproval(row, 7), /must be approved/);
  assert.doesNotThrow(() => requireWrittenApproval(row, 6));
  assert.throws(() => reviewLanternResponse(row, 6, "denied", 0, "", stamp), /Add feedback/);
  assert.throws(() => reviewLanternResponse(row, 6, "approved", 5, "", "2026-10-08T11:00:00Z"), /changed this response/);
  reviewLanternResponse(row, 6, "denied", 5, "Add the timestamp and source.", stamp);
  assert.equal(lanternProgress(row, fixtureKeys).answers["6"].status, "incorrect");
  assert.equal(row.answers["6"].instructorPoints, 0);
  assert.throws(() => requireWrittenApproval(row, 7), /must be approved/);
  assert.ok(sameLanternResponse("Evidence-backed  fixture response", " Evidence-backed fixture response "));
  assert.ok(!sameLanternResponse("Old response", "Revised response with a cited timestamp"));
  reviewLanternResponse(row, 6, "approved", 5, "Evidence verified.", stamp);
  assert.equal(lanternProgress(row, fixtureKeys).reviewGateQuestionId, null);
  assert.equal(lanternProgress(row, fixtureKeys).unlockedMission, 7);
  assert.equal(lanternProgress(row, fixtureKeys).totalPoints, 125);
  assert.doesNotThrow(() => requireWrittenApproval(row, 7));
  row.submitted_at = new Date(stamp);
  reviewLanternResponse(row, 6, "denied", 0, "Reattempt this question.", stamp);
  assert.equal(row.submitted_at, null);
  assert.equal(lanternProgress(row, fixtureKeys).unlockedMission, 2);
});

test("legacy numeric review points do not count as an explicit approval", () => {
  const row = fixtureRow();
  delete row.answers["6"].reviewStatus;
  assert.equal(lanternProgress(row, fixtureKeys).answers["6"].status, "manual");
  assert.equal(lanternProgress(row, fixtureKeys).reviewGateQuestionId, 6);
});

// Browser verification uses intercepted fixtures, never classroom keys or the real access code.
const pendingRow = fixtureRow();
pendingRow.answers = Object.fromEntries(Object.entries(pendingRow.answers).filter(([id]) => Number(id) <= 6));
pendingRow.answers["6"].reviewStatus = "pending";
pendingRow.answers["6"].instructorPoints = null;
const classKeys = new Map<number, string[]>([[13, ["99"]]]);
writeFileSync("artifacts/api-server/tests/fixtures/classroom-ui-fixtures.json", JSON.stringify({
  ironActivity: publicActivity(classKeys),
  ironCatalog: questionCatalog(questions, classKeys),
  ironKeys: [{ questionId: 13, acceptedAnswers: ["99"] }],
  lanternActivity: publicLanternActivity(fixtureKeys),
  lanternPending: lanternProgress(pendingRow, fixtureKeys),
}, null, 2));
