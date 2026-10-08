import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export class ClassroomError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const failedAttempts = new Map<string, { count: number; until: number }>();
export function requireInstructor(req: Request, supplied?: string) {
  const expected = process.env.CTF_INSTRUCTOR_CODE;
  if (!expected) throw new ClassroomError(503, "Instructor access is not configured.");
  const ip = req.ip ?? "unknown";
  const entry = failedAttempts.get(ip);
  if (entry && entry.until > Date.now() && entry.count >= 10) throw new ClassroomError(429, "Too many unsuccessful attempts. Wait one minute.");
  const provided = Buffer.from(supplied ?? req.get("x-instructor-code") ?? "");
  const configured = Buffer.from(expected);
  if (provided.length !== configured.length || !timingSafeEqual(provided, configured)) {
    failedAttempts.set(ip, { count: entry && entry.until > Date.now() ? entry.count + 1 : 1, until: Date.now() + 60000 });
    throw new ClassroomError(401, "Instructor access denied.");
  }
  failedAttempts.delete(ip);
}
