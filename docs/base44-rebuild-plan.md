# Rebuilding the CTFs as native Base44 apps

This repo (Express API + PostgreSQL/Drizzle + two Vite frontends, configured for Replit)
cannot be published by Base44. This brief maps every piece onto native Base44 apps so they
can be rebuilt in the regular Base44 builder and published there. The apps have never been
live, so there is no classroom data to migrate and no deployment to keep running.

## 1. Decisions

- **Two separate Base44 apps**, each built and published on its own:
  - **App A: IRON MERIDIAN** (source: `artifacts/iron-meridian-ctf`, `/ctf/*` API routes)
  - **App B: SILENT LANTERN** (source: `artifacts/silent-lantern-ctf`, `/lantern/*` API routes)
- Pages in each app (same as today): Overview, Activity, Results, Leaderboard, Instructor.
- Learners stay anonymous: team number, optional team name, no personal identity, no login.
- Instructors sign in with Base44 login and need an **instructor** (or admin) role. This
  replaces the shared `CTF_INSTRUCTOR_CODE` password; no shared code is carried over.
- Because each app holds one activity, the old `activity` column is dropped everywhere.

## 2. Entities

Both apps (from `lib/db/src/schema/`):

| Entity | Replaces table | Fields |
| --- | --- | --- |
| `ClassroomWindow` | `classroom_windows` | started_at, expires_at, closed_at |
| `ClassroomTeam` | `classroom_teams` | team_number, team_name, session_date, window_id, session_id |
| `CompletionNotification` | `classroom_notifications` | session_id, team_number, completed_at, read_at |
| `Question` | see section 5 | question_id, definition (object: prompt, kind, choices, points, mission, …) |
| `AnswerKey` | `ctf_keys` / `lantern_keys` | question_id, accepted_answers (list) |
| `TeamProgress` | `ctf_progress` / `lantern_progress` | session_id, window_id, team_number, team_name, team_members, session_date, answers (object), saved_at, submitted_at |

SILENT LANTERN only:

- `TeamProgress` also has: authorization_notes, authorization_granted, hints (list), speed_bonus, tradecraft_bonus.
- `WrittenHistory` (replaces `lantern_written_history`): session_id, question_id, version, event (submitted/reviewed/imported), value, decision (pending/approved/denied), feedback, points, response_updated_at, recorded_at.

**Access rules (both apps):**
- `AnswerKey` and `CompletionNotification`: instructors only. Learners must never be able to read them.
- `TeamProgress`, `ClassroomTeam`, `ClassroomWindow`, `WrittenHistory`: no direct learner access; all reads and writes go through backend functions so scoring can't be tampered with.
- `Question`: learners only see learner-safe fields (no accepted answers or answer guides). In IRON MERIDIAN, only instructors can edit questions.

## 3. Backend functions

Learner functions (both apps unless noted; callable without login, validate input, run as service role):

| Function | Replaces |
| --- | --- |
| `getActivity` | `GET /ctf/activity`, `GET /lantern/activity` |
| `getWindow` | `GET /:activity/window` |
| `checkInTeam(teamNumber, teamName, members)` | `POST /…/progress` (starts the shared 24 h window on first check-in) |
| `getProgress(sessionId)` | `GET /…/progress/:sessionId` |
| `saveAnswer(sessionId, questionId, value)` | `PUT /…/progress/:sessionId/answers/:questionId` (grades against `AnswerKey` server-side) |
| `submitProgress(sessionId)` | `POST /…/progress/:sessionId/submit` (creates one `CompletionNotification`) |
| `getLeaderboard` | `GET /:activity/leaderboard` |
| `takeHint(sessionId, missionId)` — Lantern only | `POST /lantern/progress/:sessionId/hints/:missionId` (−2 points per hint) |
| `saveAuthorization(sessionId, notes)` — Lantern only | `PUT /lantern/progress/:sessionId/authorization` |

Instructor functions (check the signed-in user has the instructor role):

| Function | Replaces |
| --- | --- |
| `getAnswerGuide` | `GET /…/instructor/answer-guide` |
| `listKeys` / `updateKey` | `GET/PUT /…/instructor/keys…` |
| `listSubmissions` / `getSubmission` | `GET /…/instructor/submissions…` |
| `reviewAnswer(sessionId, questionId, decision, feedback)` | `PUT /…/submissions/:id/review/:qid` (Lantern also appends `WrittenHistory`) |
| `getReviewQueue`, `listNotifications`, `markNotificationRead` | `/:activity/instructor/review-queue`, `/notifications` |
| `reopenWindow` | `POST /:activity/instructor/window/reopen` (closes current window, archives teams) |
| `listQuestions` / `updateQuestion` — Iron only | `GET/PUT /ctf/instructor/questions…` |
| `getWrittenHistory(sessionId, questionId)` — Lantern only | `GET /lantern/instructor/submissions/:id/history/:qid` |
| `grantAuthorization`, `setAdjustments` — Lantern only | Lantern authorization + speed/tradecraft bonus endpoints |

The old `POST /…/instructor/verify` (password check) is replaced by Base44 login.

## 4. Business rules to carry over exactly

Logic lives in `artifacts/api-server/src/lib/`; port it rather than re-describe it.

- **Shared window:** the first team check-in starts one 24 h window. After expiry, learner writes are blocked (read-only) until an instructor reopens it. Reopening starts a new window; earlier teams become read-only archives (`classroom-window.ts`, `classroom-teams.ts`).
- **Team numbers** are unique; team names are unique (case-insensitive) within a window.
- **Scoring:** auto-graded answers are checked against accepted answers; written answers earn points only after instructor approval (`iron-progress.ts`, `lantern-progress.ts`, `lantern-review.ts`).
- **Lantern totals:** `max(0, raw − 2 × hints + speed_bonus + tradecraft_bonus)`.
- **Lantern written history:** each written submission or review appends a versioned `WrittenHistory` record (`lantern-history.ts`).
- **Concurrency:** today saves are serialized per session with database locks. In Base44, do read-modify-write inside one backend function and re-read before writing; accept a small risk of overlapping saves from two teammates.

## 5. Content per app

All under `artifacts/api-server/src/`:

- **IRON MERIDIAN:** `data/questions.json`, `lib/iron-choice-questions.ts`, `lib/iron-answer-guide.ts`, `lib/ctf-question-authoring.ts` (question editing rules).
- **SILENT LANTERN:** `lib/lantern-activity.ts` (missions, questions, hints), `lib/lantern-choice-feedback.ts`, `lib/lantern-answer-guide.ts`.

Load these as `Question` / `AnswerKey` seed records. The UI (React + Tailwind + shadcn) is in
`artifacts/iron-meridian-ctf/src` and `artifacts/silent-lantern-ctf/src`; the builder can
reuse layout and copy, with data calls changed to Base44 functions.

## 6. Build order (do App A fully, then App B)

1. Create the app in the Base44 builder.
2. Create the entities from section 2 with their access rules.
3. Seed `Question` and `AnswerKey` from that app's content files (section 5).
4. Build the learner functions, then the Overview, Activity, Results and Leaderboard pages.
5. Turn on login for instructors only, create the instructor role, then build the instructor functions and Instructor page.
6. Test end to end: two teams check in, answer, submit; instructor reviews; leaderboard updates; window expiry and reopen work.
7. Publish, then invite instructors and give them the instructor role.
