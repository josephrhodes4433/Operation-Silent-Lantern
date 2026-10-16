import { Router, type IRouter, type Request, type Response, type ErrorRequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";
import {
  GetCtfActivityResponse, CreateCtfProgressBody, GetCtfProgressParams, GetCtfProgressResponse,
  SaveCtfAnswerParams, SaveCtfAnswerBody, SaveCtfAnswerResponse, SubmitCtfProgressParams,
  VerifyCtfInstructorBody, SetCtfInstructorKeyParams, SetCtfInstructorKeyBody,
  GetCtfInstructorSubmissionParams, ReviewCtfWrittenAnswerParams, ReviewCtfWrittenAnswerBody,
  GetCtfInstructorKeysResponse, ListCtfSubmissionsResponse,
  SetCtfInstructorQuestionParams, SetCtfInstructorQuestionBody, SetCtfInstructorQuestionResponse,
} from "@workspace/api-zod";
import { evaluate, isManual, requiresReview, publicActivity, validationMode } from "../lib/ctf-activity";
import { loadQuestions, questionCatalog, saveQuestion, validateQuestion } from "../lib/ctf-question-authoring";
import { ironAnswerGuide } from "../lib/iron-answer-guide";
import { loadKeys, toProgress, changeIron, type ProgressRow } from "../lib/iron-progress";
import { assertAnonymousCheckIn, bootstrapTeams, completionPercentage, createSharedTeam, hasResponse, sameResponse } from "../lib/classroom-teams";
import { ClassroomError } from "../lib/instructor-access";
const router: IRouter = Router();
const attempts = new Map<string, { count: number; until: number }>();

// This is an administrative API access key, not a learner account system.
// It fails closed until the project owner configures the key in Secrets.
function instructorAllowed(req: Request, res: Response, supplied?: string) {
  const expected = process.env.CTF_INSTRUCTOR_CODE;
  if (!expected) {
    res.status(503).json({ error: "Instructor access is not configured. The project owner must add CTF_INSTRUCTOR_CODE in project Secrets." });
    return false;
  }
  const ip = req.ip || "unknown";
  const attempt = attempts.get(ip);
  if (attempt && attempt.until > Date.now() && attempt.count >= 10) {
    res.status(429).json({ error: "Too many unsuccessful attempts. Please wait one minute." });
    return false;
  }
  const code = supplied ?? req.get("x-instructor-code") ?? "";
  const a = Buffer.from(code);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    attempts.set(ip, { count: attempt && attempt.until > Date.now() ? attempt.count + 1 : 1, until: Date.now() + 60000 });
    res.status(401).json({ error: "Instructor access denied." });
    return false;
  }
  attempts.delete(ip);
  return true;
}

router.get("/ctf/activity", async (_req, res): Promise<void> => {
  res.set("Cache-Control", "no-store").json(GetCtfActivityResponse.parse(publicActivity(await loadKeys(), await loadQuestions())));
});

router.post("/ctf/progress", async (req, res): Promise<void> => {
  assertAnonymousCheckIn(req.body);
  const input = CreateCtfProgressBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Enter a non-identifying team name and instructor name." }); return; }
  const row = await createSharedTeam("ctf", input.data);
  res.json(toProgress(row, await loadKeys(), await loadQuestions()));
});

router.get("/ctf/progress/:sessionId", async (req, res): Promise<void> => {
  await bootstrapTeams("ctf");
  const params = GetCtfProgressParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid private resume token." }); return; }
  const result = await pool.query<ProgressRow>("SELECT * FROM ctf_progress WHERE session_id=$1", [params.data.sessionId]);
  if (!result.rows[0]) { res.status(404).json({ error: "No saved progress found." }); return; }
  res.set("Cache-Control", "no-store").json(toProgress(result.rows[0], await loadKeys(), await loadQuestions()));
});

