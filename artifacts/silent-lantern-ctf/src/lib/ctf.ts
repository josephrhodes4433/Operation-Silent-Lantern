import type { LanternActivity, LanternProgress, LanternQuestion } from '@workspace/api-client-react';

const KEY = 'silent-lantern-session';
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
export const sentenceCount = (s: string) => s.split(/[.!?]+(?:\s|$)/).filter((x) => x.trim().length > 0).length;

export function orderedQuestions(a: LanternActivity): LanternQuestion[] {
  return [...a.questions].sort((x, y) => x.section - y.section || x.id - y.id);
}
export const asText = (v: string | string[]) => (Array.isArray(v) ? v.join('; ') : v);
export const hasResponse = (answer?: { value: string | string[] }) => !!answer && (Array.isArray(answer.value) ? answer.value.length > 0 : !!answer.value.trim());
export function errMessage(e: unknown, fallback: string): string {
  const x = e as { data?: { error?: string; message?: string } | string; message?: string } | null;
  if (x && typeof x.data === 'string' && x.data) return x.data;
  if (x && x.data && typeof x.data === 'object') return x.data.error || x.data.message || fallback;
  return fallback;
}
export function errStatus(e: unknown): number | undefined {
  return (e as { status?: number } | null)?.status;
}
export function submitBlockers(a: LanternActivity, p: LanternProgress): string[] {
  const out: string[] = [];
  if (hasUnsavedWork(a, p)) out.push('Some changes are still saving or are only saved in this browser. Return to the activity and resolve them before sending results.');
  const missing = a.questions.filter((q) => !hasResponse(p.answers[String(q.id)]));
  if (missing.length) out.push(`Missing responses: ${missing.map((q) => q.code).join(', ')}`);
  const bad = a.questions.filter((q) => !q.manualReview && q.isFlag && p.answers[String(q.id)]?.status !== 'correct');
  if (bad.length) out.push(`Flags not yet correct: ${bad.map((q) => q.code).join(', ')}`);
  const unapproved = a.questions.filter(q => q.manualReview && p.answers[String(q.id)]?.reviewStatus !== 'approved');
  if (unapproved.length) out.push(`Written responses need instructor acceptance: ${unapproved.map(q => q.code).join(', ')}`);
  return out;
}

const queues = new Map<string, Promise<unknown>>();
export function hasUnsavedWork(a: LanternActivity, p: LanternProgress): boolean {
  if ([...queues.keys()].some(key => key.startsWith(`${p.sessionId}-`))) return true;
  if (a.questions.some(q => {
    const draft = loadDraft(p.sessionId, q.id);
    return draft !== undefined && JSON.stringify(draft) !== JSON.stringify(p.answers[String(q.id)]?.value);
  })) return true;
  return false; // Retired preservation-note drafts must not block the revised activity.
}
export function queueSave<T>(key: string, work: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(work);
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => undefined);
  return next;
}
const dk = (s: string, q: number) => `silent-lantern-draft-${s}-${q}`;
export function loadDraft(sessionId: string, questionId: number): string | string[] | undefined {
  try {
    const raw = localStorage.getItem(dk(sessionId, questionId));
    return raw ? JSON.parse(raw) : undefined;
  } catch { return undefined; }
}
export function storeDraft(sessionId: string, questionId: number, value: string | string[]) {
  localStorage.setItem(dk(sessionId, questionId), JSON.stringify(value));
}
export function clearDraft(sessionId: string, questionId: number, value: string | string[]) {
  if (JSON.stringify(loadDraft(sessionId, questionId)) === JSON.stringify(value)) localStorage.removeItem(dk(sessionId, questionId));
}
const AUTH_KEY = (s: string) => `silent-lantern-authnotes-${s}`;
export const loadAuthDraft = (s: string) => localStorage.getItem(AUTH_KEY(s));
export const storeAuthDraft = (s: string, v: string) => localStorage.setItem(AUTH_KEY(s), v);
export const clearAuthDraft = (s: string, saved: string) => {
  if (loadAuthDraft(s)?.trim() === saved.trim()) localStorage.removeItem(AUTH_KEY(s));
};

export function buildResultsText(a: LanternActivity, p: LanternProgress): string {
  const lines = [`${a.title} - results`, `Team: ${p.teamName}`, `Instructor: ${p.instructorName}`, `Session date (Eastern Time): ${p.sessionDate}`,
    `Score: ${p.totalPoints} / ${a.totalPoints} points (hint penalty ${p.penaltyPoints}, speed bonus ${p.speedBonus}, tradecraft bonus ${p.tradecraftBonus})`,
    `Answered: ${p.answeredCount} / ${a.totalFlags}`, `Saved: ${p.savedAt}`, ''];
  for (const q of orderedQuestions(a)) {
    const ans = p.answers[String(q.id)];
    lines.push(`[Mission ${q.section}] ${q.code} (${q.points} pts)`, q.prompt,
      `Answer: ${ans ? asText(ans.value) : '(not answered)'}`,
      `Status: ${outcome(q, ans).text}${ans ? `, ${ans.earnedPoints} pts` : ''}`);
    if (ans?.instructorNote) lines.push(`Instructor note: ${ans.instructorNote}`);
    lines.push('');
  }
  if (Object.keys(p.archivedAnswers ?? {}).length) {
    lines.push('EARLIER CURRICULUM — READ-ONLY, NOT CURRENT SCORES', '');
    for (const [id, answer] of Object.entries(p.archivedAnswers ?? {})) lines.push(`Earlier question ID ${id}: ${asText(answer.value)}`, `Review: ${answer.reviewStatus ?? answer.status}`, `Instructor: ${answer.instructorNote ?? ''}`, '');
  }
  if (p.authorizationNotes) lines.push('EARLIER CURRICULUM — PRESERVATION NOTES (READ-ONLY)', p.authorizationNotes, '');
  return lines.join('\n');
}
export function buildWrittenEmailBody(a: LanternActivity, p: LanternProgress): string {
  const written = orderedQuestions(a).filter((q) => q.manualReview || q.kind === 'long' || q.isFinalSummary);
  return [`Team: ${p.teamName}`, `Instructor: ${p.instructorName}`, `Score so far: ${p.totalPoints} / ${a.totalPoints}`, '', 'WRITTEN RESPONSES', '',
    ...written.flatMap((q) => [`${q.code}: ${q.prompt}`, p.answers[String(q.id)] ? asText(p.answers[String(q.id)].value) : '(not answered)', '']),
  ].join('\n');
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
export function buildMailDraft(a: LanternActivity, p: LanternProgress, recipient: string): { href: string; oversize: boolean } {
  const full = buildWrittenEmailBody(a, p);
  const oversize = encodeURIComponent(full).length > 6000;
  const body = oversize
    ? `Team: ${p.teamName}\nInstructor: ${p.instructorName}\n${a.title}\nScore: ${p.totalPoints} / ${a.totalPoints}\n\nMy responses are too long for this draft. Attach the downloaded results text file before sending. It was NOT attached automatically.`
    : full;
  return { href: `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(`${a.title} - ${p.teamName}`)}&body=${encodeURIComponent(body)}`, oversize };
}
export function downloadResults(a: LanternActivity, p: LanternProgress) {
  const url = URL.createObjectURL(new Blob([buildResultsText(a, p)], { type: 'text/plain' }));
  const el = document.createElement('a'); el.href = url; el.download = 'silent-lantern-results.txt'; el.click(); URL.revokeObjectURL(url);
}
