import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import express from "express";
import { pool } from "@workspace/db";
import router from "../routes/lantern";
import { GetLanternProgressResponse, GetLanternWrittenHistoryResponse, ListLanternSubmissionsResponse, SaveLanternAnswerResponse } from "@workspace/api-zod";
import { lanternQuestions } from "../lib/lantern-activity";

// Only our test runner's Unix-socket cluster is accepted.
const fixture = process.env.LANTERN_HISTORY_FIXTURE;
assert.ok(fixture?.includes("lantern-history-fixture-"));
assert.equal(new URL(process.env.DATABASE_URL!).searchParams.get("host"), fixture);
const CODE = "isolated-lantern-history-fixture";
assert.equal(process.env.CTF_INSTRUCTOR_CODE, CODE);
const sid = "00000000-0000-4000-8000-000000000001";
const oldSid = "00000000-0000-4000-8000-000000000002";
const migration = await readFile("../../lib/db/migrations/lantern-written-history.sql", "utf8");
await pool.query(`CREATE TABLE lantern_progress (
  session_id text PRIMARY KEY,name text NOT NULL,email text NOT NULL,instructor_email text NOT NULL,
  team_number integer NOT NULL,answers jsonb NOT NULL DEFAULT '{}',
  authorization_notes text NOT NULL DEFAULT '',authorization_granted boolean NOT NULL DEFAULT false,
  hints jsonb NOT NULL DEFAULT '[]',speed_bonus integer NOT NULL DEFAULT 0,tradecraft_bonus integer NOT NULL DEFAULT 0,
  saved_at timestamptz NOT NULL DEFAULT now(),submitted_at timestamptz);
  CREATE TABLE lantern_keys(question_id integer PRIMARY KEY,accepted_answers jsonb NOT NULL);`);
const seed = async (id: string, answers: object) => pool.query(
  "INSERT INTO lantern_progress(session_id,name,email,instructor_email,team_number,answers) VALUES($1,'Synthetic analyst','analyst@example.test','teacher@example.test',3,$2)",
  [id, JSON.stringify(answers)],
);
await seed(oldSid, { "6": { value: "Legacy response", reviewStatus: "denied", instructorPoints: 0, instructorNote: "Legacy feedback", updatedAt: "2026-01-01T00:00:00Z" } });
await pool.query(migration);
await pool.query(migration);
const imported = await pool.query("SELECT * FROM lantern_written_history");
assert.equal(imported.rows.length, 1);
assert.equal(imported.rows[0].event, "imported");
assert.equal(imported.rows[0].feedback, "Legacy feedback");
assert.equal(imported.rows[0].version, 1);

