import { Router, type IRouter, type ErrorRequestHandler } from "express";
import { pool } from "@workspace/db";
import {
  CreateLanternProgressBody, GetLanternProgressParams, SaveLanternAnswerBody, SaveLanternAnswerParams,
  UseLanternHintParams, RequestLanternAuthorizationBody, VerifyLanternInstructorBody,
  SetLanternInstructorKeyParams, SetLanternInstructorKeyBody, ReviewLanternWrittenAnswerParams,
  ReviewLanternWrittenAnswerBody, GrantLanternAuthorizationBody, AdjustLanternScoreBody,
} from "@workspace/api-zod";
import { ClassroomError, requireInstructor } from "../lib/instructor-access";
import { evaluateLantern, flagFormatValid, hasLanternResponse, lanternQuestions, missionFlagIds, publicLanternActivity } from "../lib/lantern-activity";
import { changeLantern, getLanternRow, lanternProgress, loadLanternKeys, type LanternRow } from "../lib/lantern-progress";
import { requireWrittenApproval, reviewLanternResponse, sameLanternResponse } from "../lib/lantern-review";

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
  // Never overwrite a saved team from a repeated create request or a known token.
  const result = await pool.query<LanternRow>(
    `INSERT INTO lantern_progress(session_id,name,email,instructor_email,team_number)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT(session_id) DO NOTHING RETURNING *`,
    [body.sessionId, body.name.trim(), body.email.trim(), body.instructorEmail.trim(), body.teamNumber],
  );
  const row = result.rows[0] ?? await getLanternRow(body.sessionId);
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
  const progress = await changeLantern(sessionId, (row, keys) => {
    unlocked(row, keys, question.section);
    requireWrittenApproval(row, questionId);
    if ((question.id === 14 || question.id === 15) && !row.authorization_granted) throw new ClassroomError(403, "Your instructor must authorize the preserved iOS workflow before this response.");
    grade = evaluateLantern(question, value, keys, row.team_number, row.authorization_granted);
    if (question.id === 16 && grade.correct && typeof value === "string") {
      const alias = String(row.answers["5"]?.value ?? "").split(":")[1];
      const imsi = String(row.answers["10"]?.value ?? "").split(":")[1];
      const parts = value.trim().split(":")[1].split("-");
      if (!alias || !imsi || parts[0].toLowerCase() !== alias.toLowerCase() || parts[1] !== imsi.slice(-4)) {
        grade = { correct: false, status: "incorrect", earnedPoints: 0, feedback: "The target package must corroborate your captured courier alias and the last four digits of the SIM IMSI." };
      }
    }
    const previous = row.answers[String(questionId)];
    const sameResponse = previous && (question.manualReview ? sameLanternResponse(previous.value, value) : JSON.stringify(previous.value) === JSON.stringify(value));
    if (question.manualReview && previous?.reviewStatus === "denied" && sameResponse) {
      throw new ClassroomError(409, "Revise your denied response before resubmitting. An unchanged response cannot be approved.");
    }
    row.answers[String(questionId)] = {
      value, correct: grade.correct, earnedPoints: grade.earnedPoints, status: grade.status, updatedAt: new Date(),
      instructorPoints: sameResponse ? previous.instructorPoints : null,
      instructorNote: sameResponse ? previous.instructorNote : null,
      ...(question.manualReview ? { reviewStatus: sameResponse ? previous.reviewStatus ?? "pending" : "pending" as const } : {}),
    };
    if (!sameResponse) row.submitted_at = null;
  });
  const saved = progress.answers[String(questionId)];
  res.json({ questionId, ...grade, correct: saved.correct, status: saved.status, earnedPoints: saved.earnedPoints, totalPoints: progress.totalPoints });
});
router.post("/lantern/progress/:sessionId/submit", async (req, res) => {
  const progress = await changeLantern(session(req.params), (row, keys) => {
    const current = lanternProgress(row, keys);
    if (current.reviewGateQuestionId !== null) throw new ClassroomError(409, "Every written response must be approved before you can submit final results.");
    if (current.answeredCount !== lanternQuestions.length || missionFlagIds.some(id => current.answers[String(id)]?.correct !== true)) {
      throw new ClassroomError(409, "Save all 18 responses and capture all six flags before submitting your final results.");
    }
    row.submitted_at = new Date();
  });
  res.json(progress);
});
router.post("/lantern/progress/:sessionId/hints/:missionId", async (req, res) => {
  const { sessionId, missionId } = input(UseLanternHintParams, req.params);
  res.json(await changeLantern(sessionId, (row, keys) => {
    unlocked(row, keys, missionId);
    if (row.hints.includes(missionId)) return;
    if (row.hints.length >= 3) throw new ClassroomError(409, "All three hint tokens have been used.");
    row.hints.push(missionId);
    row.submitted_at = null;
  }));
});
router.put("/lantern/progress/:sessionId/authorization", async (req, res) => {
  const { notes } = input(RequestLanternAuthorizationBody, req.body);
  if (!notes.trim()) throw new ClassroomError(400, "Document your preserved handling and why restricted handling is required.");
  res.json(await changeLantern(session(req.params), (row, keys) => {
    unlocked(row, keys, 5);
    if (row.authorization_granted && row.authorization_notes !== notes.trim()) {
      throw new ClassroomError(409, "Authorization notes are locked after instructor approval. Ask your instructor to revoke approval before revising them.");
    }
    row.authorization_notes = notes.trim();
    row.submitted_at = null;
  }));
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
router.get("/lantern/instructor/keys", async (_req, res) => {
  res.json([...await loadLanternKeys()].map(([questionId, acceptedAnswers]) => ({ questionId, acceptedAnswers })));
});
router.put("/lantern/instructor/keys/:questionId", async (req, res) => {
  const { questionId } = input(SetLanternInstructorKeyParams, req.params);
  const question = lanternQuestions.find(q => q.id === questionId);
  if (!question || question.keyMode !== "dataset") throw new ClassroomError(400, "Only shared-dataset answers can be configured.");
  const acceptedAnswers = input(SetLanternInstructorKeyBody, req.body).acceptedAnswers.map(value => value.trim());
  if (acceptedAnswers.some(value => !value || !flagFormatValid(questionId, value))) throw new ClassroomError(400, `Use the required format: ${question.format || "exact artifact title"}.`);
  if (questionId === 14 && acceptedAnswers.some(value => value === process.env.CTF_INSTRUCTOR_CODE || value.slice(5) === process.env.CTF_INSTRUCTOR_CODE)) {
    throw new ClassroomError(400, "The training AUTH token must be separate from the private instructor access code.");
  }
  await pool.query("INSERT INTO lantern_keys(question_id,accepted_answers) VALUES($1,$2::jsonb) ON CONFLICT(question_id) DO UPDATE SET accepted_answers=excluded.accepted_answers", [questionId, JSON.stringify(acceptedAnswers)]);
  res.json({ questionId, acceptedAnswers });
});
router.get("/lantern/instructor/submissions", async (_req, res) => {
  const [result, keys] = await Promise.all([pool.query<LanternRow>("SELECT * FROM lantern_progress ORDER BY saved_at DESC"), loadLanternKeys()]);
  res.json(result.rows.map(row => {
    const p = lanternProgress(row, keys);
    return { sessionId: p.sessionId, name: p.name, email: p.email, totalPoints: p.totalPoints, answeredCount: p.answeredCount, savedAt: p.savedAt, submittedAt: p.submittedAt, teamNumber: p.teamNumber, unlockedMission: p.unlockedMission, authorizationRequested: !!p.authorizationNotes, authorizationGranted: p.authorizationGranted };
  }));
});
router.get("/lantern/instructor/submissions/:sessionId", async (req, res) => {
  res.json(lanternProgress(await getLanternRow(session(req.params)), await loadLanternKeys()));
});
router.put("/lantern/instructor/submissions/:sessionId/review/:questionId", async (req, res) => {
  const { sessionId, questionId } = input(ReviewLanternWrittenAnswerParams, req.params);
  const { points, note, decision, responseUpdatedAt } = input(ReviewLanternWrittenAnswerBody, req.body);
  const question = lanternQuestions.find(q => q.id === questionId);
  if (!question?.manualReview || points > question.points) throw new ClassroomError(400, "Only written responses can be reviewed, within the question’s point limit.");
  res.json(await changeLantern(sessionId, row => reviewLanternResponse(row, questionId, decision, points, note, responseUpdatedAt)));
});
router.put("/lantern/instructor/submissions/:sessionId/authorization", async (req, res) => {
  const { granted } = input(GrantLanternAuthorizationBody, req.body);
  res.json(await changeLantern(session(req.params), (row, keys) => {
    if (granted) {
      unlocked(row, keys, 5);
      if (!row.authorization_notes.trim()) throw new ClassroomError(409, "Review saved preserved handling notes before granting authorization.");
      if (!keys.get(14)?.length) throw new ClassroomError(409, "Configure the separate training AUTH token in the dataset answer keys first.");
    }
    row.authorization_granted = granted;
    if (!granted) row.submitted_at = null;
  }));
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
