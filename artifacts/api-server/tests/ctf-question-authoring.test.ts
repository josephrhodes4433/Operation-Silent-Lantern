import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { pool } from "@workspace/db";
import router from "../src/routes/ctf";
import { evaluate, mergeQuestions, questions, sectionForFlag } from "../src/lib/ctf-activity";
import { validateQuestion } from "../src/lib/ctf-question-authoring";
import { SetCtfInstructorQuestionBody } from "@workspace/api-zod";

const input = (extra = {}) => SetCtfInstructorQuestionBody.parse({
  prompt: "Instructor-supplied test fixture only", kind: "short", options: [],
  points: 7, guideReference: "Test reference", validationMethod: "Check test evidence",
  validationMode: "exact", acceptedAnswers: ["Fixture KEY"], ...extra,
});

test("question rules reject invalid definitions without inventing content", () => {
  assert.match(validateQuestion(input({ prompt: " " }))!, /prompt/);
  assert.match(validateQuestion(input({ kind: "single", options: ["A"] }))!, /two/);
  assert.match(validateQuestion(input({ kind: "single", options: ["A", "B"], acceptedAnswers: ["C"] }))!, /match/);
  assert.match(validateQuestion(input({ kind: "long" }))!, /manual/);
  assert.match(validateQuestion(input({ validationMode: "manual" }))!, /must not/);
  assert.match(validateQuestion(input({ acceptedAnswers: [] }))!, /requires/);
  assert.match(validateQuestion(input({ kind: "number", validationMode: "numeric", acceptedAnswers: ["NaN"] }))!, /numbers/);
  assert.equal(validateQuestion(input({ validationMode: "dataset", acceptedAnswers: [] })), null);
  assert.equal(validateQuestion(input({ kind: "long", validationMode: "manual", acceptedAnswers: [] })), null);
  assert.equal(SetCtfInstructorQuestionBody.safeParse({ ...input(), points: -1 }).success, false);
  assert.equal(SetCtfInstructorQuestionBody.safeParse({ ...input(), points: 1.5 }).success, false);
  assert.equal(SetCtfInstructorQuestionBody.safeParse({ ...input(), validationMode: "unknown" }).success, false);
});

test("authored grading modes and fixed section boundaries preserve original IDs", () => {
  const q = { ...input(), id: 67, ...sectionForFlag(67), category: "auto" };
  assert.equal(evaluate(q, "Fixture KEY", new Map()).earnedPoints, 7);
  assert.equal(evaluate(q, "fixture key", new Map()).correct, false);
  assert.equal(evaluate({ ...q, validationMode: "normalised" }, "fixture-key", new Map()).correct, true);
  assert.equal(evaluate({ ...q, kind: "number", validationMode: "numeric", acceptedAnswers: ["1,000"] }, "1000", new Map()).correct, true);
  assert.equal(evaluate({ ...q, kind: "multiple", acceptedAnswers: ["A", "B"] }, ["B", "A"], new Map()).correct, true);
  assert.equal(evaluate({ ...q, kind: "multiple", acceptedAnswers: ["A", "B"] }, ["A"], new Map()).correct, false);
  assert.equal(evaluate({ ...q, validationMode: "manual" }, "any written evidence", new Map()).status, "manual");
  assert.equal(evaluate({ ...q, category: "dataset", validationMode: "dataset" }, "anything", new Map()).status, "unkeyed");
  for (const [id, section] of [[1, 1], [10, 1], [11, 2], [29, 2], [30, 3], [43, 3], [44, 4], [66, 4], [67, 5], [79, 5], [80, 6], [102, 6], [103, 7], [109, 7], [110, 8], [120, 8]]) {
    assert.equal(sectionForFlag(id).section, section);
  }
  const merged = mergeQuestions([q]);
  assert.equal(merged.length, 120);
  assert.equal(merged.find(x => x.id === 67)?.section, 5);
  assert.deepEqual(merged.find(x => x.id === 1), questions.find(x => x.id === 1));
});

