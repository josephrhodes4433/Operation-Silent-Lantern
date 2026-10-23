import type { CtfActivity, CtfProgress, CtfQuestion } from '@workspace/api-client-react';

const KEY = 'iron-meridian-session';
export interface Session { sessionId: string; teamName?: string; instructorName?: string }

export function loadSession(): Session | null {
  try {
    purgeLegacyIdentity();
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o.sessionId !== 'string' || !o.sessionId) { localStorage.removeItem(KEY); return null; }
    // Keep only the private resume token, team name and instructor name.
    const clean: Session = { sessionId: o.sessionId };
    if (typeof o.teamName === 'string') clean.teamName = o.teamName;
    if (typeof o.instructorName === 'string') clean.instructorName = o.instructorName;
    const out = JSON.stringify(clean);
    if (out !== raw) localStorage.setItem(KEY, out);
    return clean;
  } catch { return null; }
}
export function storeSession(s: Session | null) {
  if (s) {
    const clean: Session = { sessionId: s.sessionId };
    if (s.teamName) clean.teamName = s.teamName;
    if (s.instructorName) clean.instructorName = s.instructorName;
    localStorage.setItem(KEY, JSON.stringify(clean));
  } else localStorage.removeItem(KEY);
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
  const lines = [`${a.title} - results`, `Team: ${p.teamName}`, `Instructor: ${p.instructorName}`, `Session date (Eastern Time): ${p.sessionDate}`, `Score: ${p.totalPoints} / ${a.totalPoints} points`,
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
  const body = [`Team: ${p.teamName}`, `Instructor: ${p.instructorName}`, `Score so far: ${p.totalPoints} / ${a.totalPoints}`, '', 'WRITTEN RESPONSES', '',
    ...written.flatMap((q) => [`Q${q.id}: ${q.prompt}`, p.answers[String(q.id)] ? asText(p.answers[String(q.id)].value) : '(not answered)', ''])].join('\n');
  return body;
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

const LEGACY_KEY = /learner-profile|check-in|checkin/i;
/** Remove identity data stored by earlier versions (profiles, check-in drafts). */
export function purgeLegacyIdentity() {
  try {
    for (const k of Object.keys(localStorage)) if (LEGACY_KEY.test(k)) localStorage.removeItem(k);
  } catch { /* storage unavailable */ }
}
purgeLegacyIdentity();

export function mailDraftNotice() { return 'Do not include real learner or customer information.'; }
export function buildMailDraft(a: CtfActivity, p: CtfProgress, recipient: string): { href: string; oversize: boolean } {
  const full = buildWrittenEmailBody(a, p);
  const oversize = encodeURIComponent(full).length > 6000;
  const body = oversize
    ? `Team: ${p.teamName}\nInstructor: ${p.instructorName}\n${a.title}\nScore: ${p.totalPoints} / ${a.totalPoints}\n\nMy responses are too long for this draft. Attach the downloaded results text file before sending. It was NOT attached automatically.`
    : full;
  return { href: `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(`${a.title} - ${p.teamName}`)}&body=${encodeURIComponent(body)}`, oversize };
}
export function downloadResults(a: CtfActivity, p: CtfProgress) {
  const url = URL.createObjectURL(new Blob([buildResultsText(a, p)], { type: 'text/plain' }));
  const el = document.createElement('a'); el.href = url; el.download = 'iron-meridian-results.txt'; el.click(); URL.revokeObjectURL(url);
}
