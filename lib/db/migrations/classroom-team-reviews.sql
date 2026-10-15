ALTER TABLE ctf_progress ADD COLUMN IF NOT EXISTS team_number integer;
CREATE TABLE IF NOT EXISTS classroom_teams (
  activity text NOT NULL, team_number integer NOT NULL, session_id text NOT NULL,
  PRIMARY KEY(activity,team_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS classroom_team_session_idx ON classroom_teams(activity,session_id);
CREATE TABLE IF NOT EXISTS classroom_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), activity text NOT NULL,
  session_id text NOT NULL, team_number integer NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS classroom_completion_once_idx ON classroom_notifications(activity,session_id);