router.put("/ctf/progress/:sessionId/answers/:questionId", async (req, res): Promise<void> => {
  const params = SaveCtfAnswerParams.safeParse(req.params);
  const input = SaveCtfAnswerBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Invalid answer." }); return; }
  const questions = await loadQuestions();
  const question = questions.find(q => q.id === params.data.questionId);
  if (!question) { res.status(404).json({ error: "This question is not present in the supplied activity document." }); return; }
  const value = input.data.value;
  if ((Array.isArray(value) && (value.length > 20 || value.some(v => v.length > 2000))) || (typeof value === "string" && value.length > 12000)) {
    res.status(400).json({ error: "Response is too long." }); return;
  }
  if (question.id === 120 && typeof value === "string" && value.trim().split(/\s+/).filter(Boolean).length > 300) {
    res.status(400).json({ error: "The final PIR response must be no more than 300 words." }); return;
  }
  if (question.kind === "multiple" && !Array.isArray(value)) { res.status(400).json({ error: "Select the answer options." }); return; }
  if (question.kind !== "multiple" && typeof value !== "string") { res.status(400).json({ error: "Enter one response." }); return; }
  const progress = await changeIron(params.data.sessionId, (row, keys) => {
    const previous = row.answers[String(question.id)];
    const same = previous && sameResponse(previous.value, value);
    if (requiresReview(question, keys) && previous?.reviewStatus === "denied" && same) throw new ClassroomError(409, "Revise the denied response before resubmitting it.");
    if (same) return;
    row.answers[String(question.id)] = {
      value, ...evaluate(question, value, keys),
      updatedAt: new Date(Math.max(Date.now(), previous ? new Date(previous.updatedAt).getTime() + 1 : 0)),
      instructorPoints: null, instructorNote: null,
      ...(requiresReview(question, keys) ? { reviewStatus: "pending" as const } : {}),
    };
    row.submitted_at = null;
  });
  const answer = progress.answers[String(question.id)];
  res.json(SaveCtfAnswerResponse.parse({ questionId: question.id, ...answer, feedback: answer.feedback ?? "Saved.", totalPoints: progress.totalPoints }));
});

router.post("/ctf/progress/:sessionId/submit", async (req, res): Promise<void> => {
  const params = SubmitCtfProgressParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid private resume token." }); return; }
  res.json(await changeIron(params.data.sessionId, (row, keys, questions) => {
    const current = toProgress(row, keys, questions);
    if (completionPercentage(current.answers, questions.map(q => q.id)) !== 100) throw new ClassroomError(409, "Complete every choice correctly and obtain instructor acceptance of every non-choice response before submitting.");
    row.submitted_at = new Date();
  }));
});

router.get("/ctf/instructor/answer-guide", async (req, res): Promise<void> => {
  if (!instructorAllowed(req, res)) return;
  res.set("Cache-Control", "no-store").json(ironAnswerGuide(await loadQuestions(), await loadKeys()));
});

router.get("/ctf/instructor/questions", async (req, res): Promise<void> => {
  if (!instructorAllowed(req, res)) return;
  res.set("Cache-Control", "no-store").json(questionCatalog(await loadQuestions(), await loadKeys()));
});

router.put("/ctf/instructor/questions/:questionId", async (req, res): Promise<void> => {
  if (!instructorAllowed(req, res)) return;
  const params = SetCtfInstructorQuestionParams.safeParse(req.params);
  const input = SetCtfInstructorQuestionBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Invalid question fields. Check the prompt, options, points and validation mode." }); return; }
  const error = validateQuestion(input.data);
  if (error) { res.status(400).json({ error }); return; }
  res.set("Cache-Control", "no-store").json(SetCtfInstructorQuestionResponse.parse(await saveQuestion(params.data.questionId, input.data)));
});

router.post("/ctf/instructor/verify", async (req, res): Promise<void> => {
  const input = VerifyCtfInstructorBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Enter the instructor access code." }); return; }
  if (!instructorAllowed(req, res, input.data.code)) return;
  res.json({ valid: true });
});

router.get("/ctf/instructor/keys", async (req, res): Promise<void> => {
  if (!instructorAllowed(req, res)) return;
  const keys = await loadKeys();
  res.set("Cache-Control", "no-store").json(GetCtfInstructorKeysResponse.parse([...keys].map(([questionId, acceptedAnswers]) => ({ questionId, acceptedAnswers }))));
});

