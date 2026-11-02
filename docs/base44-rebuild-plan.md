# Rebuilding the CTFs as a native Base44 app

This repo (Express API + PostgreSQL/Drizzle + two Vite frontends, deployed on Replit)
cannot be published by Base44. This brief maps every piece onto a native Base44 app so it
can be rebuilt in the regular Base44 builder and published there. Keep the Replit
deployment running until the Base44 version has been tested with a real class.

## 1. Target shape

- One Base44 app with two activity areas: **IRON MERIDIAN** and **SILENT LANTERN**
  (or two Base44 apps, one per CTF, if they are run separately).
- Pages per activity (same as today): Overview, Activity, Results, Leaderboard, Instructor.
- Learners stay anonymous (team number + optional team name, no personal identity).
- Instructors sign in with Base44 login and an admin/instructor role, replacing the shared
  `CTF_INSTRUCTOR_CODE` password. (If a shared code is preferred, keep it as an app secret
  checked only inside a backend function.)

## 2. Entities (from `lib/db/src/schema/*`)

| Entity | Replaces table | Fields |
| --- | --- | --- |
| `ClassroomWindow` | `classroom_windows` | activity, started_at, expires_at, closed_at |
| `ClassroomTeam` | `classroom_teams` | activity, team_number, team_name, session_date, window_id, session_id |
| `CompletionNotification` | `classroom_notifications` | activity, session_id, team_number, completed_at, read_at |
| `Question` | `ctf_questions` + `questions.json` / `lantern-activity.ts` | activity, question_id, definition (object: prompt, kind, choices, points, mission, …) |
| `AnswerKey` | `ctf_keys`, `lantern_keys` | activity, question_id, accepted_answers (list) |
| `TeamProgress` | `ctf_progress`, `lantern_progress` | activity, session_id, window_id, team_number, team_name, team_members, session_date, answers (object), saved_at, submitted_at; Lantern only: authorization_notes, authorization_granted, hints (list), speed_bonus, tradecraft_bonus |
| `WrittenHistory` | `lantern_written_history` | session_id, question_id, version, event, value, decision, feedback, points, response_updated_at, recorded_at |

**Access rules (important):**
- `AnswerKey` and `CompletionNotification`: instructors only. Learners must never be able to read them.
- `TeamProgress`, `ClassroomTeam`, `WrittenHistory`: learners never read or write them directly; all writes go through backend functions so scoring can't be tampered with.
- `Question`: public read only for learner-safe fields. Keep accepted answers and answer guides out of it.

## 3. Backend functions (from `artifacts/api-server/src/routes/*`)

Learner functions (callable anonymously, validate input, run as service role):

| Function | Replaces |
| --- | --- |
| `getActivity(activity)` | `GET /ctf/activity`, `GET /lantern/activity` |
| `getWindow(activity)` | `GET /:activity/window` |
| `checkInTeam(activity, teamNumber, teamName, members)` | `POST /ctf/progress`, `POST /lantern/progress` (starts the shared 24 h window on first check-in) |
| `getProgress(activity, sessionId)` | `GET /…/progress/:sessionId` |
| `saveAnswer(activity, sessionId, questionId, value)` | `PUT /…/progress/:sessionId/answers/:questionId` (grades against `AnswerKey` server-side) |
| `submitProgress(activity, sessionId)` | `POST /…/progress/:sessionId/submit` (creates `CompletionNotification` once) |
| `takeHint(sessionId, missionId)` | `POST /lantern/progress/:sessionId/hints/:missionId` (−2 points per hint) |
| `saveAuthorization(sessionId, notes)` | `PUT /lantern/progress/:sessionId/authorization` |
| `getLeaderboard(activity)` | `GET /:activity/leaderboard` |

Instructor functions (require instructor role):

| Function | Replaces |
| --- | --- |
| `getAnswerGuide(activity)` | `GET /…/instructor/answer-guide` |
| `listQuestions` / `updateQuestion` | `GET/PUT /ctf/instructor/questions…` |
| `listKeys` / `updateKey` | `GET/PUT /…/instructor/keys…` |
| `listSubmissions` / `getSubmission` | `GET /…/instructor/submissions…` |
| `getWrittenHistory(sessionId, questionId)` | `GET /lantern/instructor/submissions/:id/history/:qid` |
| `reviewAnswer(activity, sessionId, questionId, decision, feedback)` | `PUT /…/submissions/:id/review/:qid` (also appends `WrittenHistory` for Lantern) |
| `grantAuthorization`, `setAdjustments` | Lantern authorization + speed/tradecraft bonus endpoints |
| `getReviewQueue`, `listNotifications`, `markNotificationRead` | classroom review-queue / notifications endpoints |
| `reopenWindow(activity)` | `POST /:activity/instructor/window/reopen` (closes current window, archives teams) |

## 4. Business rules to carry over exactly

Logic lives in `artifacts/api-server/src/lib/`; port it rather than re-describe it.

- **Shared window:** the first team check-in starts one 24 h window per activity. After expiry, learner writes are blocked (read-only) until an instructor reopens it. Reopening starts a new window; earlier teams become read-only archives (`classroom-window.ts`, `classroom-teams.ts`).
- **Team numbers** are unique per activity; team names are unique (case-insensitive) per window.
- **Scoring:** auto-graded answers are checked against accepted answers; written answers earn points only after instructor approval (`iron-progress.ts`, `lantern-progress.ts`, `lantern-review.ts`).
- **Lantern totals:** `max(0, raw − 2 × hints + speed_bonus + tradecraft_bonus)`.
- **Written history:** each Lantern written submission or review appends a versioned `WrittenHistory` row (`lantern-history.ts`).
- **Concurrency:** today saves are serialized per session with database locks. In Base44, do read-modify-write inside one backend function and re-read before writing; accept a small risk of overlapping saves from two teammates.

## 5. Content and data to move

- Question content (all under `artifacts/api-server/src/`): IRON MERIDIAN in
  `data/questions.json` and `lib/iron-choice-questions.ts`; SILENT LANTERN in
  `lib/lantern-activity.ts` and `lib/lantern-choice-feedback.ts`. Load these as
  `Question` / `AnswerKey` seed records.
- Frontend UI: `artifacts/iron-meridian-ctf/src` and `artifacts/silent-lantern-ctf/src` (React + Tailwind + shadcn). The builder can reuse layout and copy; data calls change to Base44 functions.
- Classroom data: export the live tables from the Replit Postgres (CSV per table) and import
  into the matching entities only if past sessions need to be kept. Otherwise start fresh.

## 6. Suggested build order in the Base44 builder

1. Create the entities above with their access rules.
2. Seed `Question` and `AnswerKey` from the content files.
3. Build the learner backend functions, then the IRON MERIDIAN learner pages.
4. Build the instructor login, functions, and Instructor page.
5. Repeat steps 3–4 for SILENT LANTERN (hints, authorization, bonuses, written history).
6. Run a test class end to end (two teams, window expiry, reopen, review, leaderboard), then move classes over and retire the Replit deployment.
