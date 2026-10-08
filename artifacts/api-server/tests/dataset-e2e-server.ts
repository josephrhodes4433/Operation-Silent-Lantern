// Test-only entry point, never imported by the managed API workflow.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import { pool } from "@workspace/db";
import ctf from "../src/routes/ctf";

const socket = process.env.CTF_E2E_DB_SOCKET!;
const database = new URL(process.env.DATABASE_URL!);
assert.equal(process.env.CTF_E2E_ISOLATED, "1");
assert.ok(process.env.CTF_E2E_RUN_ID);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/ctf_e2e");
assert.equal(database.searchParams.get("host"), socket);
assert.ok(socket && existsSync(path.join(socket, "data", "PG_VERSION")));
assert.equal(process.env.CTF_INSTRUCTOR_CODE, "iron-meridian-browser-regression-only");

async function main() {
  // Minimal real PostgreSQL schema for the existing CTF router; no SQL adapters.
  await pool.query(`
    CREATE TABLE ctf_progress (
      session_id text PRIMARY KEY, name text NOT NULL, email text NOT NULL,
      instructor_email text NOT NULL, answers jsonb NOT NULL DEFAULT '{}',
      saved_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz
    );
    CREATE TABLE ctf_keys (question_id integer PRIMARY KEY, accepted_answers jsonb NOT NULL);
    CREATE TABLE ctf_questions (question_id integer PRIMARY KEY, definition jsonb NOT NULL);
  `);
  const app = express();
  app.use(express.json());
  app.get("/__ctf_e2e", (_req, res) => {
    res.json({ isolated: true, runId: process.env.CTF_E2E_RUN_ID });
  });
  app.use("/api", ctf);
  const publicDir = process.env.CTF_E2E_PUBLIC_DIR!;
  assert.ok(existsSync(path.join(publicDir, "index.html")));
  app.use(express.static(publicDir));
  app.get("/{*splat}", (_req, res) => { res.sendFile(path.join(publicDir, "index.html")); });
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    process.stderr.write(`${err.stack}\n`);
    res.status(500).json({ error: "Isolated test server failed" });
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

void main().catch(error => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});