await pool.query("INSERT INTO lantern_keys VALUES(115,'[\"ALIAS:Harbor\"]')");
const answer = (value: string) => ({ value, correct: true, status: "correct", earnedPoints: 10, updatedAt: "2026-01-01T00:00:00Z" });
await seed(sid, { "108": answer("CASE:JTF-0427-TEAM3"), "115": answer("ALIAS:Harbor") });
const app = express();
app.use(express.json());
app.use("/api", router);
app.use(((error, _req, res, _next) => res.status(500).json({ error: error.message })) as express.ErrorRequestHandler);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>(resolve => server.once("listening", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}/api/lantern`;
let checks = 0;
async function call(path: string, method = "GET", body?: object, status = 200, teacher = false) {
  const response = await fetch(base + path, {
    method, headers: { "content-type": "application/json", ...(teacher ? { "x-instructor-code": CODE } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  checks++;
  return data;
}
const historyPath = `/instructor/submissions/${sid}/history/107`;
const history = async () => GetLanternWrittenHistoryResponse.parse(await call(historyPath, "GET", undefined, 200, true));
const progress = async () => GetLanternProgressResponse.parse(await call(`/progress/${sid}`));
const save = (value: string, status = 200) => call(`/progress/${sid}/answers/107`, "PUT", { value }, status);
const summaries = async () => ListLanternSubmissionsResponse.parse(await call("/instructor/submissions", "GET", undefined, 200, true));
async function pending(expected: number) {
  const list = await summaries();
  assert.equal(list.find(s => s.sessionId === sid)?.pendingWrittenReviewCount, expected);
  assert.equal(list.find(s => s.sessionId === oldSid)?.pendingWrittenReviewCount, 0, "Imported denied responses are not pending");
  assert.ok(list.every(s => !("history" in s) && !("answers" in s)));
  const learner = await call(`/progress/${sid}`);
  assert.ok(learner && typeof learner === "object");
  assert.ok(!("pendingWrittenReviewCount" in learner) && !("history" in learner));
}
const review = (decision: string, responseUpdatedAt: Date, note = "", points = 4, status = 200) => call(
  `/instructor/submissions/${sid}/review/107`, "PUT", { decision, responseUpdatedAt, note, points }, status, true,
);
try {
  await call("/instructor/submissions", "GET", undefined, 401);
  await pending(0);
  // Multiple latest responses count once each; missing legacy status is pending.
  // Blank, automatic, approved, denied, and absent questions do not count.
  const mixedSid = "00000000-0000-4000-8000-000000000003";
  const written = (value: string, reviewStatus?: string) => ({
    value, reviewStatus, instructorPoints: null, instructorNote: null, updatedAt: "2026-01-01T00:00:00Z",
  });
  await seed(mixedSid, {
    "101": written("Automatic answer", "pending"),
    "118": written("   ", "pending"),
    "107": written("Legacy pending"),
    "110": written("Latest pending", "pending"),
    "125": written("Approved response", "approved"),
    "126": written("Denied response", "denied"),
  });
  assert.equal((await summaries()).find(s => s.sessionId === mixedSid)?.pendingWrittenReviewCount, 2);
  await call(historyPath, "GET", undefined, 401);
  await call(historyPath.replace("/history/107", "/history/108"), "GET", undefined, 404, true);
  await call(historyPath.replace(sid, "not-a-uuid"), "GET", undefined, 400, true);
  await call(historyPath.replace(sid, "00000000-0000-4000-8000-000000000099"), "GET", undefined, 404, true);
  assert.deepEqual(await history(), []);
  await save("First indicator");
  await pending(1);
  const first = (await progress()).answers["107"].updatedAt;
  assert.equal((await history())[0].version, 1);
  await review("denied", first, "", 0, 400);
  await pending(1);
  await review("denied", first, "Add timestamp and source", 0);
  await pending(0);
  await save("  First   indicator  ", 409);
  assert.equal((await history()).length, 2);
  await save("Second indicator with timestamp and source");
  await pending(1);
  const second = (await progress()).answers["107"].updatedAt;
  assert.ok(new Date(second).getTime() > new Date(first).getTime());
  assert.equal((await progress()).answers["107"].instructorNote, null);
  await review("approved", first, "Stale approval", 5, 409);
  await pending(1);
  assert.equal((await progress()).reviewGateQuestionId, 107);
  await call(`/progress/${sid}/answers/110`, "PUT", { value: "New mission" }, 403);
  await call(`/progress/${sid}/submit`, "POST", {}, 409);
  await review("approved", second, "Corroborated", 4);
  await pending(0);
  await review("approved", second, "Adjusted points", 5);
  await pending(0);
  assert.equal((await progress()).answers["107"].earnedPoints, 5);
  await save("Third revision");
  await pending(1);
  assert.equal((await progress()).answers["107"].earnedPoints, 0);
  assert.equal((await progress()).reviewGateQuestionId, 107);
  const entries = await history();
  assert.deepEqual(entries.map((e: { version: number }) => e.version), [1, 1, 2, 2, 2, 3]);
  assert.deepEqual(entries.map((e: { decision: string }) => e.decision), ["pending", "denied", "pending", "approved", "approved", "pending"]);
  assert.equal(entries[1].value, "First indicator");
  assert.equal(entries[1].feedback, "Add timestamp and source");
  assert.equal(entries[3].points, 4);
  assert.equal(entries[4].points, 5);
  assert.ok(entries.every(e => !Number.isNaN(e.recordedAt.getTime())));
  assert.ok(!JSON.stringify(entries).includes(CODE));
  assert.ok(!("history" in (await progress())));

  // A failed current-state update must roll back its history insert too.
  await pool.query(`CREATE FUNCTION fixture_reject_update() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'synthetic update failure'; END; $$ LANGUAGE plpgsql;
    CREATE TRIGGER fixture_reject BEFORE UPDATE ON lantern_progress FOR EACH ROW EXECUTE FUNCTION fixture_reject_update();`);
  await save("Must roll back", 500);
  await pending(1);
  assert.equal((await history()).length, 6);
  assert.equal((await progress()).answers["107"].value, "Third revision");
  await pool.query("DROP TRIGGER fixture_reject ON lantern_progress");

  // Concurrent reviews cannot lose events; both reference the same version.
  const third = (await progress()).answers["107"].updatedAt;
  await Promise.all([review("approved", third, "Review A", 3), review("approved", third, "Review B", 4)]);
  await pending(0);
  const concurrent = await history();
  assert.equal(concurrent.length, 8);
  assert.deepEqual(concurrent.slice(-2).map((e: { version: number }) => e.version), [3, 3]);
  // Reapplying migration neither duplicates nor overwrites events.
  await pool.query(migration);
  assert.deepEqual(await history(), concurrent);

  // Walk the revised curriculum against this disposable, real PostgreSQL DB.
  // No live classroom key, secret or learner record is touched.
  await call("/instructor/keys/112", "PUT", { acceptedAnswers: ["MAJOR:IMEI:490154203237518"] }, 200, true);
  await call("/instructor/keys/115", "PUT", { acceptedAnswers: ["ALIAS:Harbor"] }, 200, true);
  await call("/instructor/keys/124", "PUT", { acceptedAnswers: ["TPL:Harbor-2345-VESPER"] }, 400, true);
  await call("/instructor/keys/124", "PUT", { acceptedAnswers: ["VESPER-OPS"] }, 200, true);
  await call("/instructor/keys/117", "PUT", { acceptedAnswers: ["IMSI:123456789012345"] }, 400, true);
  await call(`/progress/${sid}/authorization`, "PUT", { notes: "No preserved device needed." }, 410);
  for (const [learnerId, imsi] of [
    ["00000000-0000-4000-8000-000000000010", "123456789012345"],
    ["00000000-0000-4000-8000-000000000011", "987654321098765"],
  ]) {
    const created = GetLanternProgressResponse.parse(await call("/progress", "POST", {
      sessionId: learnerId, name: "Synthetic Feedback Learner", email: "feedback@example.test",
      instructorEmail: "teacher@example.test", teamNumber: 3, roeAcknowledged: true,
    }));
    assert.equal(created.reviewGateQuestionId, 107);
    assert.equal(created.authorizationGranted, false);
    const prefix = `/progress/${learnerId}`;
    for (const q of lanternQuestions) {
      const values: Record<number, string> = {
        108: "CASE:JTF-0427-TEAM3", 112: "MAJOR:IMEI:490154203237518", 115: "ALIAS:Harbor",
        117: `IMSI:${imsi}`, 118: "No contacts or messages were present; confirmed in my SIM extraction summary.",
        124: `TPL:Harbor-${imsi.slice(-4)}-VESPER-OPS`,
      };
      const value = values[q.id] ?? (q.manualReview ? "Evidence-supported classroom explanation with source and timestamp." : q.kind === "multiple" ? q.acceptedAnswers : q.acceptedAnswers[0]);
      if (q.id === 117) {
        await call(`${prefix}/answers/117`, "PUT", { value: "IMSI:123" }, 400);
      }
      if (q.id === 124) {
        const wrong = SaveLanternAnswerResponse.parse(await call(`${prefix}/answers/124`, "PUT", { value: "TPL:Harbor-0000-VESPER-OPS" }));
        assert.equal(wrong.correct, false);
      }
      const saved = SaveLanternAnswerResponse.parse(await call(`${prefix}/answers/${q.id}`, "PUT", { value }));
      if (q.manualReview) {
        assert.equal(saved.status, "manual");
        const before = GetLanternProgressResponse.parse(await call(prefix));
        assert.equal(before.reviewGateQuestionId, q.id);
        if (q.id < 126) await call(`${prefix}/answers/${q.id + 1}`, "PUT", { value: "Cannot bypass approval" }, 403);
        await call(`/instructor/submissions/${learnerId}/review/${q.id}`, "PUT", {
          decision: "approved", points: q.points, note: "Verified against this learner's evidence.",
          responseUpdatedAt: before.answers[String(q.id)].updatedAt,
        }, 200, true);
        const recorded = GetLanternWrittenHistoryResponse.parse(await call(`/instructor/submissions/${learnerId}/history/${q.id}`, "GET", undefined, 200, true));
        assert.equal(recorded.length, 2);
      } else {
        assert.equal(saved.correct, true, `Question ${q.id} validates for this learner`);
      }
    }
    const complete = GetLanternProgressResponse.parse(await call(prefix));
    assert.equal(complete.answeredCount, 26);
    assert.equal(complete.unlockedMission, 7);
    assert.equal(complete.totalPoints, 165);
    assert.equal(complete.reviewGateQuestionId, null);
    assert.equal(GetLanternProgressResponse.parse(await call(`${prefix}/submit`, "POST", {})).submittedAt !== null, true);
    const resumed = GetLanternProgressResponse.parse(await call(prefix));
    assert.equal(resumed.answers["117"].value, `IMSI:${imsi}`);
    assert.equal(resumed.answers["124"].correct, true);
    const duplicate = GetLanternProgressResponse.parse(await call("/progress", "POST", {
      sessionId: learnerId, name: "Must not overwrite", email: "other@example.test",
      instructorEmail: "other-teacher@example.test", teamNumber: 4, roeAcknowledged: true,
    }));
    assert.equal(duplicate.name, "Synthetic Feedback Learner");
    assert.equal(duplicate.teamNumber, 3);
  }
  const legacyProgress = GetLanternProgressResponse.parse(await call(`/progress/${oldSid}`));
  assert.equal(legacyProgress.archivedAnswers?.["6"].value, "Legacy response");
  assert.equal(legacyProgress.answeredCount, 0);
  assert.equal(legacyProgress.submittedAt, null);
  console.info(`Written history: ${checks} endpoint checks plus migration, persistence, version, rollback and concurrency assertions passed.`);
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await pool.end();
}
