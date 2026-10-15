import { pool } from "@workspace/db";
import { GetLanternProgressResponse } from "@workspace/api-zod";
import { ClassroomError } from "./instructor-access";
import { evaluateLantern, hasLanternResponse, hintTexts, lanternQuestions, missionFlagIds } from "./lantern-activity";
import { reviewGate } from "./lantern-review";
import { appendLanternHistory } from "./lantern-history";

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
    const grade = evaluateLantern(question, answer.value, keys, row.team_number, row.authorization_granted, row.answers);
    if (question.manualReview) {
      const approved = hasLanternResponse(answer.value) && answer.reviewStatus === "approved" && grade.status !== "incorrect";
      answers[id] = {
        ...answer, reviewStatus: answer.reviewStatus ?? "pending",
        correct: approved ? true : answer.reviewStatus === "denied" ? false : null,
        status: approved ? "correct" : answer.reviewStatus === "denied" ? "incorrect" : "manual",
        earnedPoints: approved ? answer.instructorPoints ?? 0 : 0,
      };
    } else {
      answers[id] = { ...answer, correct: grade.correct, status: grade.status, earnedPoints: grade.earnedPoints };
    }
  }
  let unlockedMission = 1;
  for (const id of missionFlagIds) {
    const section = lanternQuestions.find(q => q.id === id)!.section;
    if (answers[String(id)]?.correct !== true || lanternQuestions.some(q => q.section === section && q.manualReview && answers[String(q.id)]?.reviewStatus !== "approved")) break;
    unlockedMission++;
  }
  const rawPoints = Object.values(answers).reduce((sum, answer) => sum + answer.earnedPoints, 0);
  const currentHints = row.hints.filter(id => id >= 101 && id <= 106);
  const penaltyPoints = currentHints.length * 2;
  return GetLanternProgressResponse.parse({
    sessionId: row.session_id, name: row.name, email: row.email, instructorEmail: row.instructor_email, teamNumber: row.team_number,
    archivedAnswers: Object.fromEntries(Object.entries(row.answers).filter(([id]) => Number(id) <= 18).map(([id, answer]) => [id, {
      ...answer, correct: answer.correct ?? null, earnedPoints: answer.earnedPoints ?? 0, status: answer.status ?? "manual",
    }])),
    roeAcknowledged: true, answers, rawPoints, penaltyPoints, speedBonus: row.speed_bonus, tradecraftBonus: row.tradecraft_bonus,
    totalPoints: Math.max(0, rawPoints - penaltyPoints + row.speed_bonus + row.tradecraft_bonus),
    answeredCount: Object.values(answers).filter(a => hasLanternResponse(a.value)).length,
    unlockedMission, reviewGateQuestionId: reviewGate(answers), authorizationNotes: row.authorization_notes, authorizationGranted: false,
    trainingAuthorizationCode: null,
    hints: currentHints.map(id => ({ missionId: id - 100, text: hintTexts[id - 101] })),
    savedAt: row.saved_at, submittedAt: unlockedMission === 7 && Object.keys(answers).length === lanternQuestions.length && reviewGate(answers) === null ? row.submitted_at : null,
  });
}
export async function getLanternRow(sessionId: string) {
  const result = await pool.query<LanternRow>("SELECT * FROM lantern_progress WHERE session_id=$1", [sessionId]);
  if (!result.rows[0]) throw new ClassroomError(404, "No SILENT LANTERN session found for this private resume token.");
  return result.rows[0];
}
// Serialize all session writes so autosaves, hint debits and instructor reviews
// cannot overwrite each other's JSON responses or administrative changes.
export async function changeLantern(sessionId: string, action: (row: LanternRow, keys: Map<number, string[]>, record: (questionId: number, event: "submitted" | "reviewed") => Promise<void>) => void | Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<LanternRow>("SELECT * FROM lantern_progress WHERE session_id=$1 FOR UPDATE", [sessionId]);
    const row = result.rows[0];
    if (!row) throw new ClassroomError(404, "Saved session not found.");
    const keys = await loadLanternKeys(client);
    await action(row, keys, (questionId, event) => appendLanternHistory(client, row, questionId, event));
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
