import { pool } from "@workspace/db";
import { SetCtfInstructorQuestionBody, GetCtfInstructorQuestionsResponse } from "@workspace/api-zod";
import { mergeQuestions, sectionForFlag, validationMode, type Question } from "./ctf-activity";

type Input = ReturnType<typeof SetCtfInstructorQuestionBody.parse>;

export function validateQuestion(input: Input): string | null {
  if (!input.prompt.trim()) return "Enter the question prompt from the activity packet.";
  const choice = input.kind === "single" || input.kind === "multiple";
  if (choice && (input.options.length < 2 || input.options.some(s => !s.trim()) || new Set(input.options.map(s => s.trim())).size !== input.options.length))
    return "Choice questions need at least two distinct, nonblank options.";
  if (!choice && input.options.length) return "Only choice questions may have options.";
  if (input.kind === "long" && input.validationMode !== "manual") return "Long written responses require manual review.";
  if (input.validationMode === "numeric" && input.kind !== "number") return "Numeric validation requires a number question.";
  if (input.kind === "number" && !["numeric", "dataset", "manual"].includes(input.validationMode)) return "Number questions require numeric, dataset or manual validation.";
  if (input.validationMode === "manual" && input.acceptedAnswers.length) return "Manual questions must not contain automatic accepted answers.";
  if (!["manual", "dataset"].includes(input.validationMode) && !input.acceptedAnswers.length) return "Automatic validation requires accepted answers.";
  if (input.acceptedAnswers.some(s => !s.trim())) return "Accepted answers must not be blank.";
  if (choice && input.acceptedAnswers.some(s => !input.options.map(o => o.trim()).includes(s.trim()))) return "Accepted choice answers must match the supplied options.";
  if (input.kind === "single" && input.validationMode !== "manual" && input.acceptedAnswers.length > 1) return "A single-choice question must have one accepted option.";
  if (input.kind === "number" && input.acceptedAnswers.some(s => !Number.isFinite(Number(s.trim().replace(/,/g, ""))))) return "Accepted number answers must be valid numbers.";
  if (new Set(input.acceptedAnswers.map(s => s.trim())).size !== input.acceptedAnswers.length) return "Accepted answers must be distinct.";
  return null;
}

export async function loadQuestions(): Promise<Question[]> {
  const result = await pool.query<{ question_id: number; definition: Input }>("SELECT question_id, definition FROM ctf_questions");
  return mergeQuestions(result.rows.map(row => ({
    ...row.definition, id: row.question_id, ...sectionForFlag(row.question_id),
    category: row.definition.validationMode === "dataset" ? "dataset" : row.definition.validationMode === "manual" ? "manual" : "auto",
  })));
}

export function privateQuestion(q: Question, keys: Map<number, string[]>) {
  return {
    id: q.id, section: q.section, sectionTitle: q.sectionTitle,
    prompt: q.prompt, kind: q.kind, options: q.options, points: q.points,
    guideReference: q.guideReference, validationMethod: q.validationMethod,
    validationMode: validationMode(q),
    acceptedAnswers: q.category === "dataset" ? keys.get(q.id) ?? [] : q.acceptedAnswers,
  };
}

export function questionCatalog(questions: Question[], keys: Map<number, string[]>) {
  const ids = new Set(questions.map(q => q.id));
  return GetCtfInstructorQuestionsResponse.parse({
    questions: questions.map(q => privateQuestion(q, keys)),
    missingIds: Array.from({ length: 120 }, (_, i) => i + 1).filter(id => !ids.has(id)),
  });
}

export async function saveQuestion(id: number, input: Input) {
  const definition = {
    ...input, prompt: input.prompt.trim(),
    options: input.options.map(s => s.trim()),
    acceptedAnswers: input.acceptedAnswers.map(s => s.trim()),
  };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO ctf_questions (question_id, definition) VALUES ($1,$2::jsonb) ON CONFLICT (question_id) DO UPDATE SET definition=$2::jsonb",
      [id, JSON.stringify(definition)],
    );
    if (input.validationMode === "dataset") {
      await client.query("INSERT INTO ctf_keys (question_id,accepted_answers) VALUES ($1,$2::jsonb) ON CONFLICT (question_id) DO UPDATE SET accepted_answers=$2::jsonb", [id, JSON.stringify(definition.acceptedAnswers)]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { ...definition, id, ...sectionForFlag(id) };
}
