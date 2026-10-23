import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { ClassroomError } from "./instructor-access";
import type { ActivityId } from "./classroom-teams";

type Connection = Pick<typeof pool, "query">;
interface WindowRow { id: string; started_at: Date | null; expires_at: Date | null; server_now: Date }
async function current(activity: ActivityId, connection: Connection, lock = false) {
  const result = await connection.query<WindowRow>(`SELECT id,started_at,expires_at,clock_timestamp() AS server_now
    FROM classroom_windows WHERE activity=$1 AND closed_at IS NULL ${lock ? "FOR UPDATE" : ""}`, [activity]);
  return result.rows[0];
}
export async function activityWindow(activity: ActivityId, connection: Connection = pool) {
  const row = await current(activity, connection);
  const now = row?.server_now ?? (await connection.query("SELECT clock_timestamp() AS now")).rows[0].now;
  return {
    state: !row?.started_at ? "not_started" : row.expires_at && row.expires_at.getTime() > now.getTime() ? "open" : "expired",
    windowId: row?.id ?? null, startedAt: row?.started_at ?? null, expiresAt: row?.expires_at ?? null,
    serverNow: now, durationHours: 24,
  };
}
// Registration and reopening both hold classroom-teams-${activity}'s advisory
// lock. Concurrent first check-ins therefore start exactly one shared clock.
export async function startActivityWindow(activity: ActivityId, connection: Connection) {
  const row = await current(activity, connection, true);
  if (row?.started_at) {
    if (!row.expires_at || row.expires_at <= row.server_now) throw new ClassroomError(423, "This CTF's 24-hour window has expired. An instructor must reopen it with the password.");
    return row.id;
  }
  const id = row?.id ?? randomUUID();
  if (row) await connection.query(`WITH instant AS (SELECT clock_timestamp() AS t)
    UPDATE classroom_windows SET started_at=instant.t,expires_at=instant.t+interval '24 hours'
    FROM instant WHERE id=$1`, [id]);
  else await connection.query(`WITH instant AS (SELECT clock_timestamp() AS t)
    INSERT INTO classroom_windows(id,activity,started_at,expires_at) SELECT $1,$2,t,t+interval '24 hours' FROM instant`, [id, activity]);
  return id;
}
export async function requireTeamWindow(activity: ActivityId, windowId: string | null | undefined, connection: Connection) {
  if (!windowId) throw new ClassroomError(423, "This earlier team session is archived and read-only. Start a new anonymous team session to continue.");
  const result = await connection.query<WindowRow>(`SELECT id,started_at,expires_at,clock_timestamp() AS server_now
    FROM classroom_windows WHERE activity=$1 AND closed_at IS NULL FOR SHARE`, [activity]);
  const row = result.rows[0];
  if (!row || row.id !== windowId) throw new ClassroomError(423, "This team belongs to an earlier classroom window. Its saved results are read-only.");
  if (!row.started_at || !row.expires_at || row.expires_at <= row.server_now) throw new ClassroomError(423, "The shared 24-hour window has expired. Ask your instructor to reopen the CTF.");
}
export async function reopenActivityWindow(activity: ActivityId) {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`classroom-teams-${activity}`]);
    const row = await current(activity, connection, true);
    if (row && (!row.started_at || (row.expires_at && row.expires_at > row.server_now))) {
      throw new ClassroomError(409, "The current window has not expired. Its clock cannot be reset early.");
    }
    if (row) await connection.query("UPDATE classroom_windows SET closed_at=clock_timestamp() WHERE id=$1", [row.id]);
    await connection.query("INSERT INTO classroom_windows(id,activity) VALUES($1,$2)", [randomUUID(), activity]);
    const status = await activityWindow(activity, connection);
    await connection.query("COMMIT");
    return status;
  } catch (error) { await connection.query("ROLLBACK"); throw error; }
  finally { connection.release(); }
}
