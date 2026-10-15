import { jsonb, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ctfProgressTable = pgTable("ctf_progress", {
  sessionId: text("session_id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  instructorEmail: text("instructor_email").notNull(),
  teamNumber: integer("team_number"),
  answers: jsonb("answers").notNull().default({}),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
});

export const ctfKeysTable = pgTable("ctf_keys", {
  questionId: integer("question_id").primaryKey(),
  acceptedAnswers: jsonb("accepted_answers").$type<string[]>().notNull(),
});

export const insertCtfProgressSchema = createInsertSchema(ctfProgressTable).omit({ savedAt: true, submittedAt: true });
export type InsertCtfProgress = z.infer<typeof insertCtfProgressSchema>;
export type CtfProgressRow = typeof ctfProgressTable.$inferSelect;
