import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetCtfProgressQueryKey, useCreateCtfProgress, getGetCtfWindowQueryKey, useGetCtfActivity, useGetCtfProgress } from '@workspace/api-client-react';
import type { CtfActivity } from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, Check, FileWarning } from 'lucide-react';
import { useActivityWindow, isArchivedSession } from '@/lib/window';
import { ArchivedNotice } from '@/components/window-gate';
import { ErrorPanel, Eyebrow, PageSkeleton, Shell, btn, btnGhost, field } from '@/components/shell';
import { QuestionCard } from '@/components/question-card';
import { type Session, errMessage, errStatus, finalQuestionId, hasResponse, isDone, loadSession, orderedQuestions, reviewCounts, storeSession } from '@/lib/ctf';

type Step = { kind: 'q'; qid: number; section: number } | { kind: 'gap'; section: number };

function buildSteps(a: CtfActivity): Step[] {
  const qs = orderedQuestions(a);
  return [...a.sections].sort((x, y) => x.id - y.id).flatMap<Step>((s) => {
    const mine = qs.filter((q) => q.section === s.id);
    return mine.length ? mine.map((q) => ({ kind: 'q', qid: q.id, section: s.id })) : [{ kind: 'gap', section: s.id }];
  });
}

function Onboarding({ onDone }: { onDone: (s: Session) => void }) {
  const qc = useQueryClient();
  const create = useCreateCtfProgress();
  const [team, setTeam] = useState('');
  const [instructor, setInstructor] = useState('');
  const [resume, setResume] = useState('');
  const resumeRef = useRef<HTMLInputElement>(null);
  const teamName = team.trim(), instructorName = instructor.trim();
  const ok = teamName.length > 0 && teamName.length <= 60 && instructorName.length > 0 && instructorName.length <= 140;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    const sessionId = crypto.randomUUID();
    create.mutate({ data: { sessionId, teamName, instructorName } }, {
      onSuccess: async (p) => {
        // Refresh the shared window first so the new session is never mistaken for an earlier one.
        await qc.invalidateQueries({ queryKey: getGetCtfWindowQueryKey() });
        const saved: Session = { sessionId: p.sessionId, teamName: p.teamName, instructorName: p.instructorName };
        storeSession(saved); onDone(saved);
      },
      onError: (err) => { if (errStatus(err) === 423) void qc.invalidateQueries({ queryKey: getGetCtfWindowQueryKey() }); },
    });
  };
  const status = create.isError ? errStatus(create.error) : undefined;
  return (
    <div className="grid md:grid-cols-[1fr_1fr] gap-8 max-w-4xl rise">
      <form onSubmit={submit} className="bg-card border border-border p-6 space-y-4" aria-labelledby="ob-h" autoComplete="off">
        <Eyebrow>Team check-in</Eyebrow>
        <h1 id="ob-h" className="font-display text-3xl font-bold">Begin activity</h1>
        <p className="text-sm text-muted-foreground">Two details only: your team name and your instructor's name. No personal profile is collected.</p>
        <div>
          <label htmlFor="f-team" className="block text-sm font-medium mb-1">Team name</label>
          <input id="f-team" required type="text" maxLength={60} autoComplete="off" placeholder="e.g. Night Watch" className={field} value={team} data-testid="input-teamName" onChange={(e) => setTeam(e.target.value)} />
        </div>
        <div>
          <label htmlFor="f-instructor" className="block text-sm font-medium mb-1">Instructor name</label>
          <input id="f-instructor" required type="text" maxLength={140} autoComplete="off" className={field} value={instructor} data-testid="input-instructorName" onChange={(e) => setInstructor(e.target.value)} />
          <p className="text-xs text-muted-foreground mt-1">The staff member running your class.</p>
        </div>
        <p className="text-xs text-muted-foreground" data-testid="text-privacy-notice">Do not enter real learner, customer or case information anywhere in this activity, including written responses. Use fictional or generic details. Your team shares ONE saved submission, tied to a private resume key stored in this browser. Share the resume link only with your teammates; anyone holding it can continue the team's session.</p>
        {create.isError && (status === 423
          ? <ErrorPanel title="Activity window is closed" message="The shared window has ended or changed. Checking the clock now." />
          : <ErrorPanel title={status === 409 ? 'Team already has a submission' : 'Could not start'} message={status === 409
            ? `${errMessage(create.error, 'A submission already exists for this team.')} Each team shares one saved submission. Ask a teammate for the private resume link and use it instead of creating a new one.`
            : errMessage(create.error, 'The server rejected the details. Check the fields and retry.')} />)}
        {status === 409 && <button type="button" className={btnGhost} onClick={() => resumeRef.current?.focus()} data-testid="button-use-resume">Resume with a teammate's link</button>}
        <button className={btn} disabled={create.isPending || !ok} data-testid="button-start">{create.isPending ? 'Starting...' : 'Start activity'}</button>
      </form>
      <div className="space-y-3 self-start bg-secondary text-secondary-foreground p-6">
        <h2 className="font-display text-xl font-bold">Returning analyst?</h2>
        <p className="text-sm text-white/70">Paste your team's private resume key (or open the resume link) to continue where you left off. Share that link only with your teammates.</p>
        <label htmlFor="resume" className="sr-only">Resume key</label>
        <input id="resume" ref={resumeRef} autoComplete="off" className={`${field} text-foreground font-mono`} value={resume} onChange={(e) => setResume(e.target.value)} placeholder="xxxxxxxx-xxxx-..." data-testid="input-resume" />
        <button className={btnGhost + ' text-foreground'} disabled={resume.trim().length < 8}
          onClick={() => { const s: Session = { sessionId: resume.trim() }; storeSession(s); onDone(s); }} data-testid="button-resume">Resume session</button>
      </div>
    </div>
  );
}

