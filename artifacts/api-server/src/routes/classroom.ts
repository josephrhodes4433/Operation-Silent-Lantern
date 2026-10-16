import { Router, type ErrorRequestHandler } from "express";
import { pool } from "@workspace/db";
import { GetCtfLeaderboardResponse, GetCtfReviewQueueQueryParams, GetCtfReviewQueueResponse, GetCtfNotificationsResponse, ReadCtfNotificationParams } from "@workspace/api-zod";
import { ClassroomError, requireInstructor } from "../lib/instructor-access";
import { bootstrapTeams, completionPercentage, hasResponse, recordCompletion, type ActivityId } from "../lib/classroom-teams";
import { loadKeys, toProgress, type ProgressRow } from "../lib/iron-progress";
import { loadQuestions } from "../lib/ctf-question-authoring";
import { requiresReview } from "../lib/ctf-activity";
import { lanternProgress, loadLanternKeys, type LanternRow } from "../lib/lantern-progress";
import { lanternQuestions } from "../lib/lantern-activity";

const router = Router();
async function records(activity: ActivityId) {
  await bootstrapTeams(activity);
  if (activity === "ctf") {
    const [rows, keys, questions] = await Promise.all([pool.query<ProgressRow>("SELECT * FROM ctf_progress"), loadKeys(), loadQuestions()]);
    return { questions: questions.map(q => ({ ...q, code: `Flag ${q.id}`, manualReview: requiresReview(q, keys) })),
      progress: rows.rows.map(row => toProgress(row, keys, questions)) };
  }
  const [rows, keys] = await Promise.all([pool.query<LanternRow>("SELECT * FROM lantern_progress"), loadLanternKeys()]);
  return { questions: lanternQuestions, progress: rows.rows.map(row => lanternProgress(row, keys)) };
}
for (const activity of ["ctf", "lantern"] as const) {
  router.get(`/${activity}/leaderboard`, async (_req, res) => {
    const data = await records(activity);
    const teams = await pool.query<{ team_number: number; team_name: string | null; session_id: string }>("SELECT team_number,team_name,session_id FROM classroom_teams WHERE activity=$1", [activity]);
    const ids = data.questions.map(q => q.id);
    const board = teams.rows.map(team => {
      const progress = data.progress.find(p => p.sessionId === team.session_id);
      return { teamNumber: team.team_number, teamName: team.team_name ?? `Team ${team.team_number}`, percentage: progress ? completionPercentage(progress.answers, ids) : 0 };
    }).sort((a, b) => b.percentage - a.percentage || a.teamName.localeCompare(b.teamName));
    res.set("Cache-Control", "no-store").json(GetCtfLeaderboardResponse.parse(board));
  });
  router.get(`/${activity}/instructor/review-queue`, async (req, res) => {
    requireInstructor(req);
    const query = GetCtfReviewQueueQueryParams.safeParse(req.query);
    if (!query.success) throw new ClassroomError(400, "Choose a supported review queue sort.");
    const data = await records(activity);
    const queue = data.progress.flatMap(p => data.questions.filter(q => {
      const a = p.answers[String(q.id)];
      return q.manualReview && a && hasResponse(a.value) && (a.reviewStatus ?? "pending") === "pending";
    }).map(q => ({
      sessionId: p.sessionId, name: p.name, teamNumber: p.teamNumber ?? null, teamName: p.teamName, questionId: q.id,
      code: q.code, prompt: q.prompt, value: String(p.answers[String(q.id)].value),
      points: q.points, updatedAt: p.answers[String(q.id)].updatedAt,
    })));
    const sort = query.data.sort ?? "time_asc";
    queue.sort((a, b) => {
      const primary = sort.startsWith("name") ? a.name.localeCompare(b.name, "en", { sensitivity: "base" }) : new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      return primary * (sort.endsWith("desc") ? -1 : 1) || a.sessionId.localeCompare(b.sessionId) || a.questionId - b.questionId;
    });
    res.set("Cache-Control", "no-store").json(GetCtfReviewQueueResponse.parse(queue));
  });
  router.get(`/${activity}/instructor/notifications`, async (req, res) => {
    requireInstructor(req);
    const data = await records(activity);
    // Also catch completions caused by an instructor changing a choice key.
    for (const p of data.progress) await recordCompletion(activity, p, data.questions.map(q => q.id));
    const notifications = await pool.query(`SELECT n.id,n.team_number AS "teamNumber",
      coalesce(t.team_name,'Team ' || n.team_number) AS "teamName",
      n.completed_at AS "completedAt",n.read_at AS "readAt"
      FROM classroom_notifications n LEFT JOIN classroom_teams t
        ON t.activity=n.activity AND t.session_id=n.session_id
      WHERE n.activity=$1 ORDER BY n.completed_at DESC,n.id DESC`, [activity]);
    res.set("Cache-Control", "no-store").json(GetCtfNotificationsResponse.parse(notifications.rows));
  });
  router.put(`/${activity}/instructor/notifications/:notificationId/read`, async (req, res) => {
    requireInstructor(req);
    const parsed = ReadCtfNotificationParams.safeParse(req.params);
    if (!parsed.success) throw new ClassroomError(400, "Invalid notification.");
    const result = await pool.query("UPDATE classroom_notifications SET read_at=coalesce(read_at,now()) WHERE activity=$1 AND id=$2 RETURNING id", [activity, parsed.data.notificationId]);
    if (!result.rowCount) throw new ClassroomError(404, "Notification not found.");
    res.json({ ok: true });
  });
}
router.use(((error, _req, res, next) => {
  if (error instanceof ClassroomError) res.status(error.status).json({ error: error.message });
  else next(error);
}) as ErrorRequestHandler);
export default router;
