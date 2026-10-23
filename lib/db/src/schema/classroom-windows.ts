import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const classroomWindowsTable = pgTable("classroom_windows", {
  id: uuid("id").primaryKey().defaultRandom(),
  activity: text("activity").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, t => [uniqueIndex("classroom_current_window_idx").on(t.activity).where(sql`${t.closedAt} IS NULL`)]);
