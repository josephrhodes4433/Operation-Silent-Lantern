import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import express from "express";
import { GetCtfInstructorAnswerGuideResponse, GetLanternInstructorAnswerGuideResponse } from "@workspace/api-zod";
import { ironAnswerGuide } from "../src/lib/iron-answer-guide";
import { lanternAnswerGuide } from "../src/lib/lantern-answer-guide";
import { questions, publicActivity, validationMode } from "../src/lib/ctf-activity";
import { lanternQuestions, publicLanternActivity } from "../src/lib/lantern-activity";
import iron from "../src/routes/ctf";
import lantern from "../src/routes/lantern";
import { classroomFixture } from "./fixtures/classroom-db";

// Runner aliases the DB module to the isolated in-memory, read-only fixture.
process.env.CTF_INSTRUCTOR_CODE = "answer-guide-fixture-only";
const ironKeys = new Map([[17, ["PRIVATE-CLASSROOM-FINDING"]]]);
const lanternKeys = new Map([[112, ["MAJOR:IMEI:490154203237518"]], [115, ["ALIAS:Harbor"]], [124, ["VESPER"]]]);

test("IRON guide covers the live bank and separates active keys, references and examples", () => {
  const guide = GetCtfInstructorAnswerGuideResponse.parse(ironAnswerGuide(questions, ironKeys));
  assert.equal(guide.entries.length, 120);
  assert.equal(new Set(guide.entries.map(e => e.section)).size, 8);
  assert.deepEqual(guide.entries.map(e => e.id), questions.map(q => q.id));
  for (const q of questions) {
    const e = guide.entries.find(e => e.id === q.id)!;
    if (validationMode(q) === "manual") {
      assert.equal(e.source, "manual");
      assert.ok(e.sampleResponse.length > 30, `Written Flag ${q.id} needs an illustrative response`);
      assert.deepEqual(e.answers, []);
    } else if (validationMode(q) !== "dataset") assert.deepEqual(e.answers, q.acceptedAnswers);
  }
  assert.deepEqual(guide.entries.find(e => e.id === 17)?.answers, ["PRIVATE-CLASSROOM-FINDING"]);
  assert.equal(guide.entries.find(e => e.id === 17)?.source, "classroom");
  assert.ok(guide.entries.some(e => e.source === "reference" && e.referenceAnswers.length));
  assert.match(guide.notice, /illustrative/);
});

test("authored IRON questions use current definitions, without unrelated baseline samples", () => {
  const changed = questions.map(q => q.id === 51 ? { ...q, prompt: "Instructor-authored replacement question" } : q);
  const e = ironAnswerGuide(changed, ironKeys).entries.find(e => e.id === 51)!;
  assert.equal(e.prompt, "Instructor-authored replacement question");
  assert.equal(e.sampleResponse, "");
  assert.match(e.notes, /Instructor-authored/);
});

test("SILENT guide matches revised curriculum, flags, individual SIM and final pattern", () => {
  const guide = GetLanternInstructorAnswerGuideResponse.parse(lanternAnswerGuide(lanternKeys));
  assert.equal(guide.entries.length, 26);
  assert.equal(new Set(guide.entries.map(e => e.section)).size, 6);
  assert.deepEqual(guide.entries.map(e => e.id), lanternQuestions.map(q => q.id));
  assert.equal(guide.entries.reduce((sum, e) => sum + e.points, 0), 165);
  for (const q of lanternQuestions) {
    const e = guide.entries.find(e => e.id === q.id)!;
    if (q.manualReview) {
      assert.equal(e.source, "manual");
      assert.ok(e.sampleResponse.length > 10, `Written ${q.code} needs a sample`);
      assert.ok(e.guidance.length > 20);
    } else if (q.keyMode === "fixed") assert.deepEqual(e.answers, q.acceptedAnswers);
  }
  assert.deepEqual(guide.entries.find(e => e.id === 123)?.answers, ["MSM8909"]);
  assert.match(guide.entries.find(e => e.id === 117)!.guidance, /no shared classroom IMSI/);
  assert.equal(guide.entries.find(e => e.id === 124)?.source, "classroom");
  assert.deepEqual(guide.entries.find(e => e.id === 124)?.answers, ["TPL:<verified alias>-<approved IMSI last four>-VESPER"]);
  const unconfigured = lanternAnswerGuide(new Map());
  assert.equal(unconfigured.entries.find(e => e.id === 124)?.source, "unconfigured");
  assert.deepEqual(unconfigured.entries.find(e => e.id === 124)?.answers, []);
  assert.ok(!JSON.stringify(guide).includes("AUTH:"));
});

test("guides never leak through either public activity response", () => {
  const publicResponses = JSON.stringify([publicActivity(ironKeys), publicLanternActivity(lanternKeys)]);
  for (const marker of ["PRIVATE-CLASSROOM-FINDING", "490154203237518", "ALIAS:Harbor", "sampleResponse", "referenceAnswers", "VESPER"]) {
    assert.ok(!publicResponses.includes(marker), `Public activity must not include ${marker}`);
  }
});

test("both guide routes require instructor access, send no-store and reflect current keys", async () => {
  classroomFixture.ironKeys = ironKeys;
  classroomFixture.lanternKeys = lanternKeys;
  const app = express();
  app.use(express.json());
  app.use("/api", iron, lantern);
  app.use(((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: error.message })) as express.ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr !== "string");
  const base = `http://127.0.0.1:${addr.port}/api`;
  try {
    for (const prefix of ["ctf", "lantern"]) {
      const path = `${base}/${prefix}/instructor/answer-guide`;
      const denied = await fetch(path);
      assert.equal(denied.status, 401);
      assert.ok(!JSON.stringify(await denied.json()).includes("entries"));
      const wrong = await fetch(path, { headers: { "x-instructor-code": "wrong-fixture-code" } });
      assert.equal(wrong.status, 401);
      const result = await fetch(path, { headers: { "x-instructor-code": "answer-guide-fixture-only" } });
      assert.equal(result.status, 200);
      assert.equal(result.headers.get("cache-control"), "no-store");
      const payload = await result.json();
      if (prefix === "ctf") assert.equal(GetCtfInstructorAnswerGuideResponse.parse(payload).entries.length, 120);
      else assert.equal(GetLanternInstructorAnswerGuideResponse.parse(payload).entries.length, 26);
    }
    classroomFixture.lanternKeys.set(115, ["ALIAS:NewAlias"]);
    const changed = GetLanternInstructorAnswerGuideResponse.parse(await (await fetch(`${base}/lantern/instructor/answer-guide`, {
      headers: { "x-instructor-code": "answer-guide-fixture-only" },
    })).json());
    assert.deepEqual(changed.entries.find(e => e.id === 115)?.answers, ["ALIAS:NewAlias"]);
    classroomFixture.lanternKeys.set(115, ["ALIAS:Harbor"]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  await mkdir("../../generated-artifacts/test-fixtures", { recursive: true });
  await writeFile("../../generated-artifacts/test-fixtures/answer-guides.json", JSON.stringify({
    code: "answer-guide-fixture-only",
    iron: ironAnswerGuide(questions, ironKeys), lantern: lanternAnswerGuide(lanternKeys),
  }));
});
