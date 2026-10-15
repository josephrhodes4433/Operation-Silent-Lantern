import { integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const classroomTeamsTable = pgTable("classroom_teams", {
  activity: text("activity").notNull(),
  teamNumber: integer("team_number").notNull(),
  sessionId: text("session_id").notNull(),
}, t => [primaryKey({ columns: [t.activity, t.teamNumber] }), uniqueIndex("classroom_team_session_idx").on(t.activity, t.sessionId)]);

export const classroomNotificationsTable = pgTable("classroom_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  activity: text("activity").notNull(),
  sessionId: text("session_id").notNull(),
  teamNumber: integer("team_number").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
}, t => [uniqueIndex("classroom_completion_once_idx").on(t.activity, t.sessionId)]);
