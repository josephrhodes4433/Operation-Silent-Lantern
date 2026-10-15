import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateLantern, publicLanternActivity, lanternQuestions } from "../src/lib/lantern-activity";
import { lanternAnswerGuide } from "../src/lib/lantern-answer-guide";

test("triage email clarifies the existing six-mission activity without changing grading identities", () => {
  const activity = publicLanternActivity(new Map());
  assert.equal(activity.sections.length, 6);
  assert.equal(activity.questions.length, 26);
  assert.deepEqual(activity.questions.map(q => q.id), Array.from({ length: 26 }, (_, i) => i + 101));
  assert.equal(activity.totalPoints, 165);
  const mission = activity.sections.find(s => s.id === 2)!;
  assert.match(mission.inject, /iPhone 8/);
  assert.match(mission.inject, /instructor demonstrates/i);
  assert.match(mission.inject, /learners do not need their own kits/i);
  assert.match(mission.inject, /offline profile.*actual IMEI/i);
  assert.match(mission.inject, /contact\/message.*Major\/Minor/i);
  assert.match(mission.inject, /Do not use the kit ZTE.*Advanced/i);
  assert.match(activity.sections.find(s => s.id === 5)!.inject, /UFED Classic/);
});

test("profile criteria stay reviewable and the Major choice stays self-verifying without revealing coaching", () => {
  const criteria = lanternQuestions.find(q => q.id === 110)!;
  assert.equal(criteria.manualReview, true);
  assert.match(criteria.prompt, /two supported.*criteria/i);
  assert.match(criteria.prompt, /IMEI-only beta profile/);
  assert.match(criteria.prompt, /not claim that two criteria are mandatory/);
  const priority = lanternQuestions.find(q => q.id === 111)!;
  assert.equal(evaluateLantern(priority, "Major", new Map(), 3, false).correct, true);
  const wrong = evaluateLantern(priority, "Minor", new Map(), 3, false);
  assert.equal(wrong.correct, false);
  assert.doesNotMatch(wrong.feedback, /\bMajor\b/);
});

test("first Major flag uses the actual report, not a forced IMEI or automatically accepted reference", () => {
  const flag = lanternQuestions.find(q => q.id === 112)!;
  const references = new Map([[112, ["MAJOR:IMEI:490154203237518"]]]);
  assert.equal(flag.manualReview, true);
  assert.match(flag.prompt, /first Major Severity/);
  assert.match(flag.prompt, /contact\/message indicator instead/);
  assert.match(flag.prompt, /If no Major item is present/);
  for (const value of ["MAJOR:IMEI:490154203237518", "MAJOR:Contact:Demonstration indicator"]) {
    const result = evaluateLantern(flag, value, references, 3, false);
    assert.equal(result.status, "manual");
    assert.equal(result.earnedPoints, 0);
  }
  const guide = lanternAnswerGuide(references);
  assert.match(guide.notice, /learners have no kits/);
  assert.match(guide.entries.find(e => e.id === 110)!.sampleResponse, /IMEI.*on its own/);
  const entry = guide.entries.find(e => e.id === 112)!;
  assert.deepEqual(entry.answers, references.get(112));
  assert.match(entry.guidance, /FIRST actual Major row/);
  assert.match(entry.guidance, /contact\/message/);
  assert.match(entry.notes, /supplies no report, actual IMEI/);
  assert.deepEqual(references.get(112), ["MAJOR:IMEI:490154203237518"]);
});
