// Test-only server. Never imported by the classroom API workflow.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { pool } from "@workspace/db";
import lantern from "../src/routes/lantern";

const work = process.env.LANTERN_E2E_WORK!;
const database = new URL(process.env.DATABASE_URL!);
assert.equal(process.env.LANTERN_E2E_ISOLATED, "1");
assert.ok(process.env.LANTERN_E2E_RUN_ID);
assert.ok(work?.includes("lantern-browser-fixture-"));
assert.ok(existsSync(path.join(work, "data", "PG_VERSION")));
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/postgres");
assert.equal(database.searchParams.get("host"), work);
assert.equal(process.env.CTF_INSTRUCTOR_CODE, "lantern-browser-regression-only");

async function main() {
  await pool.query(`CREATE TABLE lantern_progress (
    session_id text PRIMARY KEY,name text NOT NULL,email text NOT NULL,instructor_email text NOT NULL,
    team_number integer NOT NULL,answers jsonb NOT NULL DEFAULT '{}',
    authorization_notes text NOT NULL DEFAULT '',authorization_granted boolean NOT NULL DEFAULT false,
    hints jsonb NOT NULL DEFAULT '[]',speed_bonus integer NOT NULL DEFAULT 0,tradecraft_bonus integer NOT NULL DEFAULT 0,
    saved_at timestamptz NOT NULL DEFAULT now(),submitted_at timestamptz);
    CREATE TABLE lantern_keys(question_id integer PRIMARY KEY,accepted_answers jsonb NOT NULL);`);
  for (const [id, name, value] of [
    ["00000000-0000-4000-8000-000000000001", "Synthetic Alpha", "Alpha original private response"],
    ["00000000-0000-4000-8000-000000000002", "Synthetic Bravo", "Bravo private response"],
  ]) {
    const answer = (value: string, manual = false) => ({
      value, correct: manual ? null : true, status: manual ? "manual" : "correct",
      earnedPoints: manual ? 0 : 10, updatedAt: "2026-01-01T00:00:00Z",
      ...(manual ? { reviewStatus: "pending" } : {}),
    });
    await pool.query(
      "INSERT INTO lantern_progress(session_id,name,email,instructor_email,team_number,answers) VALUES($1,$2,$3,'teacher@example.test',3,$4)",
      [id, name, `${name.split(" ")[1].toLowerCase()}@example.test`,
        JSON.stringify({ "2": answer("CASE:JTF-0427-TEAM3"), "6": answer(value, true) })],
    );
  }
  await pool.query(await readFile("../../lib/db/migrations/lantern-written-history.sql", "utf8"));
  const app = express();
  app.use(express.json());
  app.get("/__lantern_e2e", (_req, res) => res.json({
    isolated: true, runId: process.env.LANTERN_E2E_RUN_ID,
  }));
  app.use("/api", lantern);
  const publicDir = path.join(work, "public");
  assert.ok(existsSync(path.join(publicDir, "index.html")));
  app.use("/silent-lantern", express.static(publicDir));
  app.get("/silent-lantern/{*splat}", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "Isolated history fixture failed" });
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
