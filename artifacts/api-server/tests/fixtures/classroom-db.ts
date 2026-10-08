import type { LanternRow } from "../../src/lib/lantern-progress";

export const classroomFixture = {
  rows: new Map<string, LanternRow>(),
  lanternKeys: new Map<number, string[]>(),
  ironKeys: new Map<number, string[]>(),
};
async function query<T = unknown>(sql: string, values: unknown[] = []): Promise<{ rows: T[] }> {
  let rows: unknown[] = [];
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
  if (sql.includes("FROM ctf_questions")) return { rows: [] };
  if (sql.includes("FROM lantern_keys")) {
    rows = [...classroomFixture.lanternKeys].map(([question_id, accepted_answers]) => ({ question_id, accepted_answers }));
  } else if (sql.startsWith("SELECT * FROM lantern_progress WHERE")) {
    const row = classroomFixture.rows.get(String(values[0]));
    rows = row ? [row] : [];
  } else if (sql.startsWith("UPDATE lantern_progress SET")) {
    const row = classroomFixture.rows.get(String(values[0]))!;
    const updated = {
      ...row, answers: JSON.parse(String(values[1])), authorization_notes: String(values[2]),
      authorization_granted: Boolean(values[3]), hints: JSON.parse(String(values[4])),
      speed_bonus: Number(values[5]), tradecraft_bonus: Number(values[6]),
      submitted_at: values[7] as Date | null, saved_at: new Date(),
    };
    classroomFixture.rows.set(row.session_id, updated);
    rows = [updated];
  } else if (sql.startsWith("INSERT INTO ctf_keys")) {
    const id = Number(values[0]);
    const existing = classroomFixture.ironKeys.get(id);
    if (!sql.includes("WHERE ctf_keys.accepted_answers") || !existing?.length) {
      const accepted_answers = JSON.parse(String(values[1]));
      classroomFixture.ironKeys.set(id, accepted_answers);
      rows = [{ accepted_answers }];
    }
  } else if (sql.startsWith("SELECT accepted_answers FROM ctf_keys WHERE")) {
    const accepted_answers = classroomFixture.ironKeys.get(Number(values[0]));
    rows = accepted_answers ? [{ accepted_answers }] : [];
  } else if (sql.includes("FROM ctf_keys")) {
    rows = [...classroomFixture.ironKeys].map(([question_id, accepted_answers]) => ({ question_id, accepted_answers }));
  } else {
    throw new Error(`Unsupported isolated fixture query: ${sql}`);
  }
  return { rows: structuredClone(rows) as T[] };
}
export const pool = {
  query,
  async connect() { return { query, release() {} }; },
};
