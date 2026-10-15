import { Router, type IRouter, type ErrorRequestHandler } from "express";
import { pool } from "@workspace/db";
import {
  CreateLanternProgressBody, GetLanternProgressParams, SaveLanternAnswerBody, SaveLanternAnswerParams,
  UseLanternHintParams, VerifyLanternInstructorBody,
  SetLanternInstructorKeyParams, SetLanternInstructorKeyBody, ReviewLanternWrittenAnswerParams,
  ReviewLanternWrittenAnswerBody, AdjustLanternScoreBody,
  GetLanternWrittenHistoryParams, GetLanternWrittenHistoryResponse,
} from "@workspace/api-zod";
import { ClassroomError, requireInstructor } from "../lib/instructor-access";
import { lanternAnswerGuide } from "../lib/lantern-answer-guide";
import { evaluateLantern, flagFormatValid, hasLanternResponse, lanternQuestions, missionFlagIds, publicLanternActivity } from "../lib/lantern-activity";
import { changeLantern, getLanternRow, lanternProgress, loadLanternKeys, type LanternRow } from "../lib/lantern-progress";
import { requireWrittenApproval, reviewLanternResponse, sameLanternResponse } from "../lib/lantern-review";
import { getLanternHistory } from "../lib/lantern-history";
import { completionPercentage, createSharedTeam } from "../lib/classroom-teams";

