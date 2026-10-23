BEGIN;
SELECT pg_advisory_xact_lock(hashtext('classroom-team-names-migration'));
ALTER TABLE IF EXISTS ctf_progress ADD COLUMN IF NOT EXISTS team_name text;
ALTER TABLE lantern_progress ADD COLUMN IF NOT EXISTS team_name text;
ALTER TABLE classroom_teams ADD COLUMN IF NOT EXISTS team_name text;
ALTER TABLE IF EXISTS ctf_progress ADD COLUMN IF NOT EXISTS team_members jsonb;
ALTER TABLE lantern_progress ADD COLUMN IF NOT EXISTS team_members jsonb;
ALTER TABLE IF EXISTS ctf_progress ADD COLUMN IF NOT EXISTS session_date date;
ALTER TABLE lantern_progress ADD COLUMN IF NOT EXISTS session_date date;
ALTER TABLE classroom_teams ADD COLUMN IF NOT EXISTS session_date date;
-- Retain every private session and answer; give existing numbered teams their
-- familiar display label. Numeric identifiers remain internal and unchanged.
DO $$ BEGIN
  IF to_regclass('ctf_progress') IS NOT NULL THEN
    UPDATE ctf_progress SET team_name='Team ' || team_number
      WHERE team_name IS NULL AND team_number IS NOT NULL;
    UPDATE ctf_progress SET team_members=jsonb_build_array(name) WHERE team_members IS NULL;
    UPDATE ctf_progress SET session_date=(coalesce(submitted_at,saved_at) AT TIME ZONE 'America/New_York')::date WHERE session_date IS NULL;
    UPDATE classroom_teams t SET session_date=p.session_date FROM ctf_progress p
      WHERE t.activity='ctf' AND t.session_id=p.session_id AND t.session_date IS NULL;
  END IF;
END $$;
UPDATE lantern_progress SET team_name='Team ' || team_number
  WHERE team_name IS NULL;
UPDATE classroom_teams SET team_name='Team ' || team_number
  WHERE team_name IS NULL;
UPDATE lantern_progress SET team_members=jsonb_build_array(name) WHERE team_members IS NULL;
-- Older rows did not record their creation date. Use the best recorded date,
-- never invent a historical roster or alter existing answers and timestamps.
UPDATE lantern_progress SET session_date=(coalesce(submitted_at,saved_at) AT TIME ZONE 'America/New_York')::date WHERE session_date IS NULL;
UPDATE classroom_teams t SET session_date=p.session_date FROM lantern_progress p
  WHERE t.activity='lantern' AND t.session_id=p.session_id AND t.session_date IS NULL;
DROP INDEX IF EXISTS classroom_team_name_idx;
CREATE UNIQUE INDEX IF NOT EXISTS classroom_team_date_name_idx
  ON classroom_teams(activity,session_date,lower(team_name));
COMMIT;
