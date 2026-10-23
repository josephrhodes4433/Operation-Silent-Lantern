import { pool } from "@workspace/db";
import { GetCtfProgressResponse } from "@workspace/api-zod";
import { evaluate, requiresReview, type Question } from "./ctf-activity";
import { bootstrapTeams, hasResponse, recordCompletion, teamSessionDate } from "./classroom-teams";
import { loadQuestions } from "./ctf-question-authoring";
import { ClassroomError } from "./instructor-access";
import { requireTeamWindow } from "./classroom-window";

export type Progress = ReturnType<typeof GetCtfProgressResponse.parse>;
export interface ProgressRow {
  session_id: string; name: string; email: string; instructor_email: string;
  team_number: number | null; team_name?: string | null; answers: Progress["answers"]; saved_at: Date; submitted_at: Date | null;
  team_members?: string[] | null; session_date?: string | Date | null;
  instructor_name?: string | null; window_id?: string | null;
}
export async function loadKeys(connection: Pick<typeof pool, "query"> = pool) {
  const result = await connection.query<{ question_id: number; accepted_answers: string[] }>("SELECT question_id,accepted_answers FROM ctf_keys");
  return new Map(result.rows.map(row => [row.question_id, row.accepted_answers]));
}
export function toProgress(row: ProgressRow, keys: Map<number, string[]>, questions: Question[]) {
  const answers: Progress["answers"] = {};
  for (const [id, answer] of Object.entries(row.answers || {})) {
    const question = questions.find(q => q.id === Number(id));
    if (!question) continue;
    const grade = evaluate(question, answer.value, keys);
    if (requiresReview(question, keys)) {
      const approved = hasResponse(answer.value) && answer.reviewStatus === "approved";
      const denied = answer.reviewStatus === "denied";
      answers[id] = { ...answer, reviewStatus: answer.reviewStatus ?? "pending",
        correct: approved ? true : denied ? false : null, status: approved ? "correct" : denied ? "incorrect" : "manual",
        earnedPoints: approved ? question.points : 0,
        feedback: approved ? "Instructor accepted this response." : denied ? "Revise your response using the instructor's feedback." : "Saved for instructor acceptance; points are added when accepted." };
    } else answers[id] = { ...answer, ...grade };
  }
  return GetCtfProgressResponse.parse({
    sessionId: row.session_id, teamNumber: row.team_number, instructorName: row.instructor_name || "Not recorded", windowId: row.window_id ?? null,
    teamName: row.team_name ?? (row.team_number == null ? "Unassigned team" : `Team ${row.team_number}`),
    sessionDate: teamSessionDate(row),
    answers, totalPoints: Object.values(answers).reduce((sum, answer) => sum + answer.earnedPoints, 0),
    answeredCount: Object.values(answers).filter(a => hasResponse(a.value)).length,
    savedAt: row.saved_at, submittedAt: row.submitted_at,
  });
}

export async function changeIron(sessionId: string, action: (row: ProgressRow, keys: Map<number, string[]>, questions: Question[]) => void | Promise<void>, instructorAction = false) {
  await bootstrapTeams("ctf");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<ProgressRow>("SELECT * FROM ctf_progress WHERE session_id=$1 FOR UPDATE", [sessionId]);
    const row = result.rows[0];
    if (!row) throw new ClassroomError(404, "Saved team submission not found.");
    if (!instructorAction) await requireTeamWindow("ctf", row.window_id, client);
    const keys = await loadKeys(client);
    const questions = await loadQuestions();
    await action(row, keys, questions);
    const updated = await client.query<ProgressRow>("UPDATE ctf_progress SET answers=$2::jsonb,submitted_at=$3,saved_at=now() WHERE session_id=$1 RETURNING *",
      [sessionId, JSON.stringify(row.answers), row.submitted_at]);
    const progress = toProgress(updated.rows[0], keys, questions);
    await recordCompletion("ctf", progress, questions.map(q => q.id), client);
    await client.query("COMMIT");
    return progress;
  } catch (e) { await client.query("ROLLBACK"); throw e; }
  finally { client.release(); }
}
