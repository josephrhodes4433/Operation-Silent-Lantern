import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const lanternProgressTable = pgTable("lantern_progress", {
  sessionId: text("session_id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  instructorEmail: text("instructor_email").notNull(),
  teamNumber: integer("team_number").notNull(),
  teamName: text("team_name"),
  answers: jsonb("answers").notNull().default({}),
  authorizationNotes: text("authorization_notes").notNull().default(""),
  authorizationGranted: boolean("authorization_granted").notNull().default(false),
  hints: jsonb("hints").$type<number[]>().notNull().default([]),
  speedBonus: integer("speed_bonus").notNull().default(0),
  tradecraftBonus: integer("tradecraft_bonus").notNull().default(0),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
});
export const lanternKeysTable = pgTable("lantern_keys", {
  questionId: integer("question_id").primaryKey(),
  acceptedAnswers: jsonb("accepted_answers").$type<string[]>().notNull(),
});

export const lanternWrittenHistoryTable = pgTable("lantern_written_history", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => lanternProgressTable.sessionId),
  questionId: integer("question_id").notNull(),
  version: integer("version").notNull(),
  event: text("event").$type<"submitted" | "reviewed" | "imported">().notNull(),
  value: text("value").notNull(),
  decision: text("decision").$type<"pending" | "approved" | "denied">().notNull(),
  feedback: text("feedback"),
  points: integer("points"),
  responseUpdatedAt: timestamp("response_updated_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("lantern_written_history_question_idx").on(table.sessionId, table.questionId, table.id)]);
