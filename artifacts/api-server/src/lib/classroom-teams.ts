import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { ClassroomError } from "./instructor-access";

export type ActivityId = "ctf" | "lantern";
type Query = Pick<typeof pool, "query">;
const bootstraps = new Map<ActivityId, Promise<void>>();
export const hasResponse = (value: unknown) => typeof value === "string" ? !!value.trim() : Array.isArray(value) && value.length > 0;
export const sameResponse = (a: unknown, b: unknown) => JSON.stringify(typeof a === "string" ? a.trim().replace(/\s+/g, " ") : a) === JSON.stringify(typeof b === "string" ? b.trim().replace(/\s+/g, " ") : b);
export function normalizeTeamName(value: string) {
  const name = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!name || name.length > 60 || /[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new ClassroomError(400, "Enter a team name of 1 to 60 characters, without control characters.");
  }
  return name;
}
export function completionPercentage(answers: Record<string, { correct?: boolean | null }>, ids: number[]) {
  const done = ids.filter(id => answers[String(id)]?.correct === true).length;
  // A rounded-up 100 must never imply completion with one requirement pending.
  return done === ids.length ? 100 : Math.floor(done * 100 / ids.length);
}

export async function bootstrapTeams(activity: ActivityId) {
  if (!bootstraps.has(activity)) {
    const work = (async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`classroom-teams-${activity}`]);
        if (activity === "ctf") {
          // Preserve every pre-team learner session; give each its own team.
          await client.query(`WITH missing AS (
            SELECT session_id, row_number() OVER(ORDER BY saved_at,session_id) +
            (SELECT coalesce(max(team_number),0) FROM ctf_progress) AS n
            FROM ctf_progress WHERE team_number IS NULL
          ) UPDATE ctf_progress p SET team_number=missing.n FROM missing WHERE p.session_id=missing.session_id`);
        }
        // Legacy duplicate SL team numbers remain privately accessible. Select
        // one stable canonical shared session without merging/deleting answers.
        await client.query(`UPDATE ${activity}_progress SET team_name='Team ' || team_number WHERE team_name IS NULL`);
        await client.query(`INSERT INTO classroom_teams(activity,team_number,session_id,team_name)
          SELECT DISTINCT ON(team_number) $1,team_number,session_id,team_name FROM ${activity}_progress
          ORDER BY team_number,saved_at DESC,session_id ON CONFLICT DO NOTHING`, [activity]);
        await client.query("UPDATE classroom_teams SET team_name='Team ' || team_number WHERE activity=$1 AND team_name IS NULL", [activity]);
        await client.query("COMMIT");
      } catch (e) { await client.query("ROLLBACK"); throw e; }
      finally { client.release(); }
    })();
    bootstraps.set(activity, work);
    work.catch(() => bootstraps.delete(activity));
  }
  await bootstraps.get(activity);
}

export async function createSharedTeam(activity: ActivityId, body: {
  sessionId: string; name: string; email: string; instructorEmail: string; teamName: string;
}) {
  const teamName = normalizeTeamName(body.teamName);
  await bootstrapTeams(activity);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`classroom-teams-${activity}`]);
    const previous = await client.query(`SELECT * FROM ${activity}_progress WHERE session_id=$1`, [body.sessionId]);
    if (previous.rows[0]) {
      await client.query("COMMIT");
      return previous.rows[0];
    }
    const registered = await client.query("SELECT 1 FROM classroom_teams WHERE activity=$1 AND lower(team_name)=lower($2)", [activity, teamName]);
    if (registered.rowCount) throw new ClassroomError(409, "This team already has a saved submission. Ask your teammate for the private resume link or token; do not start a second submission.");
    const allocated = await client.query(`SELECT greatest(
      coalesce((SELECT max(team_number) FROM ${activity}_progress),0),
      coalesce((SELECT max(team_number) FROM classroom_teams WHERE activity=$1),0)
    )+1 AS number`, [activity]);
    const teamNumber = allocated.rows[0].number;
    const saved = await client.query(`INSERT INTO ${activity}_progress(session_id,name,email,instructor_email,team_number,team_name) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [body.sessionId, body.name.trim(), body.email.trim().toLowerCase(), body.instructorEmail.trim().toLowerCase(), teamNumber, teamName]);
    await client.query("INSERT INTO classroom_teams(activity,team_number,session_id,team_name) VALUES($1,$2,$3,$4)", [activity, teamNumber, body.sessionId, teamName]);
    await client.query("COMMIT");
    return saved.rows[0];
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
}

export async function recordCompletion(activity: ActivityId, progress: {
  sessionId: string; answers: Record<string, { correct?: boolean | null }>;
}, ids: number[], connection: Query = pool) {
  if (completionPercentage(progress.answers, ids) !== 100) return;
  await connection.query(`INSERT INTO classroom_notifications(id,activity,session_id,team_number)
    SELECT $1,activity,session_id,team_number FROM classroom_teams WHERE activity=$2 AND session_id=$3
    ON CONFLICT(activity,session_id) DO NOTHING`, [randomUUID(), activity, progress.sessionId]);
}
