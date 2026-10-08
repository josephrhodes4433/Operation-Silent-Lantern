import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetLanternProgressQueryKey, useSaveLanternAnswer } from '@workspace/api-client-react';
import type { LanternAnswer, LanternAnswerResult, LanternProgress, LanternQuestion } from '@workspace/api-client-react';
import { CheckCircle2, CircleDashed, Clock, Lock, XCircle } from 'lucide-react';
import { btn, field } from '@/components/shell';
import { clearDraft, loadDraft, queueSave, sentenceCount, storeDraft } from '@/lib/ctf';

type Val = string | string[];
const isEmpty = (v: Val) => (Array.isArray(v) ? v.length === 0 : v.trim() === '');
const ser = (v: Val) => JSON.stringify(v);

export function QuestionCard({ q, sessionId, saved, locked }: { q: LanternQuestion; sessionId: string; saved?: LanternAnswer; locked?: string }) {
  const qc = useQueryClient();
  const save = useSaveLanternAnswer();
  const mutateRef = useRef(save.mutateAsync);
  mutateRef.current = save.mutateAsync;

  const [value, setValue] = useState<Val>(() => loadDraft(sessionId, q.id) ?? saved?.value ?? (q.kind === 'multiple' ? [] : ''));
  const [result, setResult] = useState<LanternAnswerResult | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(saved ? new Date(saved.updatedAt) : null);
  const [dirty, setDirty] = useState(() => loadDraft(sessionId, q.id) !== undefined);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<Val>(value);
  const dirtyRef = useRef(dirty);
  const mounted = useRef(true);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const keyed = q.correctAnswerAvailable && !q.manualReview;
  const sentences = typeof value === 'string' ? sentenceCount(value) : 0;

  const send = (v: Val) => {
    if (lockedRef.current) return;
    if (mounted.current) { setPending(true); setFailed(null); }
    void queueSave(`${sessionId}-${q.id}`, () => mutateRef.current({ sessionId, questionId: q.id, data: { value: v } }))
      .then((r) => {
        clearDraft(sessionId, q.id, v);
        if (mounted.current) {
          setResult(r); setPending(false); setSavedAt(new Date());
          if (ser(latest.current) === ser(v)) { setDirty(false); dirtyRef.current = false; }
        }
        qc.setQueryData<LanternProgress>(getGetLanternProgressQueryKey(sessionId), (old) => old && {
          ...old, totalPoints: r.totalPoints,
          answers: { ...old.answers, [String(q.id)]: { ...(old.answers[String(q.id)] ?? {}), value: v, correct: r.correct, earnedPoints: r.earnedPoints, status: r.status, updatedAt: new Date().toISOString() } as LanternAnswer },
        });
        qc.invalidateQueries({ queryKey: getGetLanternProgressQueryKey(sessionId) });
      })
      .catch((e: unknown) => {
        const m = (e as { data?: { error?: string; message?: string } } | null)?.data;
        if (mounted.current) { setPending(false); setFailed(m?.error || m?.message || 'Save failed.'); }
      });
  };

  const change = (v: Val) => {
    storeDraft(sessionId, q.id, v);
    setValue(v); latest.current = v; setDirty(true); dirtyRef.current = true;
    window.clearTimeout(timer.current); timer.current = window.setTimeout(() => send(v), 900);
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

  const status = dirty || isEmpty(value) ? undefined : result?.status ?? saved?.status;
  const feedback = result?.feedback;
  const earned = result?.earnedPoints ?? saved?.earnedPoints ?? 0;
  const id = `q-${q.id}`;

  return (
    <article className="bg-card border border-border rise" aria-labelledby={`${id}-p`} data-testid={`card-question-${q.id}`}>
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-muted/60">
        <span className="font-mono text-xs uppercase tracking-widest">{q.code}{q.isFlag ? ' | Flag' : ''} | {q.sectionTitle}</span>
        <span className="font-mono text-xs bg-secondary text-secondary-foreground px-2 py-1" data-testid={`text-points-${q.id}`}>{q.points} pts</span>
      </header>
      <div className="p-5 space-y-5">
        <p id={`${id}-p`} className="text-lg leading-snug font-medium">{q.prompt}</p>
        {q.format && <p className="text-sm text-muted-foreground font-mono" data-testid={`text-format-${q.id}`}>Format: {q.format}</p>}
        {q.isFinalSummary && <p className="text-sm text-muted-foreground border-l-2 border-accent pl-3">Write 6 to 8 sentences.</p>}
        {q.manualReview && <p className="text-sm text-muted-foreground border-l-2 border-accent pl-3">Written response. Saved for instructor review and scored manually.</p>}
        {!q.manualReview && !q.correctAnswerAvailable && <p className="text-sm text-muted-foreground border-l-2 border-accent pl-3">Answer key not yet configured. Your response will be saved and marked pending.</p>}
        {locked && <p role="note" className="flex gap-2 items-start text-sm border-l-4 border-[hsl(var(--warn))] bg-muted/50 p-3" data-testid={`locked-${q.id}`}><Lock size={16} className="shrink-0 mt-0.5" />{locked}</p>}

        {(q.kind === 'single' || q.kind === 'multiple') && (
          <fieldset className="space-y-2" disabled={!!locked}>
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
            <input id={`${id}-i`} className={field} type="text" disabled={!!locked} inputMode={q.kind === 'number' ? 'decimal' : 'text'}
              value={typeof value === 'string' ? value : ''} onChange={(e) => change(e.target.value)} data-testid={`input-answer-${q.id}`} autoComplete="off" />
          </div>
        )}
        {q.kind === 'long' && (
          <div>
            <label htmlFor={`${id}-i`} className="block text-xs font-mono uppercase mb-1 text-muted-foreground">Written response</label>
            <textarea id={`${id}-i`} rows={q.isFinalSummary ? 10 : 6} className={field} disabled={!!locked} value={typeof value === 'string' ? value : ''}
              onChange={(e) => change(e.target.value)} data-testid={`input-answer-${q.id}`} aria-describedby={q.isFinalSummary ? `${id}-wc` : undefined} />
            {q.isFinalSummary && (
              <p id={`${id}-wc`} className={`mt-1 text-xs font-mono ${sentences > 0 && (sentences < 6 || sentences > 8) ? 'text-[hsl(var(--warn))]' : 'text-muted-foreground'}`} data-testid="text-sentencecount">
                {sentences} sentences (target 6 to 8)
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          {keyed && (
            <button className={btn} disabled={pending || isEmpty(value) || !!locked} onClick={() => send(value)} data-testid={`button-validate-${q.id}`}>
              {pending ? 'Saving...' : 'Save & validate'}
            </button>
          )}
          <p role="status" aria-live="polite" className="text-xs font-mono text-muted-foreground" data-testid={`status-save-${q.id}`}>
            {pending ? 'Saving...' : failed ? null : dirty ? 'Unsaved changes - autosaving shortly' : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : 'Nothing saved yet'}
            {failed && (
              <span className="text-destructive">{failed} <button className="underline" onClick={() => send(latest.current)} data-testid={`button-retry-save-${q.id}`}>Retry</button></span>
            )}
          </p>
        </div>

        {status === 'correct' && <Banner icon={<CheckCircle2 />} tone="ok" text={`Correct. ${earned} points earned.`} fb={feedback} />}
        {status === 'incorrect' && <Banner icon={<XCircle />} tone="bad" text="Not correct. Retry as often as you like. Only hints cost points." fb={feedback} />}
        {status === 'manual' && <Banner icon={<Clock />} tone="warn" text="Saved. Awaiting instructor review." fb={feedback} />}
        {status === 'unkeyed' && <Banner icon={<CircleDashed />} tone="warn" text="Saved. Pending: no answer key is configured yet." fb={feedback} />}
        {saved?.instructorNote && <p className="text-sm bg-muted p-3"><span className="font-mono text-xs uppercase">Instructor note:</span> {saved.instructorNote}</p>}

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
