import { Router, type IRouter, type Request, type Response } from "express";
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
import { evaluate, isManual, publicActivity, type Question } from "../lib/ctf-activity";
import { loadQuestions, questionCatalog, saveQuestion, validateQuestion } from "../lib/ctf-question-authoring";

type Progress = ReturnType<typeof GetCtfProgressResponse.parse>;
type Answers = Progress["answers"];
interface ProgressRow {
  session_id: string; name: string; email: string; instructor_email: string;
  answers: Answers; saved_at: Date; submitted_at: Date | null;
}
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

async function loadKeys() {
  const result = await pool.query<{ question_id: number; accepted_answers: string[] }>("SELECT question_id, accepted_answers FROM ctf_keys");
  return new Map(result.rows.map(row => [row.question_id, row.accepted_answers]));
}

function toProgress(row: ProgressRow, keys: Map<number, string[]>, questions: Question[]) {
  const answers: Answers = {};
  for (const [id, answer] of Object.entries(row.answers || {})) {
    const question = questions.find(q => q.id === Number(id));
    if (!question) continue;
    const grade = evaluate(question, answer.value, keys);
    answers[id] = {
      ...answer, correct: grade.correct, status: grade.status,
      earnedPoints: isManual(question) && answer.instructorPoints != null ? Math.min(answer.instructorPoints, question.points) : grade.earnedPoints,
    };
  }
  return GetCtfProgressResponse.parse({
    sessionId: row.session_id, name: row.name, email: row.email, instructorEmail: row.instructor_email,
    answers, totalPoints: Object.values(answers).reduce((sum, answer) => sum + answer.earnedPoints, 0),
    answeredCount: Object.values(answers).filter(a => Array.isArray(a.value) ? a.value.length > 0 : !!a.value.trim()).length,
    savedAt: row.saved_at, submittedAt: row.submitted_at,
  });
}

router.get("/ctf/activity", async (_req, res): Promise<void> => {
  res.set("Cache-Control", "no-store").json(GetCtfActivityResponse.parse(publicActivity(await loadKeys(), await loadQuestions())));
});

router.post("/ctf/progress", async (req, res): Promise<void> => {
  const input = CreateCtfProgressBody.safeParse(req.body);
  if (!input.success || !input.data.name.trim()) { res.status(400).json({ error: "Enter your name, email and instructor email." }); return; }
  const data = input.data;
  const result = await pool.query<ProgressRow & { inserted: boolean }>(
    `INSERT INTO ctf_progress (session_id,name,email,instructor_email) VALUES ($1,$2,$3,$4)
     ON CONFLICT (session_id) DO UPDATE SET name=$2,email=$3,instructor_email=$4,saved_at=now()
     RETURNING *, (xmax = 0) AS inserted`,
    [data.sessionId, data.name.trim(), data.email.toLowerCase(), data.instructorEmail.toLowerCase()],
  );
  res.status(result.rows[0].inserted ? 201 : 200).json(toProgress(result.rows[0], await loadKeys(), await loadQuestions()));
});

router.get("/ctf/progress/:sessionId", async (req, res): Promise<void> => {
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
  const keys = await loadKeys();
  const grade = evaluate(question, value, keys);
  const answer = { value, correct: grade.correct, earnedPoints: grade.earnedPoints, status: grade.status, updatedAt: new Date().toISOString(), instructorPoints: null, instructorNote: null };
  const result = await pool.query<ProgressRow>(
    `UPDATE ctf_progress SET answers=jsonb_set(answers, ARRAY[$2::text], $3::jsonb, true), saved_at=now(), submitted_at=NULL WHERE session_id=$1 RETURNING *`,
    [params.data.sessionId, String(question.id), JSON.stringify(answer)],
  );
  if (!result.rows[0]) { res.status(404).json({ error: "Start the activity before saving answers." }); return; }
  res.json(SaveCtfAnswerResponse.parse({ questionId: question.id, ...grade, totalPoints: toProgress(result.rows[0], keys, questions).totalPoints }));
});

router.post("/ctf/progress/:sessionId/submit", async (req, res): Promise<void> => {
  const params = SubmitCtfProgressParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid private resume token." }); return; }
  const result = await pool.query<ProgressRow>("UPDATE ctf_progress SET submitted_at=now(),saved_at=now() WHERE session_id=$1 RETURNING *", [params.data.sessionId]);
  if (!result.rows[0]) { res.status(404).json({ error: "No progress found." }); return; }
  res.json(toProgress(result.rows[0], await loadKeys(), await loadQuestions()));
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
  const records = await pool.query<ProgressRow>("SELECT * FROM ctf_progress ORDER BY saved_at DESC LIMIT 1000");
  const keys = await loadKeys();
  const questions = await loadQuestions();
  res.set("Cache-Control", "no-store").json(ListCtfSubmissionsResponse.parse(records.rows.map(row => {
    const { sessionId, name, email, totalPoints, answeredCount, savedAt, submittedAt } = toProgress(row, keys, questions);
    return { sessionId, name, email, totalPoints, answeredCount, savedAt, submittedAt };
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
  const question = (await loadQuestions()).find(q => q.id === params.data.questionId);
  if (!question || !isManual(question) || input.data.points > question.points) { res.status(400).json({ error: "Manual points must be within this question's point value." }); return; }
  const result = await pool.query<ProgressRow>(
    `UPDATE ctf_progress SET answers=jsonb_set(jsonb_set(answers, ARRAY[$2::text,'instructorPoints'], $3::jsonb), ARRAY[$2::text,'instructorNote'], $4::jsonb),saved_at=now()
     WHERE session_id=$1 AND answers ? $2 RETURNING *`,
    [params.data.sessionId, String(question.id), JSON.stringify(input.data.points), JSON.stringify(input.data.note)],
  );
  if (!result.rows[0]) { res.status(404).json({ error: "No saved response exists for this question." }); return; }
  res.json(toProgress(result.rows[0], await loadKeys(), await loadQuestions()));
});

export default router;