router.put("/ctf/instructor/keys/:questionId", async (req, res): Promise<void> => {
  if (!instructorAllowed(req, res)) return;
  const params = SetCtfInstructorKeyParams.safeParse(req.params);
  const input = SetCtfInstructorKeyBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Enter at least one accepted answer." }); return; }
  const question = (await loadQuestions()).find(q => q.id === params.data.questionId);
  if (!question || question.category !== "dataset" || isManual(question)) { res.status(400).json({ error: "Only shared dataset-dependent keys can be configured. Student-specific tasks require manual review." }); return; }
  const acceptedAnswers = input.data.acceptedAnswers.map(a => a.trim()).filter(Boolean);
  if (!acceptedAnswers.length || acceptedAnswers.length > 50 || acceptedAnswers.some(a => a.length > 12000)) { res.status(400).json({ error: "Enter a valid accepted answer." }); return; }
  // Match numeric grading, including comma-formatted values. Validate the whole
  // edit before either write path so an invalid alternative cannot replace a key.
  if ((question.kind === "number" || validationMode(question) === "numeric") &&
      acceptedAnswers.some(a => !Number.isFinite(Number(a.replace(/,/g, ""))))) {
    res.status(400).json({ error: "Every accepted answer must be a finite number (for example, 1234 or 1,234). NaN, Infinity and non-numeric text are not allowed. No keys were changed." }); return;
  }
  if (input.data.onlyIfUnset) {
    if (!question.facilitatorAnswers || JSON.stringify(acceptedAnswers) !== JSON.stringify(question.facilitatorAnswers)) {
      res.status(409).json({ error: "This question or guide reference changed. Refresh and review its current key before saving." }); return;
    }
    const inserted = await pool.query<{ accepted_answers: string[] }>(
      "INSERT INTO ctf_keys (question_id,accepted_answers) VALUES ($1,$2::jsonb) ON CONFLICT (question_id) DO UPDATE SET accepted_answers=EXCLUDED.accepted_answers WHERE ctf_keys.accepted_answers='[]'::jsonb RETURNING accepted_answers",
      [question.id, JSON.stringify(acceptedAnswers)],
    );
    const current = inserted.rows[0] ?? (await pool.query<{ accepted_answers: string[] }>("SELECT accepted_answers FROM ctf_keys WHERE question_id=$1", [question.id])).rows[0];
    res.json({ questionId: question.id, acceptedAnswers: current.accepted_answers });
    return;
  }
  await pool.query("INSERT INTO ctf_keys (question_id,accepted_answers) VALUES ($1,$2::jsonb) ON CONFLICT (question_id) DO UPDATE SET accepted_answers=$2::jsonb", [question.id, JSON.stringify(acceptedAnswers)]);
  res.json({ questionId: question.id, acceptedAnswers });
});

router.get("/ctf/instructor/submissions", async (req, res): Promise<void> => {
  if (!instructorAllowed(req, res)) return;
  await bootstrapTeams("ctf");
  const records = await pool.query<ProgressRow>("SELECT * FROM ctf_progress ORDER BY saved_at DESC,session_id");
  const keys = await loadKeys();
  const questions = await loadQuestions();
  res.set("Cache-Control", "no-store").json(ListCtfSubmissionsResponse.parse(records.rows.map(row => {
    const { sessionId, instructorName, windowId, teamNumber, teamName, sessionDate, totalPoints, answeredCount, savedAt, submittedAt } = toProgress(row, keys, questions);
    return { sessionId, instructorName, windowId, teamNumber, teamName, sessionDate, totalPoints, answeredCount, savedAt, submittedAt };
  })));
});

router.get("/ctf/instructor/submissions/:sessionId", async (req, res): Promise<void> => {
  if (!instructorAllowed(req, res)) return;
  const params = GetCtfInstructorSubmissionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid submission." }); return; }
  const record = await pool.query<ProgressRow>("SELECT * FROM ctf_progress WHERE session_id=$1", [params.data.sessionId]);
  if (!record.rows[0]) { res.status(404).json({ error: "Submission not found." }); return; }
  res.set("Cache-Control", "no-store").json(toProgress(record.rows[0], await loadKeys(), await loadQuestions()));
});

router.put("/ctf/instructor/submissions/:sessionId/review/:questionId", async (req, res): Promise<void> => {
  if (!instructorAllowed(req, res)) return;
  const params = ReviewCtfWrittenAnswerParams.safeParse(req.params);
  const input = ReviewCtfWrittenAnswerBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Invalid review." }); return; }
  res.json(await changeIron(params.data.sessionId, (row, keys, questions) => {
    const question = questions.find(q => q.id === params.data.questionId);
    if (!question || !requiresReview(question, keys)) throw new ClassroomError(400, "Only non-choice responses require acceptance.");
    const answer = row.answers[String(question.id)];
    if (!answer || !hasResponse(answer.value)) throw new ClassroomError(409, "There is no submitted response to review.");
    if (new Date(answer.updatedAt).getTime() !== new Date(input.data.responseUpdatedAt).getTime()) throw new ClassroomError(409, "The team changed this response. Refresh and review the latest version.");
    const { decision } = input.data;
    const note = decision === "approved" ? "" : (input.data.note ?? "").trim();
    if (decision !== "approved" && !note) throw new ClassroomError(400, "Feedback is required for this decision.");
    if (answer.reviewStatus === "denied" && decision !== "denied") throw new ClassroomError(409, "The team must revise its denied response before it can be accepted.");
    answer.reviewStatus = decision === "denied" ? "denied" : "approved";
    answer.instructorPoints = decision === "denied" ? 0 : question.points;
    answer.instructorNote = note;
  }, true));
});

router.use(((err, _req, res, next) => {
  if (err instanceof ClassroomError) res.status(err.status).json({ error: err.message });
  else next(err);
}) as ErrorRequestHandler);
export default router;
