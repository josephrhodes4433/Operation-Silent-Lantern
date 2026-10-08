import { pgTable, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Instructor definitions override the imported source; learner records are separate.
export const ctfQuestionsTable = pgTable("ctf_questions", {
  questionId: integer("question_id").primaryKey(),
  definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
});
export const insertCtfQuestionSchema = createInsertSchema(ctfQuestionsTable);
export type InsertCtfQuestion = z.infer<typeof insertCtfQuestionSchema>;
export type CtfQuestionRow = typeof ctfQuestionsTable.$inferSelect;
