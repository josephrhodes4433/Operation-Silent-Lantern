import type { pool } from "@workspace/db";
import type { LanternRow } from "./lantern-progress";

type Connection = Pick<typeof pool, "query">;
export async function appendLanternHistory(connection: Connection, row: LanternRow, questionId: number, event: "submitted" | "reviewed") {
  // Caller holds the session row lock. Versions are scoped to each question;
  // reviews reference the last submission version rather than creating one.
  const latest = await connection.query<{ version: number }>(
    "SELECT version FROM lantern_written_history WHERE session_id=$1 AND question_id=$2 ORDER BY id DESC LIMIT 1",
    [row.session_id, questionId],
  );
  const version = (latest.rows[0]?.version ?? 0) + (event === "submitted" ? 1 : 0);
  const answer = row.answers[String(questionId)];
  await connection.query(
    `INSERT INTO lantern_written_history(session_id,question_id,version,event,value,decision,feedback,points,response_updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [row.session_id, questionId, Math.max(1, version), event, answer.value,
      answer.reviewStatus ?? "pending", answer.instructorNote ?? null, answer.instructorPoints ?? null, answer.updatedAt],
  );
}

export async function getLanternHistory(connection: Connection, sessionId: string, questionId: number) {
  const result = await connection.query(
    `SELECT id, question_id AS "questionId", version, event, value, decision,
      feedback, points, response_updated_at AS "responseUpdatedAt", recorded_at AS "recordedAt"
     FROM lantern_written_history WHERE session_id=$1 AND question_id=$2 ORDER BY id`,
    [sessionId, questionId],
  );
  return result.rows;
}