const router: IRouter = Router();
function input<T>(schema: { parse: (data: unknown) => T }, data: unknown) {
  try { return schema.parse(data); }
  catch { throw new ClassroomError(400, "Invalid request. Check the required fields, email addresses and response limits."); }
}
const session = (params: unknown) => input(GetLanternProgressParams, params).sessionId;
function unlocked(row: LanternRow, keys: Map<number, string[]>, mission: number) {
  if (mission > lanternProgress(row, keys).unlockedMission) throw new ClassroomError(403, "Capture the previous mission flag to unlock this mission.");
}
router.get("/lantern/activity", async (_req, res) => {
  res.json(publicLanternActivity(await loadLanternKeys()));
});
router.post("/lantern/progress", async (req, res) => {
  const body = input(CreateLanternProgressBody, req.body);
  if (!body.roeAcknowledged || !body.name.trim()) throw new ClassroomError(400, "Enter your name and acknowledge the classroom rules of engagement.");
  const row = await createSharedTeam("lantern", body);
  res.json(lanternProgress(row, await loadLanternKeys()));
});
router.get("/lantern/progress/:sessionId", async (req, res) => {
  res.json(lanternProgress(await getLanternRow(session(req.params)), await loadLanternKeys()));
});
router.put("/lantern/progress/:sessionId/answers/:questionId", async (req, res) => {
  const { sessionId, questionId } = input(SaveLanternAnswerParams, req.params);
  const { value } = input(SaveLanternAnswerBody, req.body);
  const question = lanternQuestions.find(q => q.id === questionId);
  if (!question) throw new ClassroomError(404, "Question not found.");
  if ((question.kind === "multiple") !== Array.isArray(value) || (typeof value === "string" && value.length > 24000) || (Array.isArray(value) && (value.length > 20 || value.some(v => v.length > 1000)))) {
    throw new ClassroomError(400, "Use the question’s expected response type and keep responses below 24,000 characters.");
  }
  let grade!: ReturnType<typeof evaluateLantern>;
  const progress = await changeLantern(sessionId, async (row, keys, record) => {
    unlocked(row, keys, question.section);
    requireWrittenApproval(row, questionId);
    grade = evaluateLantern(question, value, keys, row.team_number, row.authorization_granted, row.answers);
    const previous = row.answers[String(questionId)];
    const sameResponse = previous && (question.manualReview ? sameLanternResponse(previous.value, value) : JSON.stringify(previous.value) === JSON.stringify(value));
    if (question.manualReview && previous?.reviewStatus === "denied" && sameResponse) {
      throw new ClassroomError(409, "Revise your denied response before resubmitting. An unchanged response cannot be approved.");
    }
    if (sameResponse) return;
    row.answers[String(questionId)] = {
      value, correct: grade.correct, earnedPoints: grade.earnedPoints, status: grade.status,
      updatedAt: new Date(Math.max(Date.now(), previous ? new Date(previous.updatedAt).getTime() + 1 : 0)),
      instructorPoints: sameResponse ? previous.instructorPoints : null,
      instructorNote: sameResponse ? previous.instructorNote : null,
      ...(question.manualReview ? { reviewStatus: sameResponse ? previous.reviewStatus ?? "pending" : "pending" as const } : {}),
    };
    if (!sameResponse) row.submitted_at = null;
    if (question.manualReview) await record(questionId, "submitted");
  });
  const saved = progress.answers[String(questionId)];
  res.json({ questionId, ...grade, correct: saved.correct, status: saved.status, earnedPoints: saved.earnedPoints, totalPoints: progress.totalPoints });
});
router.post("/lantern/progress/:sessionId/submit", async (req, res) => {
  const progress = await changeLantern(session(req.params), (row, keys) => {
    const current = lanternProgress(row, keys);
    if (current.reviewGateQuestionId !== null) throw new ClassroomError(409, "Every written response must be approved before you can submit final results.");
    if (completionPercentage(current.answers, lanternQuestions.map(q => q.id)) !== 100) {
      throw new ClassroomError(409, `Save all ${lanternQuestions.length} responses and capture all six flags before submitting your final results.`);
    }
    row.submitted_at = new Date();
  });
  res.json(progress);
});
router.post("/lantern/progress/:sessionId/hints/:missionId", async (req, res) => {
  const { sessionId, missionId } = input(UseLanternHintParams, req.params);
  res.json(await changeLantern(sessionId, (row, keys) => {
    unlocked(row, keys, missionId);
    const hintId = missionId + 100;
    if (row.hints.includes(hintId)) return;
    if (row.hints.filter(id => id >= 101 && id <= 106).length >= 3) throw new ClassroomError(409, "All three hint tokens have been used.");
    row.hints.push(hintId);
    row.submitted_at = null;
  }));
});
router.put("/lantern/progress/:sessionId/authorization", async () => {
  throw new ClassroomError(410, "Preservation is now knowledge-based. Answer the Mission 1 questions; a live preserved extraction and training authorization token are not required.");
});
router.post("/lantern/instructor/verify", (req, res) => {
  const { code } = input(VerifyLanternInstructorBody, req.body);
  requireInstructor(req, code);
  res.json({ valid: true });
});
router.use("/lantern/instructor", (req, _res, next) => {
  requireInstructor(req);
  next();
});
router.get("/lantern/instructor/answer-guide", async (_req, res) => {
  res.set("Cache-Control", "no-store").json(lanternAnswerGuide(await loadLanternKeys()));
});
router.get("/lantern/instructor/keys", async (_req, res) => {
  res.json([...await loadLanternKeys()].map(([questionId, acceptedAnswers]) => ({ questionId, acceptedAnswers })));
});
router.put("/lantern/instructor/keys/:questionId", async (req, res) => {
  const { questionId } = input(SetLanternInstructorKeyParams, req.params);
  const question = lanternQuestions.find(q => q.id === questionId);
  if (!question || question.keyMode !== "dataset") throw new ClassroomError(400, "Only shared-dataset answers can be configured.");
  const acceptedAnswers = input(SetLanternInstructorKeyBody, req.body).acceptedAnswers.map(value => value.trim());
  if (questionId !== 124 && acceptedAnswers.some(value => !value || !flagFormatValid(questionId, value))) throw new ClassroomError(400, `Use the required format: ${question.format || "exact artifact title"}.`);
  if (questionId === 124 && acceptedAnswers.some(value => !/^[A-Za-z0-9_-]+$/.test(value))) throw new ClassroomError(400, "For the final package, configure only the watchlist keyword—not a full TPL or a shared IMSI.");
  await pool.query("INSERT INTO lantern_keys(question_id,accepted_answers) VALUES($1,$2::jsonb) ON CONFLICT(question_id) DO UPDATE SET accepted_answers=excluded.accepted_answers", [questionId, JSON.stringify(acceptedAnswers)]);
  res.json({ questionId, acceptedAnswers });
});
router.get("/lantern/instructor/submissions", async (_req, res) => {
  const [result, keys] = await Promise.all([pool.query<LanternRow>("SELECT * FROM lantern_progress ORDER BY saved_at DESC"), loadLanternKeys()]);
  res.json(result.rows.map(row => {
    const p = lanternProgress(row, keys);
    const pendingWrittenReviewCount = lanternQuestions.filter(question => {
      const answer = p.answers[String(question.id)];
      return question.manualReview && answer && hasLanternResponse(answer.value) && answer.reviewStatus === "pending";
    }).length;
    return { sessionId: p.sessionId, name: p.name, email: p.email, totalPoints: p.totalPoints, answeredCount: p.answeredCount, savedAt: p.savedAt, submittedAt: p.submittedAt, teamNumber: p.teamNumber, unlockedMission: p.unlockedMission, authorizationRequested: !!p.authorizationNotes, authorizationGranted: p.authorizationGranted, pendingWrittenReviewCount };
  }));
});
router.get("/lantern/instructor/submissions/:sessionId", async (req, res) => {
  res.json(lanternProgress(await getLanternRow(session(req.params)), await loadLanternKeys()));
});
router.get("/lantern/instructor/submissions/:sessionId/history/:questionId", async (req, res) => {
  const { sessionId, questionId } = input(GetLanternWrittenHistoryParams, req.params);
    if (!lanternQuestions.find(q => q.id === questionId)?.manualReview && ![6, 7, 11, 17, 18].includes(questionId)) throw new ClassroomError(404, "Written question not found.");
  await getLanternRow(sessionId);
  res.json(GetLanternWrittenHistoryResponse.parse(await getLanternHistory(pool, sessionId, questionId)));
});
router.put("/lantern/instructor/submissions/:sessionId/review/:questionId", async (req, res) => {
  const { sessionId, questionId } = input(ReviewLanternWrittenAnswerParams, req.params);
  const { points, note, decision, responseUpdatedAt } = input(ReviewLanternWrittenAnswerBody, req.body);
  const question = lanternQuestions.find(q => q.id === questionId);
  if (!question?.manualReview) throw new ClassroomError(400, "Only non-choice responses require acceptance.");
  res.json(await changeLantern(sessionId, async (row, _keys, record) => {
    reviewLanternResponse(row, questionId, decision, question.points, note, responseUpdatedAt);
    await record(questionId, "reviewed");
  }));
});
router.put("/lantern/instructor/submissions/:sessionId/authorization", async () => {
  throw new ClassroomError(410, "Preservation is knowledge-based in Mission 1; authorization grants are retired.");
});
router.put("/lantern/instructor/submissions/:sessionId/adjustments", async (req, res) => {
  const { speedBonus, tradecraftBonus } = input(AdjustLanternScoreBody, req.body);
  res.json(await changeLantern(session(req.params), row => {
    row.speed_bonus = speedBonus;
    row.tradecraft_bonus = tradecraftBonus ? 5 : 0;
  }));
});
const handleError: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof ClassroomError) res.status(error.status).json({ error: error.message });
  else next(error);
};
router.use(handleError);
export default router;
