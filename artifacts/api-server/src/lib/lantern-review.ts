import { ClassroomError } from "./instructor-access";
import { hasLanternResponse, lanternQuestions } from "./lantern-activity";
import type { LanternRow } from "./lantern-progress";

export function sameLanternResponse(a: unknown, b: unknown): boolean {
  const normalize = (v: unknown) => typeof v === "string" ? v.trim().replace(/\s+/g, " ") : v;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
export function reviewGate(answers: LanternRow["answers"]) {
  return lanternQuestions.find(q => q.manualReview && answers[String(q.id)]?.reviewStatus !== "approved")?.id ?? null;
}
export function requireWrittenApproval(row: LanternRow, questionId: number) {
  const gate = reviewGate(row.answers);
  if (gate !== null && questionId > gate) {
    throw new ClassroomError(403, "The earlier written response must be approved by your instructor before you can continue. If denied, revise it and submit it again.");
  }
}
export function reviewLanternResponse(
  row: LanternRow, questionId: number,
  decision: "approved" | "denied", points: number, note: string, responseUpdatedAt: string | Date,
) {
  const answer = row.answers[String(questionId)];
  if (!answer || !hasLanternResponse(answer.value)) throw new ClassroomError(409, "The learner has not submitted a written response for this question.");
  if (new Date(answer.updatedAt).getTime() !== new Date(responseUpdatedAt).getTime()) {
    throw new ClassroomError(409, "The learner changed this response. Refresh and review the latest submission.");
  }
  if (decision === "denied" && !note.trim()) throw new ClassroomError(400, "Add feedback explaining what the learner must revise.");
  answer.reviewStatus = decision;
  answer.instructorPoints = decision === "approved" ? points : 0;
  answer.instructorNote = note.trim();
  row.submitted_at = null;
}
