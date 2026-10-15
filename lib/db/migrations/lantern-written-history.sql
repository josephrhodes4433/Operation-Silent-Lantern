-- Additive and repeatable. Existing overwritten attempts cannot be recovered.
BEGIN;
CREATE TABLE IF NOT EXISTS lantern_written_history (
  id serial PRIMARY KEY,
  session_id text NOT NULL REFERENCES lantern_progress(session_id),
  question_id integer NOT NULL,
  version integer NOT NULL,
  event text NOT NULL,
  value text NOT NULL,
  decision text NOT NULL,
  feedback text,
  points integer,
  response_updated_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lantern_written_history_question_idx
  ON lantern_written_history (session_id, question_id, id);
-- Lock against session writes while capturing each existing latest response.
LOCK TABLE lantern_progress IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO lantern_written_history
  (session_id,question_id,version,event,value,decision,feedback,points,response_updated_at)
SELECT p.session_id, a.key::integer, 1, 'imported', a.value->>'value',
  COALESCE(a.value->>'reviewStatus','pending'), a.value->>'instructorNote',
  (a.value->>'instructorPoints')::integer, (a.value->>'updatedAt')::timestamptz
FROM lantern_progress p CROSS JOIN LATERAL jsonb_each(p.answers) a
WHERE a.key IN ('6','7','11','17','18','107','110','116','117','118','125','126')
  AND jsonb_typeof(a.value->'value') = 'string'
  AND NOT EXISTS (
    SELECT 1 FROM lantern_written_history h
    WHERE h.session_id=p.session_id AND h.question_id=a.key::integer
  );
COMMIT;
