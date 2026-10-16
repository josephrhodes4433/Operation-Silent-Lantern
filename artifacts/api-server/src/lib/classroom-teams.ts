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
export function teamSessionDate(row: { session_date?: string | Date | null; saved_at: Date; submitted_at?: Date | null }) {
  if (typeof row.session_date === "string") return row.session_date;
  // node-postgres can return DATE as local midnight; read its calendar parts,
  // not a UTC conversion that could change the day.
  if (row.session_date instanceof Date) {
    const d = row.session_date;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(row.submitted_at ?? row.saved_at));
}
function teamRoster(name: string, additional: string[] = []) {
  const members = [name, ...additional].map(n => n.trim().replace(/\s+/gu, " "));
  if (members.length > 30 || members.some(n => !n || n.length > 140 || /[\p{Cc}\p{Cf}]/u.test(n))) {
    throw new ClassroomError(400, "List up to 30 team members, each with a full name of 1 to 140 characters.");
  }
  return members;
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
        await client.query(`UPDATE ${activity}_progress SET
          team_name=coalesce(team_name,'Team ' || team_number),
          team_members=coalesce(team_members,jsonb_build_array(name)),
          session_date=coalesce(session_date,(coalesce(submitted_at,saved_at) AT TIME ZONE 'America/New_York')::date)
          WHERE team_name IS NULL OR team_members IS NULL OR session_date IS NULL`);
        await client.query(`INSERT INTO classroom_teams(activity,team_number,session_id,team_name,session_date)
          SELECT DISTINCT ON(team_number) $1,team_number,session_id,team_name,session_date FROM ${activity}_progress
          ORDER BY team_number,saved_at DESC,session_id ON CONFLICT DO NOTHING`, [activity]);
        await client.query(`UPDATE classroom_teams t SET
          team_name=coalesce(t.team_name,p.team_name),session_date=coalesce(t.session_date,p.session_date)
          FROM ${activity}_progress p WHERE t.activity=$1 AND t.session_id=p.session_id
          AND (t.team_name IS NULL OR t.session_date IS NULL)`, [activity]);
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
  sessionId: string; name: string; email: string; instructorEmail: string; teamName: string; additionalTeamMembers?: string[];
}) {
  const teamName = normalizeTeamName(body.teamName);
  const members = teamRoster(body.name, body.additionalTeamMembers);
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
    const registered = await client.query(`SELECT 1 FROM classroom_teams WHERE activity=$1
      AND session_date=(CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date
      AND lower(team_name)=lower($2)`, [activity, teamName]);
    if (registered.rowCount) throw new ClassroomError(409, "This team already has a saved submission. Ask your teammate for the private resume link or token; do not start a second submission.");
    const allocated = await client.query(`SELECT greatest(
      coalesce((SELECT max(team_number) FROM ${activity}_progress),0),
      coalesce((SELECT max(team_number) FROM classroom_teams WHERE activity=$1),0)
    )+1 AS number`, [activity]);
    const teamNumber = allocated.rows[0].number;
    const saved = await client.query(`INSERT INTO ${activity}_progress(session_id,name,email,instructor_email,team_number,team_name,team_members,session_date)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,(CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date) RETURNING *`,
      [body.sessionId, body.name.trim(), body.email.trim().toLowerCase(), body.instructorEmail.trim().toLowerCase(), teamNumber, teamName, JSON.stringify(members)]);
    await client.query(`INSERT INTO classroom_teams(activity,team_number,session_id,team_name,session_date)
      VALUES($1,$2,$3,$4,(CURRENT_TIMESTAMP AT TIME ZONE 'America/New_York')::date)`, [activity, teamNumber, body.sessionId, teamName]);
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
