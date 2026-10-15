import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetCtfProgressQueryKey, useCreateCtfProgress, useGetCtfActivity, useGetCtfProgress } from '@workspace/api-client-react';
import type { CtfActivity } from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, Check, FileWarning } from 'lucide-react';
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
  const create = useCreateCtfProgress();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', instructorEmail: '' });
  const [identityError, setIdentityError] = useState('');
  const [resume, setResume] = useState('');
  const [team, setTeam] = useState('');
  const resumeRef = useRef<HTMLInputElement>(null);
  const teamNo = Number(team);
  const teamOk = team.trim() !== '' && Number.isInteger(teamNo) && teamNo >= 1 && teamNo <= 9999;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const firstName = f.firstName.trim(), lastName = f.lastName.trim();
    const name = `${firstName} ${lastName}`;
    if (!firstName || !lastName || name.length > 140) {
      setIdentityError('Enter both first and last name, using no more than 140 characters in total.');
      return;
    }
    if (!teamOk) { setIdentityError('Enter a whole team number from 1 to 9999.'); return; }
    setIdentityError('');
    const s: Session = { sessionId: crypto.randomUUID(), firstName, lastName, name, email: f.email.trim(), instructorEmail: f.instructorEmail.trim(), teamNumber: teamNo };
    create.mutate({ data: { sessionId: s.sessionId, name: s.name, email: s.email, instructorEmail: s.instructorEmail, teamNumber: teamNo } },
      { onSuccess: (p) => { const saved: Session = { ...s, sessionId: p.sessionId ?? s.sessionId, teamNumber: p.teamNumber ?? teamNo }; storeSession(saved); onDone(saved); } });
  };
  return (
    <div className="grid md:grid-cols-[1fr_1fr] gap-8 max-w-4xl rise">
      <form onSubmit={submit} className="bg-card border border-border p-6 space-y-4" aria-labelledby="ob-h">
        <Eyebrow>Analyst onboarding</Eyebrow>
        <h1 id="ob-h" className="font-display text-3xl font-bold">Check in to the mission</h1>
        <p className="text-sm text-muted-foreground">Enter your details once before beginning. Returning learners can resume without entering them again.</p>
        {([['firstName', 'First name', 'text'], ['lastName', 'Last name', 'text'], ['email', 'Learner email address', 'email'], ['instructorEmail', 'Instructor email address', 'email']] as const).map(([k, l, t]) => (
          <div key={k}>
            <label htmlFor={`f-${k}`} className="block text-sm font-medium mb-1">{l}</label>
            <input id={`f-${k}`} name={k} required type={t} maxLength={t === 'text' ? 70 : 254} className={field} value={f[k]} data-testid={`input-${k}`}
              autoComplete={k === 'firstName' ? 'given-name' : k === 'lastName' ? 'family-name' : k === 'email' ? 'email' : 'off'}
              onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
        <div>
          <label htmlFor="f-team" className="block text-sm font-medium mb-1">Team number (1 to 9999)</label>
          <input id="f-team" required type="number" min={1} max={9999} step={1} className={field} value={team} data-testid="input-teamNumber" onChange={(e) => { setTeam(e.target.value); setIdentityError(''); }} />
        </div>
        <p className="text-xs text-muted-foreground">Your team shares ONE saved submission. Your name, emails and responses are saved for instructor review. A private resume key is stored in this browser. Share your private resume link only with your teammates; anyone holding it can view and continue the team's work.</p>
        {identityError && <p role="alert" className="text-sm text-destructive">{identityError}</p>}
        {create.isError && <ErrorPanel title={errStatus(create.error) === 409 ? 'Team already has a submission' : 'Could not start'} message={errStatus(create.error) === 409
          ? `${errMessage(create.error, 'A submission already exists for this team.')} Each team shares one saved submission. Ask a teammate for the private resume link and use it instead of creating a new one.`
          : errMessage(create.error, 'The server rejected the details. Check the fields and retry.')} />}
        {create.isError && errStatus(create.error) === 409 && <button type="button" className={btnGhost} onClick={() => resumeRef.current?.focus()} data-testid="button-use-resume">Resume with a teammate's link</button>}
        <button className={btn} disabled={create.isPending || !teamOk} data-testid="button-start">{create.isPending ? 'Starting...' : 'Start activity'}</button>
      </form>
      <div className="space-y-3 self-start bg-secondary text-secondary-foreground p-6">
        <h2 className="font-display text-xl font-bold">Returning analyst?</h2>
        <p className="text-sm text-white/70">Paste your team's private resume key (or open the resume link) to continue where you left off. Share that link only with your teammates.</p>
        <label htmlFor="resume" className="sr-only">Resume key</label>
        <input id="resume" ref={resumeRef} className={`${field} text-foreground font-mono`} value={resume} onChange={(e) => setResume(e.target.value)} placeholder="xxxxxxxx-xxxx-..." data-testid="input-resume" />
        <button className={btnGhost + ' text-foreground'} disabled={resume.trim().length < 8}
          onClick={() => { const s = { sessionId: resume.trim(), name: '', email: '', instructorEmail: '' }; storeSession(s); onDone(s); }} data-testid="button-resume">Resume session</button>
      </div>
    </div>
  );
}

export default function Activity() {
  const search = useSearch();
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(() => {
    const r = new URLSearchParams(window.location.search).get('resume');
    if (r) { const s = { sessionId: r, name: '', email: '', instructorEmail: '' }; storeSession(s); return s; }
    return loadSession();
  });
  const act = useGetCtfActivity();
  const sid = session?.sessionId ?? '';
  const prog = useGetCtfProgress(sid, { query: { enabled: !!session, queryKey: getGetCtfProgressQueryKey(sid), refetchInterval: 5000, staleTime: 0 } });
  const [idx, setIdx] = useState(0);
  const positioned = useRef(false);
  void search;

  const steps = useMemo(() => (act.data ? buildSteps(act.data) : []), [act.data]);
  const qMap = useMemo(() => new Map((act.data?.questions ?? []).map((q) => [q.id, q])), [act.data]);

  useEffect(() => {
    if (session && !session.name && prog.data?.name) {
      const s = { sessionId: session.sessionId, name: prog.data.name, email: prog.data.email, instructorEmail: prog.data.instructorEmail, teamNumber: prog.data.teamNumber };
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
            <p className="font-mono text-xs uppercase tracking-widest text-white/60">{p.name || 'Analyst'}{p.teamNumber ? ` | Team ${p.teamNumber}` : ''}</p>
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
