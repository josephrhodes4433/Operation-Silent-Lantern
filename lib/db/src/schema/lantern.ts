import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const lanternProgressTable = pgTable("lantern_progress", {
  sessionId: text("session_id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  instructorEmail: text("instructor_email").notNull(),
  teamNumber: integer("team_number").notNull(),
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
