BEGIN;
SELECT pg_advisory_xact_lock(hashtext('classroom-team-names-migration'));
ALTER TABLE ctf_progress ADD COLUMN IF NOT EXISTS team_name text;
ALTER TABLE lantern_progress ADD COLUMN IF NOT EXISTS team_name text;
ALTER TABLE classroom_teams ADD COLUMN IF NOT EXISTS team_name text;
-- Retain every private session and answer; give existing numbered teams their
-- familiar display label. Numeric identifiers remain internal and unchanged.
UPDATE ctf_progress SET team_name='Team ' || team_number
  WHERE team_name IS NULL AND team_number IS NOT NULL;
UPDATE lantern_progress SET team_name='Team ' || team_number
  WHERE team_name IS NULL;
UPDATE classroom_teams SET team_name='Team ' || team_number
  WHERE team_name IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS classroom_team_name_idx
  ON classroom_teams(activity,lower(team_name));
COMMIT;
