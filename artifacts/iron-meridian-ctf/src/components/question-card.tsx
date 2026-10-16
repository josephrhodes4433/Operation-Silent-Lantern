import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetCtfProgressQueryKey, useSaveCtfAnswer } from '@workspace/api-client-react';
import type { CtfAnswer, CtfAnswerResult, CtfProgress, CtfQuestion } from '@workspace/api-client-react';
import { CheckCircle2, CircleDashed, Clock, XCircle } from 'lucide-react';
import { getGetCtfWindowQueryKey } from '@workspace/api-client-react';
import { btn, field } from '@/components/shell';
import { errStatus, clearDraft, FINAL_LIMIT, loadDraft, queueSave, storeDraft, wordCount } from '@/lib/ctf';

type Val = string | string[];
const isEmpty = (v: Val) => (Array.isArray(v) ? v.length === 0 : v.trim() === '');
const ser = (v: Val) => JSON.stringify(v);

export function QuestionCard({ q, sessionId, saved, isFinal }: { q: CtfQuestion; sessionId: string; saved?: CtfAnswer; isFinal: boolean }) {
  const qc = useQueryClient();
  // Drafts already live in localStorage. Attempt the request even when the
  // browser reports offline so failures surface as Retry instead of leaving
  // the per-question queue paused indefinitely.
  const save = useSaveCtfAnswer({ mutation: { networkMode: 'always', retry: false } });
  const mutateRef = useRef(save.mutateAsync);
  mutateRef.current = save.mutateAsync;

  const [value, setValue] = useState<Val>(() => loadDraft(sessionId, q.id) ?? saved?.value ?? (q.kind === 'multiple' ? [] : ''));
  const [result, setResult] = useState<CtfAnswerResult | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(saved ? new Date(saved.updatedAt) : null);
  const [dirty, setDirty] = useState(() => loadDraft(sessionId, q.id) !== undefined);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<Val>(value);
  const dirtyRef = useRef(dirty);
  const mounted = useRef(true);

  const keyed = q.correctAnswerAvailable && !q.manualReview;
  const autosave = true;
  const words = typeof value === 'string' ? wordCount(value) : 0;
  const over = isFinal && q.kind === 'long' && words > FINAL_LIMIT;

  const send = (v: Val) => {
    if (isFinal && q.kind === 'long' && typeof v === 'string' && wordCount(v) > FINAL_LIMIT) return;
    if (mounted.current) { setPending(true); setFailed(false); }
    void queueSave(`${sessionId}-${q.id}`, () => mutateRef.current({ sessionId, questionId: q.id, data: { value: v } }))
      .then((r) => {
        clearDraft(sessionId, q.id, v);
        if (mounted.current) {
          setResult(r); setPending(false); setSavedAt(new Date());
          if (ser(latest.current) === ser(v)) { setDirty(false); dirtyRef.current = false; }
        }
        qc.setQueryData<CtfProgress>(getGetCtfProgressQueryKey(sessionId), (old) => old && {
          ...old, totalPoints: r.totalPoints,
          answers: { ...old.answers, [String(q.id)]: { ...(old.answers[String(q.id)] ?? {}), value: v, correct: r.correct, earnedPoints: r.earnedPoints, status: r.status, updatedAt: new Date().toISOString(),
            ...(q.manualReview ? { reviewStatus: r.status === 'correct' ? 'approved' : r.status === 'incorrect' ? 'denied' : 'pending', instructorNote: null, instructorPoints: null } : {}) } as CtfAnswer },
        });
        qc.invalidateQueries({ queryKey: getGetCtfProgressQueryKey(sessionId) });
      })
      .catch((e: unknown) => { if (errStatus(e) === 423) void qc.invalidateQueries({ queryKey: getGetCtfWindowQueryKey() }); if (mounted.current) { setPending(false); setFailed(true); } });
  };

  const change = (v: Val) => {
    storeDraft(sessionId, q.id, v);
    setValue(v); latest.current = v; setDirty(true); dirtyRef.current = true;
    if (autosave) { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => send(v), 900); }
  };

  useEffect(() => {
    mounted.current = true;
    if (dirtyRef.current) timer.current = window.setTimeout(() => send(latest.current), 900);
    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
      if (dirtyRef.current) send(latest.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const review = saved?.reviewStatus ?? 'pending';
  const status = dirty || isEmpty(value) ? undefined : q.manualReview ? (saved ? (review === 'approved' ? 'accepted' : review === 'denied' ? 'denied' : 'manual') : undefined) : result?.status ?? saved?.status;
  const feedback = result?.feedback ?? saved?.feedback;
  const earned = q.manualReview ? saved?.earnedPoints ?? 0 : result?.earnedPoints ?? saved?.earnedPoints ?? 0;
  const id = `q-${q.id}`;

  return (
    <article className="bg-card border border-border rise" aria-labelledby={`${id}-p`} data-testid={`card-question-${q.id}`}>
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-muted/60">
        <span className="font-mono text-xs uppercase tracking-widest">Flag {q.id} | {q.sectionTitle}</span>
        <span className="font-mono text-xs bg-secondary text-secondary-foreground px-2 py-1" data-testid={`text-points-${q.id}`}>{q.points} pts</span>
      </header>
      <div className="p-5 space-y-5">
        <p id={`${id}-p`} className="text-lg leading-snug font-medium">{q.prompt}</p>
        {q.kind === 'single' && typeof value === 'string' && value && !q.options.includes(value) && <p className="text-sm bg-muted p-3 break-words" data-testid={`previous-answer-${q.id}`}>Previously saved response: {value}. It is retained and still graded. Choose an option if you want to update it.</p>}
        {q.manualReview && <p className="text-sm text-muted-foreground border-l-2 border-accent pl-3">Written response. Do not enter real learner or customer information. Your team's saved answer is reviewed by an instructor. Accepted responses earn full points; denied ones need a revision. Editing an accepted response sends it back for review.</p>}
        {!q.manualReview && !q.correctAnswerAvailable && <p className="text-sm text-muted-foreground border-l-2 border-accent pl-3">Answer key not yet configured. Your response will be saved and marked pending.</p>}

        {(q.kind === 'single' || q.kind === 'multiple') && (
          <fieldset className="space-y-2">
            <legend className="sr-only">{q.kind === 'single' ? 'Choose one' : 'Choose all that apply'}</legend>
            {q.kind === 'multiple' && <p className="text-xs font-mono uppercase text-muted-foreground">Select all that apply</p>}
            {q.options.map((o, i) => {
              const arr = Array.isArray(value) ? value : [];
              const checked = q.kind === 'single' ? value === o : arr.includes(o);
              return (
                <label key={o} className={`flex gap-3 items-start border p-3 cursor-pointer ${checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}>
                  <input type={q.kind === 'single' ? 'radio' : 'checkbox'} name={id} checked={checked} className="mt-1 accent-[hsl(var(--primary))]"
                    data-testid={`option-${q.id}-${i}`}
                    onChange={() => change(q.kind === 'single' ? o : checked ? arr.filter((x) => x !== o) : [...arr, o])} />
                  <span className="text-sm">{o}</span>
                </label>
              );
            })}
          </fieldset>
        )}
        {(q.kind === 'short' || q.kind === 'number') && (
          <div>
            <label htmlFor={`${id}-i`} className="block text-xs font-mono uppercase mb-1 text-muted-foreground">Your answer</label>
            <input id={`${id}-i`} className={field} type={q.kind === 'number' ? 'text' : 'text'} inputMode={q.kind === 'number' ? 'decimal' : 'text'}
              value={typeof value === 'string' ? value : ''} onChange={(e) => change(e.target.value)} data-testid={`input-answer-${q.id}`} autoComplete="off" />
          </div>
        )}
        {q.kind === 'long' && (
          <div>
            <label htmlFor={`${id}-i`} className="block text-xs font-mono uppercase mb-1 text-muted-foreground">Written response</label>
            <textarea id={`${id}-i`} rows={isFinal ? 10 : 6} className={field} value={typeof value === 'string' ? value : ''}
              onChange={(e) => change(e.target.value)} data-testid={`input-answer-${q.id}`} aria-describedby={isFinal ? `${id}-wc` : undefined} />
            {isFinal && (
              <p id={`${id}-wc`} className={`mt-1 text-xs font-mono ${over ? 'text-destructive font-bold' : 'text-muted-foreground'}`} data-testid="text-wordcount">
                {words} / {FINAL_LIMIT} words{over ? ' - over the limit, trim before it can be saved' : ''}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          {keyed && (
            <button className={btn} disabled={pending || isEmpty(value)} onClick={() => send(value)} data-testid={`button-validate-${q.id}`}>
              {pending ? 'Saving...' : 'Save & validate'}
            </button>
          )}
          <p role="status" aria-live="polite" className="text-xs font-mono text-muted-foreground" data-testid={`status-save-${q.id}`}>
            {pending ? 'Saving...' : failed ? null : dirty ? (over ? 'Not saved: over word limit' : autosave ? 'Unsaved changes - autosaving shortly' : 'Not yet validated') : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : 'Nothing saved yet'}
            {failed && (
              <span className="text-destructive">Save failed. <button className="underline" onClick={() => send(latest.current)} data-testid={`button-retry-save-${q.id}`}>Retry</button></span>
            )}
          </p>
        </div>

        {status === 'correct' && <Banner icon={<CheckCircle2 />} tone="ok" text={`Correct. ${earned} points earned.`} fb={feedback} />}
        {status === 'incorrect' && <Banner icon={<XCircle />} tone="bad" text="Not correct. Retry as often as you like, with no penalty." fb={feedback} />}
        {status === 'manual' && <Banner icon={<Clock />} tone="warn" text="Saved. Pending instructor review." fb={q.manualReview ? undefined : feedback} />}
        {status === 'accepted' && <Banner icon={<CheckCircle2 />} tone="ok" text={`Accepted by your instructor. ${earned} points earned.`} fb={saved?.instructorNote ?? undefined} />}
        {status === 'denied' && <Banner icon={<XCircle />} tone="bad" text="Denied by your instructor. Revise your response using the feedback, then it is reviewed again." fb={saved?.instructorNote ?? undefined} />}
        {status === 'unkeyed' && <Banner icon={<CircleDashed />} tone="warn" text="Saved. Pending: no answer key is configured yet." fb={feedback} />}
        {!q.manualReview && saved?.instructorNote && <p className="text-sm bg-muted p-3"><span className="font-mono text-xs uppercase">Instructor note:</span> {saved.instructorNote}</p>}

        <p className="text-xs text-muted-foreground font-mono">Reference: {q.guideReference || 'none provided'}</p>
      </div>
    </article>
  );
}

function Banner({ icon, tone, text, fb }: { icon: React.ReactNode; tone: 'ok' | 'bad' | 'warn'; text: string; fb?: string }) {
  const c = tone === 'ok' ? 'border-[hsl(var(--ok))] text-[hsl(var(--ok))]' : tone === 'bad' ? 'border-destructive text-destructive' : 'border-[hsl(var(--warn))] text-[hsl(var(--warn))]';
  return (
    <div className={`border-l-4 ${c} bg-muted/50 p-3 flex gap-3 text-sm`} data-testid="banner-result">
      <span className="shrink-0">{icon}</span>
      <div><p className="font-semibold">{text}</p>{fb && <p className="text-foreground mt-1">{fb}</p>}</div>
    </div>
  );
}
