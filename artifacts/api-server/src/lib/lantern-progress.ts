import { pool } from "@workspace/db";
import { GetLanternProgressResponse } from "@workspace/api-zod";
import { ClassroomError } from "./instructor-access";
import { evaluateLantern, hasLanternResponse, hintTexts, lanternQuestions, missionFlagIds } from "./lantern-activity";

export type Progress = ReturnType<typeof GetLanternProgressResponse.parse>;
export interface LanternRow {
  session_id: string; name: string; email: string; instructor_email: string; team_number: number;
  answers: Progress["answers"]; authorization_notes: string; authorization_granted: boolean;
  hints: number[]; speed_bonus: number; tradecraft_bonus: number;
  saved_at: Date; submitted_at: Date | null;
}
export async function loadLanternKeys(connection: Pick<typeof pool, "query"> = pool) {
  const result = await connection.query<{ question_id: number; accepted_answers: string[] }>("SELECT question_id,accepted_answers FROM lantern_keys");
  return new Map(result.rows.map(row => [row.question_id, row.accepted_answers]));
}
export function lanternProgress(row: LanternRow, keys: Map<number, string[]>) {
  const answers: Progress["answers"] = {};
  for (const [id, answer] of Object.entries(row.answers)) {
    const question = lanternQuestions.find(q => q.id === Number(id));
    if (!question) continue;
    const grade = evaluateLantern(question, answer.value, keys, row.team_number, row.authorization_granted);
    if (question.id === 16 && grade.correct && typeof answer.value === "string") {
      const alias = String(row.answers["5"]?.value ?? "").split(":")[1];
      const imsi = String(row.answers["10"]?.value ?? "").split(":")[1];
      const parts = answer.value.trim().split(":")[1].split("-");
      if (!alias || !imsi || parts[0].toLowerCase() !== alias.toLowerCase() || parts[1] !== imsi.slice(-4)) {
        grade.correct = false;
        grade.status = "incorrect";
        grade.earnedPoints = 0;
      }
    }
    answers[id] = { ...answer, correct: grade.correct, status: grade.status, earnedPoints: question.manualReview && hasLanternResponse(answer.value) && answer.instructorPoints != null ? answer.instructorPoints : grade.earnedPoints };
  }
  let unlockedMission = 1;
  for (const id of missionFlagIds) {
    if (answers[String(id)]?.correct !== true) break;
    unlockedMission++;
  }
  const rawPoints = Object.values(answers).reduce((sum, answer) => sum + answer.earnedPoints, 0);
  const penaltyPoints = row.hints.length * 2;
  return GetLanternProgressResponse.parse({
    sessionId: row.session_id, name: row.name, email: row.email, instructorEmail: row.instructor_email, teamNumber: row.team_number,
    roeAcknowledged: true, answers, rawPoints, penaltyPoints, speedBonus: row.speed_bonus, tradecraftBonus: row.tradecraft_bonus,
    totalPoints: Math.max(0, rawPoints - penaltyPoints + row.speed_bonus + row.tradecraft_bonus),
    answeredCount: Object.values(answers).filter(a => hasLanternResponse(a.value)).length,
    unlockedMission, authorizationNotes: row.authorization_notes, authorizationGranted: row.authorization_granted,
    trainingAuthorizationCode: row.authorization_granted && unlockedMission >= 5 ? keys.get(14)?.[0] ?? null : null,
    hints: row.hints.map(missionId => ({ missionId, text: hintTexts[missionId - 1] })),
    savedAt: row.saved_at, submittedAt: row.submitted_at,
  });
}
export async function getLanternRow(sessionId: string) {
  const result = await pool.query<LanternRow>("SELECT * FROM lantern_progress WHERE session_id=$1", [sessionId]);
  if (!result.rows[0]) throw new ClassroomError(404, "No SILENT LANTERN session found for this private resume token.");
  return result.rows[0];
}
// Serialize all session writes so autosaves, hint debits and instructor reviews
// cannot overwrite each other's JSON responses or administrative changes.
export async function changeLantern(sessionId: string, action: (row: LanternRow, keys: Map<number, string[]>) => void | Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<LanternRow>("SELECT * FROM lantern_progress WHERE session_id=$1 FOR UPDATE", [sessionId]);
    const row = result.rows[0];
    if (!row) throw new ClassroomError(404, "Saved session not found.");
    const keys = await loadLanternKeys(client);
    await action(row, keys);
    const updated = await client.query<LanternRow>(
      `UPDATE lantern_progress SET answers=$2::jsonb,authorization_notes=$3,authorization_granted=$4,hints=$5::jsonb,speed_bonus=$6,tradecraft_bonus=$7,submitted_at=$8,saved_at=now() WHERE session_id=$1 RETURNING *`,
      [sessionId, JSON.stringify(row.answers), row.authorization_notes, row.authorization_granted, JSON.stringify(row.hints), row.speed_bonus, row.tradecraft_bonus, row.submitted_at],
    );
    await client.query("COMMIT");
    return lanternProgress(updated.rows[0], keys);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
