import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import lantern from "../src/routes/lantern";
import iron from "../src/routes/ctf";
import { fixtureKeys, fixtureRow } from "./ctf-resource-keys.test";
import { classroomFixture } from "./fixtures/classroom-db";

// The runner aliases @workspace/db to classroom-db.ts. No real DB is imported.
process.env.CTF_INSTRUCTOR_CODE = "isolated-fixture-only";
const teacher = { "x-instructor-code": "isolated-fixture-only" };

test("real HTTP written-review flow blocks bypasses and requires a revised denied answer", async () => {
  const row = fixtureRow();
  row.answers = Object.fromEntries(Object.entries(row.answers).filter(([id]) => Number(id) <= 107));
  row.answers["107"].reviewStatus = "pending";
  row.answers["107"].instructorPoints = null;
  classroomFixture.rows.set(row.session_id, structuredClone(row));
  classroomFixture.lanternKeys = fixtureKeys;
  const app = express();
  app.use(express.json());
  app.use("/api", lantern);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/lantern`;
  async function request(path: string, method: string, data: unknown, instructor = false) {
    return fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(instructor ? teacher : {}) }, body: JSON.stringify(data) });
  }
  const review = `/instructor/submissions/${row.session_id}/review/107`;
  const answer = `/progress/${row.session_id}/answers/107`;
  const body = { decision: "approved", points: 5, note: "Sources checked.", responseUpdatedAt: row.answers["107"].updatedAt };
  try {
    assert.equal((await request(`/progress/${row.session_id}/answers/108`, "PUT", { value: "CASE:JTF-0427-TEAM3" })).status, 403);
    assert.equal((await request(review, "PUT", body)).status, 401);
    assert.equal((await request(review, "PUT", { ...body, decision: "denied", note: "" }, true)).status, 400);
    assert.equal((await request(review, "PUT", { ...body, responseUpdatedAt: "2026-10-07T12:00:00Z" }, true)).status, 409);
    const denied = await request(review, "PUT", { ...body, decision: "denied", note: "Add a timestamp and location citation." }, true);
    assert.equal(denied.status, 200);
    assert.equal((await request(answer, "PUT", { value: row.answers["107"].value })).status, 409);
    assert.equal((await request(answer, "PUT", { value: " Evidence-backed  fixture response " })).status, 409);
    const revised = await request(answer, "PUT", { value: "Revised indicator: 12:00 UTC; source location record and message citation." });
    assert.equal(revised.status, 200);
    const saved = await revised.json();
    assert.equal(saved.status, "manual");
    const revisedProgress = await (await fetch(`${base}/progress/${row.session_id}`)).json();
    assert.equal(revisedProgress.answers["107"].reviewStatus, "pending");
    assert.equal(revisedProgress.reviewGateQuestionId, 107);
    assert.equal((await request(`/progress/${row.session_id}/answers/108`, "PUT", { value: "CASE:JTF-0427-TEAM3" })).status, 403);
    assert.equal((await request(review, "PUT", body, true)).status, 409);
    const approved = await request(review, "PUT", { ...body, responseUpdatedAt: revisedProgress.answers["107"].updatedAt }, true);
    assert.equal(approved.status, 200);
    const approvedProgress = await approved.json();
    assert.equal(approvedProgress.answers["107"].reviewStatus, "approved");
    assert.equal(approvedProgress.reviewGateQuestionId, 110);
    assert.equal(approvedProgress.unlockedMission, 1);
    assert.equal((await request(`/progress/${row.session_id}/answers/108`, "PUT", { value: "CASE:JTF-0427-TEAM3" })).status, 200);
    assert.equal((await request(`/progress/${row.session_id}/submit`, "POST", {})).status, 409);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});

test("verified guide imports are authenticated and never overwrite existing classroom keys", async () => {
  classroomFixture.ironKeys = new Map([[13, ["99"]]]);
  const app = express();
  app.use(express.json());
  app.use("/api", iron);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ctf/instructor/keys`;
  const put = (id: number, acceptedAnswers: string[], auth = true) => fetch(`${base}/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json", ...(auth ? teacher : {}) },
    body: JSON.stringify({ acceptedAnswers, onlyIfUnset: true }),
  });
  try {
    assert.equal((await put(14, ["81"], false)).status, 401);
    assert.equal((await put(14, ["82"])).status, 409);
    const preserved = await put(13, ["8"]);
    assert.equal(preserved.status, 200);
    assert.deepEqual((await preserved.json()).acceptedAnswers, ["99"]);
    assert.deepEqual(classroomFixture.ironKeys.get(13), ["99"]);
    assert.equal((await put(14, ["81"])).status, 200);
    assert.deepEqual(classroomFixture.ironKeys.get(14), ["81"]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});
