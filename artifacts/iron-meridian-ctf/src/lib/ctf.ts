import type { CtfActivity, CtfProgress, CtfQuestion } from '@workspace/api-client-react';

const KEY = 'iron-meridian-session';
export interface Session { sessionId: string; name: string; firstName?: string; lastName?: string; email: string; instructorEmail: string }

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch { return null; }
}
export function storeSession(s: Session | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY);
}
export function resumeLink(sessionId: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/activity?resume=${sessionId}`;
}
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const FINAL_LIMIT = 300;

export function orderedQuestions(a: CtfActivity): CtfQuestion[] {
  return [...a.questions].sort((x, y) => x.section - y.section || x.id - y.id);
}
export function finalQuestionId(a: CtfActivity): number | null {
  const q = orderedQuestions(a);
  return q.length ? q[q.length - 1].id : null;
}
export const asText = (v: string | string[]) => (Array.isArray(v) ? v.join('; ') : v);
export const hasResponse = (answer?: { value: string | string[] }) => !!answer && (Array.isArray(answer.value) ? answer.value.length > 0 : !!answer.value.trim());

const queues = new Map<string, Promise<unknown>>();
export function queueSave<T>(key: string, work: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(work);
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => undefined);
  return next;
}
export function loadDraft(sessionId: string, questionId: number): string | string[] | undefined {
  try {
    const raw = localStorage.getItem(`iron-draft-${sessionId}-${questionId}`);
    return raw ? JSON.parse(raw) : undefined;
  } catch { return undefined; }
}
export function storeDraft(sessionId: string, questionId: number, value: string | string[]) {
  localStorage.setItem(`iron-draft-${sessionId}-${questionId}`, JSON.stringify(value));
}
export function clearDraft(sessionId: string, questionId: number, value: string | string[]) {
  if (JSON.stringify(loadDraft(sessionId, questionId)) === JSON.stringify(value)) {
    localStorage.removeItem(`iron-draft-${sessionId}-${questionId}`);
  }
}

export function buildResultsText(a: CtfActivity, p: CtfProgress): string {
  const lines = [`${a.title} - results`, `Analyst: ${p.name} <${p.email}>`, `Score: ${p.totalPoints} / ${a.totalPoints} points`,
    `Answered: ${p.answeredCount} / ${a.totalFlags}`, `Saved: ${p.savedAt}`, ''];
  for (const q of orderedQuestions(a)) {
    const ans = p.answers[String(q.id)];
    lines.push(`[Section ${q.section}] Q${q.id} (${q.points} pts)`, q.prompt,
      `Answer: ${ans ? asText(ans.value) : '(not answered)'}`,
      `Status: ${ans ? ans.status : 'incomplete'}${ans ? `, ${ans.instructorPoints ?? ans.earnedPoints} pts` : ''}`);
    if (ans?.instructorNote) lines.push(`Instructor note: ${ans.instructorNote}`);
    lines.push('');
  }
  return lines.join('\n');
}
export function buildWrittenEmailBody(a: CtfActivity, p: CtfProgress): string {
  const written = orderedQuestions(a).filter((q) => q.manualReview || q.kind === 'long');
  const body = [`Analyst: ${p.name}`, `Student email: ${p.email}`, `Score so far: ${p.totalPoints} / ${a.totalPoints}`, '', 'WRITTEN RESPONSES', '',
    ...written.flatMap((q) => [`Q${q.id}: ${q.prompt}`, p.answers[String(q.id)] ? asText(p.answers[String(q.id)].value) : '(not answered)', ''])].join('\n');
  return body;
}
export function buildMailto(a: CtfActivity, p: CtfProgress): string {
  const full = buildWrittenEmailBody(a, p);
  const body = encodeURIComponent(full).length > 6000
    ? `Analyst: ${p.name}\nStudent email: ${p.email}\n${a.title}\nScore: ${p.totalPoints} / ${a.totalPoints}\n\nMy written responses are in the results text file. Please attach the downloaded results file before sending, or paste the copied written responses here.`
    : full;
  return `mailto:${encodeURIComponent(p.instructorEmail)}?subject=${encodeURIComponent(`${a.title} - ${p.name}`)}&body=${encodeURIComponent(body)}`;
}
export function errStatus(e: unknown): number | undefined {
  return (e as { status?: number } | null)?.status;
}
