import { test } from "node:test";
import assert from "node:assert/strict";
import { questions, evaluate, isManual, publicActivity, type Question } from "../src/lib/ctf-activity";
import { withClassroomChoices } from "../src/lib/iron-choice-questions";
import { lanternQuestions, evaluateLantern, publicLanternActivity } from "../src/lib/lantern-activity";
import { lanternProgress } from "../src/lib/lantern-progress";
import { fixtureRow, fixtureKeys } from "./ctf-resource-keys.test";

test("all fixed objective IRON questions have verifiable choices and plausible wrong options", () => {
  const fixed = questions.filter(q => q.category === "auto" && !isManual(q));
  assert.equal(fixed.length, 79);
  for (const q of fixed) {
    assert.ok(["single", "multiple"].includes(q.kind), `Flag ${q.id} must use choices`);
    assert.ok(q.options.length >= 2, `Flag ${q.id} needs options`);
    assert.equal(new Set(q.options).size, q.options.length);
    if (q.kind === "single") {
      const results = q.options.map(option => evaluate(q, option, new Map()));
      assert.equal(results.filter(r => r.correct).length, 1, `Flag ${q.id} must have exactly one correct option`);
      for (const result of results.filter(r => !r.correct)) {
        assert.ok(result.feedback.length > 65, `Flag ${q.id} needs helpful coaching`);
        assert.ok(!/correct answer is|choose option|select option/i.test(result.feedback));
        for (const answer of q.acceptedAnswers.filter(a => a.length >= 5)) assert.ok(!result.feedback.toLowerCase().includes(answer.toLowerCase()), `Flag ${q.id} feedback must not echo the key`);
      }
    } else {
      assert.equal(evaluate(q, q.acceptedAnswers, new Map()).correct, true);
      assert.equal(evaluate(q, [], new Map()).correct, null);
    }
  }
});

test("classroom counts and colors become choices only with actual active grading keys", () => {
  const count = questions.find(q => q.id === 13)!;
  assert.equal(publicActivity(new Map()).questions.find(q => q.id === 13)?.kind, "number");
  for (const n of [0, 1, 7, 1000]) {
    const keys = new Map([[13, [String(n)]]]);
    const q = publicActivity(keys).questions.find(q => q.id === 13)!;
    assert.equal(q.kind, "single");
    assert.equal(q.options.length, 4);
    assert.equal(q.options.filter(v => evaluate(count, v, keys).correct).length, 1);
    assert.deepEqual(publicActivity(keys).questions.find(q => q.id === 13)?.options, q.options, "Ordering is stable on refresh");
  }
  const color = questions.find(q => q.id === 11)!;
  const rendered = withClassroomChoices(color, ["Blue", "blue"]);
  assert.equal(rendered.kind, "single");
  assert.equal(rendered.options.filter(v => evaluate(color, v, new Map([[11, ["Blue"]]])).correct).length, 1);
  assert.equal(withClassroomChoices(count, ["not configured"]).kind, "number");
});

test("written analysis and evidence-specific artifacts are not replaced with invented choices", () => {
  for (const q of questions.filter(isManual)) {
    assert.equal(withClassroomChoices(q, ["7"]).kind, q.kind);
  }
  for (const id of [10, 15, 16, 32, 37, 40, 42]) {
    const q = questions.find(q => q.id === id)!;
    assert.equal(withClassroomChoices(q, ["Evidence-specific value"]).kind, q.kind);
  }
  const authored = { ...questions[0], id: 500, category: "dataset", kind: "short", validationMode: "manual" } as Question;
  assert.equal(withClassroomChoices(authored, ["7"]).kind, "short");
});

test("old typed IRON answers retain grading, point totals and flag identities", () => {
  assert.equal(questions.length, 120);
  assert.equal(questions.reduce((n, q) => n + q.points, 0), 1370);
  assert.deepEqual(questions.map(q => q.id), Array.from({ length: 120 }, (_, i) => i + 1));
  assert.equal(evaluate(questions.find(q => q.id === 31)!, "1,459,886", new Map()).correct, true);
  assert.equal(evaluate(questions.find(q => q.id === 34)!, "SMS.DB", new Map()).correct, true);
  for (const q of questions.filter(q => q.category === "auto" && q.kind === "single")) {
    for (const accepted of q.acceptedAnswers) assert.equal(evaluate(q, accepted, new Map()).correct, true, `Legacy accepted variant ${q.id}`);
  }
});

test("SILENT fixed knowledge questions all use choices with safe coaching and preserved scoring", () => {
  const fixed = lanternQuestions.filter(q => q.keyMode === "fixed");
  assert.equal(fixed.length, 15);
  for (const q of fixed) {
    assert.ok(["single", "multiple"].includes(q.kind), q.code);
    assert.ok(q.options.length >= 2);
    if (q.kind === "single") {
      const results = q.options.map(option => evaluateLantern(q, option, fixtureKeys, 3, false));
      assert.equal(results.filter(r => r.correct).length, 1, q.code);
      for (const result of results.filter(r => !r.correct)) {
        assert.ok(result.feedback.length > 65);
        for (const answer of q.acceptedAnswers.filter(a => a.length >= 5)) assert.ok(!result.feedback.toLowerCase().includes(answer.toLowerCase()), `${q.code} feedback must not echo key`);
      }
    } else {
      assert.equal(evaluateLantern(q, q.acceptedAnswers.slice(1), fixtureKeys, 3, false).correct, false);
    }
  }
  assert.equal(publicLanternActivity(fixtureKeys).totalPoints, 165);
  for (const id of [107, 110, 116, 117, 118, 125, 126]) assert.equal(lanternQuestions.find(q => q.id === id)?.manualReview, true);
});

test("incorrect coaching survives save/resume in SILENT progress without revealing answers", () => {
  const row = fixtureRow();
  row.answers["104"].value = "UFDR";
  const answer = lanternProgress(row, fixtureKeys).answers["104"];
  assert.equal(answer.correct, false);
  assert.match(answer.feedback ?? "", /multi-extraction evidence container/);
  assert.ok(!answer.feedback?.includes("UFDX"));
  assert.equal(answer.earnedPoints, 0);
});