test("protected authoring persists independently of source and learner responses", async () => {
  // In-memory SQL adapter: this test never changes shared classroom data or keys.
  const definitions = new Map<number, ReturnType<typeof input>>();
  const keys = new Map<number, string[]>();
  const learner = {
    session_id: "00000000-0000-4000-8000-000000000001",
    name: "Test learner", email: "fixture@example.test", instructor_email: "teacher@example.test",
    saved_at: new Date(), submitted_at: new Date(),
    answers: {
      "1": { value: "Ctrl+T", correct: true, earnedPoints: 5, status: "correct", updatedAt: new Date().toISOString() },
      "67": { value: "Fixture KEY", correct: null, earnedPoints: 0, status: "unkeyed", updatedAt: new Date().toISOString(), instructorNote: "Keep this note" },
    },
  };
  const originalLearner = JSON.stringify(learner);
  const originalSource = JSON.stringify(questions);
  const query = async (sql: string, args: unknown[] = []) => {
    if (sql.startsWith("SELECT question_id, definition")) return { rows: [...definitions].map(([question_id, definition]) => ({ question_id, definition })) };
    if (sql.startsWith("SELECT question_id, accepted_answers")) return { rows: [...keys].map(([question_id, accepted_answers]) => ({ question_id, accepted_answers })) };
    if (sql.startsWith("INSERT INTO ctf_questions")) { definitions.set(Number(args[0]), JSON.parse(String(args[1]))); return { rows: [] }; }
    if (sql.startsWith("INSERT INTO ctf_keys")) { keys.set(Number(args[0]), JSON.parse(String(args[1]))); return { rows: [] }; }
    if (sql.startsWith("SELECT * FROM ctf_progress")) return { rows: [learner] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    throw new Error(`Unexpected SQL in isolated test: ${sql}`);
  };
  const oldQuery = pool.query;
  const oldConnect = pool.connect;
  pool.query = query as typeof pool.query;
  pool.connect = (async () => ({ query, release() {} })) as unknown as typeof pool.connect;
  process.env.CTF_INSTRUCTOR_CODE = "isolated-authoring-fixture";
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr !== "string");
  const base = `http://127.0.0.1:${addr.port}/api`;
  const request = (path: string, method = "GET", body?: unknown, authorised = true) =>
    fetch(base + path, { method, headers: { "content-type": "application/json", ...(authorised ? { "x-instructor-code": "isolated-authoring-fixture" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await request("/ctf/instructor/questions", "GET", undefined, false)).status, 401);
    assert.equal((await request("/ctf/instructor/questions/67", "PUT", input(), false)).status, 401);
    const catalog = await (await request("/ctf/instructor/questions")).json();
    assert.equal(catalog.missingIds.length, 0);
    assert.ok(catalog.questions.some((q: { id: number }) => q.id === 67));
    assert.equal((await request("/ctf/instructor/questions/121", "PUT", input())).status, 400);
    assert.equal((await request("/ctf/instructor/questions/67", "PUT", input({ prompt: " " }))).status, 400);
    const saved = await (await request("/ctf/instructor/questions/67", "PUT", { ...input(), id: 3, section: 1 })).json();
    assert.equal(saved.id, 67);
    assert.equal(saved.section, 5);
    assert.deepEqual(saved.acceptedAnswers, ["Fixture KEY"]);
    const restored = await (await request("/ctf/instructor/questions")).json();
    assert.equal(restored.missingIds.length, 0);
    assert.equal(restored.questions.find((q: { id: number }) => q.id === 67).prompt, input().prompt);
    const activity = await (await request("/ctf/activity")).json();
    assert.equal(activity.totalFlags, 120);
    assert.equal(activity.totalPoints, 1367); // Override Flag 67 from 10 to 7.
    assert.equal(JSON.stringify(activity).includes("Fixture KEY"), false);
    assert.equal(activity.questions.some((q: { acceptedAnswers?: unknown; validationMethod?: unknown }) => q.acceptedAnswers || q.validationMethod), false);
    const progress = await (await request(`/ctf/progress/${learner.session_id}`)).json();
    assert.equal(progress.answers["67"].value, "Fixture KEY");
    assert.equal(progress.answers["67"].earnedPoints, 7);
    assert.equal(progress.answers["67"].instructorNote, "Keep this note");
    assert.equal(progress.answers["1"].earnedPoints, 5);
    assert.equal(progress.submittedAt, learner.submitted_at.toISOString());
    await request("/ctf/instructor/questions/67", "PUT", input({ points: 9 }));
    assert.equal((await (await request(`/ctf/progress/${learner.session_id}`)).json()).answers["67"].earnedPoints, 9);
    await request("/ctf/instructor/questions/68", "PUT", input({ validationMode: "dataset", acceptedAnswers: ["Shared test"] }));
    assert.deepEqual(keys.get(68), ["Shared test"]);
    await request("/ctf/instructor/questions/69", "PUT", input({ validationMode: "manual", kind: "long", acceptedAnswers: [] }));
    assert.equal((await (await request("/ctf/activity")).json()).questions.find((q: { id: number }) => q.id === 69).manualReview, true);
    assert.equal(JSON.stringify(learner), originalLearner);
    assert.equal(JSON.stringify(questions), originalSource);
    delete process.env.CTF_INSTRUCTOR_CODE;
    assert.equal((await request("/ctf/instructor/questions")).status, 503);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    pool.query = oldQuery;
    pool.connect = oldConnect;
    delete process.env.CTF_INSTRUCTOR_CODE;
  }
});
