import { date, jsonb, pgTable, text, timestamp, integer, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ctfProgressTable = pgTable("ctf_progress", {
  sessionId: text("session_id").primaryKey(),
  // Compatibility columns are always blank; personal identities are not collected.
  name: text("name").notNull().default(""),
  email: text("email").notNull().default(""),
  instructorEmail: text("instructor_email").notNull().default(""),
  instructorName: text("instructor_name"),
  windowId: uuid("window_id"),
  teamNumber: integer("team_number"),
  teamName: text("team_name"),
  teamMembers: jsonb("team_members").$type<string[]>(),
  sessionDate: date("session_date", { mode: "string" }),
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
