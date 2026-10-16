import type { CtfActivity, CtfProgress, CtfQuestion } from '@workspace/api-client-react';

const KEY = 'iron-meridian-session';
export interface Session { sessionId: string; name: string; firstName?: string; lastName?: string; email: string; instructorEmail: string; teamNumber?: number | null; teamName?: string }

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
  const lines = [`${a.title} - results`, `Analyst: ${p.name} <${p.email}>`, `Team: ${p.teamName}`, `Team members: ${p.teamMembers.join(', ')}`, `Session date (Eastern Time): ${p.sessionDate}`, `Score: ${p.totalPoints} / ${a.totalPoints} points`,
    `Answered: ${p.answeredCount} / ${a.totalFlags}`, `Saved: ${p.savedAt}`, ''];
  for (const q of orderedQuestions(a)) {
    const ans = p.answers[String(q.id)];
    lines.push(`[Section ${q.section}] Q${q.id} (${q.points} pts)`, q.prompt,
      `Answer: ${ans ? asText(ans.value) : '(not answered)'}`,
      `Status: ${outcome(q, ans).text}${ans ? `, ${ans.earnedPoints} pts` : ''}`);
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
export function errMessage(e: unknown, fallback: string): string {
  const x = e as { data?: { error?: string; message?: string } | string } | null;
  if (x && typeof x.data === 'string' && x.data) return x.data;
  if (x && x.data && typeof x.data === 'object') return x.data.error || x.data.message || fallback;
  return fallback;
}
export function submitBlockers(a: CtfActivity, p: CtfProgress): string[] {
  const out: string[] = [];
  const missing = a.questions.filter((q) => !hasResponse(p.answers[String(q.id)]));
  if (missing.length) out.push(`Missing responses: flags ${missing.map((q) => q.id).join(', ')}`);
  const open = a.questions.filter((q) => hasResponse(p.answers[String(q.id)]) && !isDone(q, p.answers[String(q.id)]));
  if (open.length) out.push(`Not yet correct or instructor-accepted: flags ${open.map((q) => q.id).join(', ')}`);
  return out;
}
export function errStatus(e: unknown): number | undefined {
  return (e as { status?: number } | null)?.status;
}

type Reviewable = { value: string | string[]; status: string; reviewStatus?: 'pending' | 'approved' | 'denied' };
/** A question is complete when a choice/keyed answer is correct, or a written answer is instructor-accepted. */
export function isDone(q: { manualReview: boolean }, an?: Reviewable): boolean {
  if (!an || !hasResponse(an)) return false;
  return q.manualReview ? an.reviewStatus === 'approved' : an.status === 'correct';
}
export function outcome(q: { manualReview: boolean }, an?: Reviewable): { text: string; cls: string } {
  if (!an || !hasResponse(an)) return { text: 'Incomplete', cls: 'text-muted-foreground' };
  if (q.manualReview) {
    if (an.reviewStatus === 'approved') return { text: 'Accepted', cls: 'text-[hsl(var(--ok))]' };
    if (an.reviewStatus === 'denied') return { text: 'Denied - revise and resubmit', cls: 'text-destructive' };
    return { text: 'Pending instructor review', cls: 'text-[hsl(var(--warn))]' };
  }
  const t: Record<string, [string, string]> = { correct: ['Correct', 'text-[hsl(var(--ok))]'], incorrect: ['Incorrect', 'text-destructive'], manual: ['Awaiting review', 'text-[hsl(var(--warn))]'], unkeyed: ['Pending key', 'text-[hsl(var(--warn))]'] };
  const [text, cls] = t[an.status] ?? ['Saved', 'text-muted-foreground'];
  return { text, cls };
}
export function reviewCounts(qs: { id: number; manualReview: boolean }[], answers: Record<string, Reviewable>) {
  let pending = 0, denied = 0;
  for (const q of qs) {
    const an = answers[String(q.id)];
    if (!q.manualReview || !hasResponse(an)) continue;
    if (an.reviewStatus === 'denied') denied++; else if (an.reviewStatus !== 'approved') pending++;
  }
  return { pending, denied };
}
