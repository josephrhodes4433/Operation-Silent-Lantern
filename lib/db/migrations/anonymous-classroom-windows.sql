BEGIN;
SELECT pg_advisory_xact_lock(hashtext('classroom-teams-ctf'));
SELECT pg_advisory_xact_lock(hashtext('classroom-teams-lantern'));
CREATE TABLE IF NOT EXISTS classroom_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity text NOT NULL, started_at timestamptz, expires_at timestamptz, closed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS classroom_current_window_idx
  ON classroom_windows(activity) WHERE closed_at IS NULL;
ALTER TABLE classroom_teams ADD COLUMN IF NOT EXISTS window_id uuid;
DROP INDEX IF EXISTS classroom_team_date_name_idx;
CREATE UNIQUE INDEX IF NOT EXISTS classroom_team_window_name_idx
  ON classroom_teams(activity,window_id,lower(team_name));
-- Explicitly approved de-identification: preserve every response, score,
-- review event, feedback note and timestamp. Legacy sessions stay read-only.
DO $$ DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ctf_progress','lantern_progress'] LOOP
    IF to_regclass(table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS instructor_name text', table_name);
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS window_id uuid', table_name);
      EXECUTE format('ALTER TABLE %I ALTER COLUMN name SET DEFAULT %L', table_name, '');
      EXECUTE format('ALTER TABLE %I ALTER COLUMN email SET DEFAULT %L', table_name, '');
      EXECUTE format('ALTER TABLE %I ALTER COLUMN instructor_email SET DEFAULT %L', table_name, '');
      EXECUTE format('UPDATE %I SET name=%L,email=%L,instructor_email=%L,team_members=NULL WHERE name<>%L OR email<>%L OR instructor_email<>%L OR team_members IS NOT NULL',
        table_name,'','','','','','');
    END IF;
  END LOOP;
END $$;
COMMIT;
