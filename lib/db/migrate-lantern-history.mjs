import pg from "pg";
import { readFile } from "node:fs/promises";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(await readFile(new URL("./migrations/lantern-written-history.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("./migrations/classroom-team-reviews.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("./migrations/team-names.sql", import.meta.url), "utf8"));
  console.info("History, team-name, roster and daily-session migrations applied.");
} finally {
  await pool.end();
}