export default function Activity() {
  const search = useSearch();
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(() => {
    const r = new URLSearchParams(window.location.search).get('resume');
    if (r) { const s = { sessionId: r }; storeSession(s); return s; }
    return loadSession();
  });
  const act = useGetCtfActivity();
  const win = useActivityWindow();
  const sid = session?.sessionId ?? '';
  const prog = useGetCtfProgress(sid, { query: { enabled: !!session, queryKey: getGetCtfProgressQueryKey(sid), refetchInterval: 5000, staleTime: 0 } });
  const [idx, setIdx] = useState(0);
  const positioned = useRef(false);
  void search;

  const steps = useMemo(() => (act.data ? buildSteps(act.data) : []), [act.data]);
  const qMap = useMemo(() => new Map((act.data?.questions ?? []).map((q) => [q.id, q])), [act.data]);

  useEffect(() => {
    if (session && prog.data && (session.teamName !== prog.data.teamName || session.instructorName !== prog.data.instructorName)) {
      const s: Session = { sessionId: session.sessionId, teamName: prog.data.teamName, instructorName: prog.data.instructorName };
      storeSession(s); setSession(s);
    }
  }, [prog.data, session]);

  useEffect(() => {
    if (positioned.current || !prog.data || !steps.length) return;
    positioned.current = true;
    const target = Number(new URLSearchParams(window.location.search).get('flag'));
    const selected = steps.findIndex(s => s.kind === 'q' && s.qid === target);
    const first = selected >= 0 ? selected : steps.findIndex((s) => s.kind === 'q' && !hasResponse(prog.data!.answers[String(s.qid)]));
    setIdx(first === -1 ? 0 : first);
  }, [prog.data, steps]);

  const header = (
    <div className="mb-6"><Eyebrow>Activity</Eyebrow></div>
  );

  if (!session) return <Shell>{header}<Onboarding onDone={setSession} /></Shell>;
  if (act.isLoading || prog.isLoading) return <Shell><PageSkeleton /></Shell>;
  if (act.isError || !act.data) return <Shell><ErrorPanel title="Activity unavailable" onRetry={() => act.refetch()} /></Shell>;
  if (prog.isError || !prog.data) {
    return (
      <Shell>
        <ErrorPanel title="Saved session not found" message="We could not load progress for this key. Retry, or start a new session." onRetry={() => prog.refetch()} />
        <button className={btnGhost + ' mt-4'} onClick={() => { storeSession(null); setSession(null); }} data-testid="button-reset-session">Start a new session</button>
      </Shell>
    );
  }

  if (isArchivedSession(prog.data.windowId, win.window)) return <Shell><ArchivedNotice onNew={() => { storeSession(null); setSession(null); }} /></Shell>;

  const a = act.data, p = prog.data;
  const step = steps[Math.min(idx, steps.length - 1)];
  const finalId = finalQuestionId(a);
  const total = a.questions.length;
  const doneCount = a.questions.filter((q) => isDone(q, p.answers[String(q.id)])).length;
  const pct = total ? Math.round((doneCount / total) * 1000) / 10 : 0;
  const rc = reviewCounts(a.questions, p.answers);
  const incomplete = a.questions.filter((q) => !hasResponse(p.answers[String(q.id)])).map((q) => q.id);
  const q = step?.kind === 'q' ? qMap.get(step.qid) : undefined;
  const section = a.sections.find((s) => s.id === step?.section);

  return (
    <Shell>
      <div className="grid lg:grid-cols-[280px_1fr] gap-8">
        <aside className="space-y-4 lg:sticky lg:top-4 self-start" aria-label="Progress">
          <div className="bg-secondary text-secondary-foreground p-4 space-y-3">
            <p className="font-mono text-xs uppercase tracking-widest text-white/60 break-words">{p.teamName} | {p.instructorName}</p>
            <p className="font-display text-3xl font-bold" data-testid="text-score">{p.totalPoints}<span className="text-base text-white/60"> / {a.totalPoints} pts</span></p>
            <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Correct or accepted" className="h-2 bg-white/15"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
            <p className="text-xs text-white/70" data-testid="text-progress">{p.answeredCount} of {total} answered</p>
            <p className="text-xs text-white/70" data-testid="text-complete">{doneCount} of {total} correct or accepted ({pct}%)</p>
            <p role="status" aria-live="polite" className="text-xs text-white/80" data-testid="text-review-summary">
              {rc.pending || rc.denied ? `${rc.pending} awaiting instructor review | ${rc.denied} denied, needs revision` : 'No written responses waiting on review.'}
            </p>
          </div>
          <nav aria-label="Sections" className="bg-card border border-border">
            {[...a.sections].sort((x, y) => x.id - y.id).map((s) => {
              const at = steps.findIndex((t) => t.section === s.id);
              const mine = a.questions.filter((x) => x.section === s.id);
              const done = mine.filter((x) => isDone(x, p.answers[String(x.id)])).length;
              const cur = step?.section === s.id;
              return (
                <button key={s.id} onClick={() => setIdx(at)} aria-current={cur ? 'step' : undefined} data-testid={`button-section-${s.id}`}
                  className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 border-border flex items-center gap-3 text-sm ${cur ? 'bg-primary/10 font-semibold' : 'hover:bg-muted'}`}>
                  <span className="font-mono text-xs text-primary">{String(s.id).padStart(2, '0')}</span>
                  <span className="flex-1">{s.title}</span>
                  {mine.length === 0 ? <FileWarning size={14} className="text-[hsl(var(--warn))]" aria-label="No source content" /> :
                    done === mine.length ? <Check size={14} className="text-[hsl(var(--ok))]" aria-label="Complete" /> : <span className="font-mono text-xs">{done}/{mine.length}</span>}
                </button>
              );
            })}
          </nav>
          <Link href="/results" className={btnGhost + ' w-full'} data-testid="link-to-results">View results</Link>
        </aside>

        <div className="space-y-5 min-w-0">
          {section && (
            <div className="border-l-4 border-primary pl-4">
              <Eyebrow>Section {section.id} | {section.time}</Eyebrow>
              <h1 className="font-display text-2xl font-bold">{section.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{section.inject}</p>
            </div>
          )}
          {step?.kind === 'gap' && (
            <div role="note" className="bg-card border border-dashed border-[hsl(var(--warn))] p-8 space-y-2" data-testid="panel-content-gap">
              <FileWarning className="text-[hsl(var(--warn))]" />
              <h2 className="font-display text-xl font-bold">Source-content gap</h2>
              <p className="text-muted-foreground">The source document has no question content for this section, so there is nothing to answer here. No questions have been invented. Continue to the next section.</p>
            </div>
          )}
          {q && <QuestionCard key={q.id} q={q} sessionId={p.sessionId} saved={p.answers[String(q.id)]} isFinal={q.id === finalId} />}
          <div className="flex justify-between gap-3">
            <button className={btnGhost} disabled={idx <= 0} onClick={() => setIdx(idx - 1)} data-testid="button-prev"><ArrowLeft size={16} /> Previous</button>
            {idx < steps.length - 1
              ? <button className={btn} onClick={() => setIdx(idx + 1)} data-testid="button-next">Next <ArrowRight size={16} /></button>
              : <Link href="/results" className={btn} data-testid="button-finish">Review and finish <ArrowRight size={16} /></Link>}
          </div>
          <p className="text-xs text-muted-foreground font-mono" data-testid="text-incomplete">
            {incomplete.length ? `Incomplete: flags ${incomplete.join(', ')}` : 'All questions have a saved response.'}
          </p>
          <button className="text-xs underline text-muted-foreground" onClick={() => qc.invalidateQueries({ queryKey: getGetCtfProgressQueryKey(sid) })} data-testid="button-refresh">Refresh saved progress</button>
        </div>
      </div>
    </Shell>
  );
}
