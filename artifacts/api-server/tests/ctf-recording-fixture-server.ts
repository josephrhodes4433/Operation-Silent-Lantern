// Disposable, real-PostgreSQL fixture server for the two CTF walkthrough videos.
// This entry point is only bundled/launched by scripts/record-ctf-walkthroughs.mjs.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { pool } from "@workspace/db";
import ctf from "../src/routes/ctf";
import lantern from "../src/routes/lantern";
import classroom from "../src/routes/classroom";
import { questions, isManual } from "../src/lib/ctf-activity";
import { lanternQuestions } from "../src/lib/lantern-activity";

const work = process.env.CTF_RECORDING_WORK!;
const dbUrl = new URL(process.env.DATABASE_URL!);
const ironDir = process.env.CTF_RECORDING_IRON_PUBLIC!;
const lanternDir = process.env.CTF_RECORDING_LANTERN_PUBLIC!;
assert.equal(process.env.CTF_RECORDING_FIXTURE, "ctf-recording-fixture-only");
assert.ok(process.env.CTF_RECORDING_RUN_ID);
assert.ok(work?.includes("ctf-recordings-"));
assert.ok(existsSync(path.join(work, "data", "PG_VERSION")));
assert.equal(dbUrl.hostname, "127.0.0.1");
assert.equal(dbUrl.searchParams.get("host"), work);
assert.equal(process.env.CTF_INSTRUCTOR_CODE, "ctf-recording-fixture-only");
assert.ok(existsSync(path.join(ironDir, "index.html")));
assert.ok(existsSync(path.join(lanternDir, "index.html")));

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ctf_progress (
      session_id text PRIMARY KEY, name text NOT NULL, email text NOT NULL,
      instructor_email text NOT NULL, answers jsonb NOT NULL DEFAULT '{}',
      saved_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS ctf_keys (question_id integer PRIMARY KEY, accepted_answers jsonb NOT NULL);
    CREATE TABLE IF NOT EXISTS ctf_questions (question_id integer PRIMARY KEY, definition jsonb NOT NULL);
    CREATE TABLE IF NOT EXISTS lantern_progress (
      session_id text PRIMARY KEY,name text NOT NULL,email text NOT NULL,instructor_email text NOT NULL,
      team_number integer NOT NULL,answers jsonb NOT NULL DEFAULT '{}',
      authorization_notes text NOT NULL DEFAULT '',authorization_granted boolean NOT NULL DEFAULT false,
      hints jsonb NOT NULL DEFAULT '[]',speed_bonus integer NOT NULL DEFAULT 0,tradecraft_bonus integer NOT NULL DEFAULT 0,
      saved_at timestamptz NOT NULL DEFAULT now(),submitted_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS lantern_keys(question_id integer PRIMARY KEY,accepted_answers jsonb NOT NULL);
  `);
  await pool.query(await readFile(path.join(process.cwd(), "../../lib/db/migrations/lantern-written-history.sql"), "utf8"));
  await pool.query(await readFile(path.join(process.cwd(), "../../lib/db/migrations/classroom-team-reviews.sql"), "utf8"));
  // Seed only the isolated DB. Fixed-choice answer keys come from current
  // source definitions; evidence-dependent gaps receive conspicuous synthetic
  // values, never a claim about actual evidence.
  for (const q of questions) {
    if (isManual(q)) continue;
    let accepted = q.category === "auto" ? q.acceptedAnswers : (q.facilitatorAnswers ?? q.acceptedAnswers);
    if (!accepted?.length) accepted = (q.kind === "single" || q.kind === "multiple")
      ? q.options.slice(0, 1)
      : [q.kind === "number" || q.validationMode === "numeric" ? "42" : `DEMO-ILLUSTRATIVE-FLAG-${q.id}`];
    await pool.query("INSERT INTO ctf_keys(question_id,accepted_answers) VALUES($1,$2::jsonb) ON CONFLICT(question_id) DO UPDATE SET accepted_answers=excluded.accepted_answers", [q.id, JSON.stringify(accepted)]);
  }
  for (const [id, answers] of [
    [112, ["MAJOR:IMEI:490154203237518"]],
    [115, ["ALIAS:FALCON"]],
    [124, ["VESPER"]],
  ] as const) {
    await pool.query("INSERT INTO lantern_keys(question_id,accepted_answers) VALUES($1,$2::jsonb) ON CONFLICT(question_id) DO UPDATE SET accepted_answers=excluded.accepted_answers", [id, JSON.stringify(answers)]);
  }
  const app = express();
  app.use(express.json());
  app.get("/__ctf_recording_fixture", (_req, res) => res.json({
    marker: "ctf-recording-fixture-only", runId: process.env.CTF_RECORDING_RUN_ID,
  }));
  app.use("/api", classroom, ctf, lantern);
  app.use("/silent-lantern", express.static(lanternDir));
  app.get("/silent-lantern/{*splat}", (_req, res) => res.sendFile(path.join(lanternDir, "index.html")));
  app.use(express.static(ironDir));
  app.get("/{*splat}", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/silent-lantern/")) return next();
    res.sendFile(path.join(ironDir, "index.html"));
  });
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error.stack);
    res.status(500).json({ error: "Isolated recording fixture failed" });
  });
  const server = app.listen(0, "127.0.0.1", () => {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    process.send!({ url: `http://127.0.0.1:${address.port}` });
  });
  process.on("SIGTERM", () => {
    server.close(() => { void pool.end().then(() => process.exit(0)); });
    server.closeAllConnections();
  });
}
void main().catch(error => { console.error(error); process.exit(1); });
