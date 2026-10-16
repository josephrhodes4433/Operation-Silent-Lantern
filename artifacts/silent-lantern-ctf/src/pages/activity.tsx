import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetLanternProgressQueryKey, useCreateLanternProgress, getGetLanternWindowQueryKey, useGetLanternActivity, useGetLanternProgress,
  useUseLanternHint,
} from '@workspace/api-client-react';
import type { LanternProgress } from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, Check, Lightbulb, Lock } from 'lucide-react';
import { useActivityWindow, isArchivedSession } from '@/lib/window';
import { ArchivedNotice } from '@/components/window-gate';
import { ErrorPanel, Eyebrow, PageSkeleton, Shell, btn, btnGhost, field } from '@/components/shell';
import { QuestionCard } from '@/components/question-card';
import { ArchivedResponses } from '@/components/archived-responses';
import { type Session, errMessage, errStatus, hasResponse, isDone, loadSession, orderedQuestions, reviewCounts, storeSession } from '@/lib/ctf';

function Onboarding({ onDone }: { onDone: (s: Session) => void }) {
  const qc = useQueryClient();
  const create = useCreateLanternProgress();
  const [team, setTeam] = useState('');
  const [instructor, setInstructor] = useState('');
  const [resume, setResume] = useState('');
  const [roe, setRoe] = useState(false);
  const resumeRef = useRef<HTMLInputElement>(null);
  const teamName = team.trim(), instructorName = instructor.trim();
  const ok = teamName.length > 0 && teamName.length <= 60 && instructorName.length > 0 && instructorName.length <= 140 && roe;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    const sessionId = crypto.randomUUID();
    create.mutate({ data: { sessionId, teamName, instructorName, roeAcknowledged: true as const } }, {
      onSuccess: async (p) => {
        // Refresh the shared window first so the new session is never mistaken for an earlier one.
        await qc.invalidateQueries({ queryKey: getGetLanternWindowQueryKey() });
        const saved: Session = { sessionId: p.sessionId, teamName: p.teamName, instructorName: p.instructorName };
        storeSession(saved); onDone(saved);
      },
      onError: (err) => { if (errStatus(err) === 423) void qc.invalidateQueries({ queryKey: getGetLanternWindowQueryKey() }); },
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
        <label className="flex gap-3 items-start text-sm border border-border p-3 cursor-pointer">
          <input type="checkbox" required checked={roe} onChange={(e) => setRoe(e.target.checked)} className="mt-1 accent-[hsl(var(--primary))]" data-testid="checkbox-roe" />
          <span>I have read the rules of engagement on the Mission page and agree to follow them.</span>
        </label>
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

function HintPanel({ p, missionId }: { p: LanternProgress; missionId: number }) {
  const qc = useQueryClient();
  const hint = useUseLanternHint();
  const [msg, setMsg] = useState<string | null>(null);
  const mine = p.hints.find((h) => h.missionId === missionId);
  const left = 3 - p.hints.length;
  const buy = () => {
    if (!window.confirm('Use a hint for this mission? It costs 2 points. You have 3 hint tokens in total and each mission allows one hint.')) return;
    setMsg(null);
    hint.mutate({ sessionId: p.sessionId, missionId }, {
      onSuccess: (np) => qc.setQueryData(getGetLanternProgressQueryKey(p.sessionId), np),
      onError: (e) => setMsg(errMessage(e, 'The hint could not be used.')),
    });
  };
  return (
    <div className="bg-card border border-border p-4 space-y-2" data-testid="panel-hint">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Hints | {left} of 3 tokens left | -2 points each</p>
      {mine ? <p className="text-sm border-l-2 border-accent pl-3" data-testid="text-hint">{mine.text}</p> :
        <button className={btnGhost} disabled={hint.isPending || left <= 0} onClick={buy} data-testid="button-hint"><Lightbulb size={16} /> {hint.isPending ? 'Requesting...' : 'Use hint (-2 points)'}</button>}
      {!mine && left <= 0 && <p className="text-xs text-muted-foreground">All hint tokens are spent.</p>}
      {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
    </div>
  );
}

export default function Activity() {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(() => {
    const r = new URLSearchParams(window.location.search).get('resume');
    if (r) { const s = { sessionId: r }; storeSession(s); return s; }
    return loadSession();
  });
  const act = useGetLanternActivity();
  const win = useActivityWindow();
  const sid = session?.sessionId ?? '';
  const prog = useGetLanternProgress(sid, { query: { enabled: !!session, queryKey: getGetLanternProgressQueryKey(sid), refetchInterval: 5000, staleTime: 0 } });
  const [idx, setIdx] = useState(0);
  const positioned = useRef(false);

  const qs = useMemo(() => (act.data ? orderedQuestions(act.data) : []), [act.data]);

  useEffect(() => {
    if (session && prog.data && (session.teamName !== prog.data.teamName || session.instructorName !== prog.data.instructorName)) {
      const s: Session = { sessionId: session.sessionId, teamName: prog.data.teamName, instructorName: prog.data.instructorName };
      storeSession(s); setSession(s);
    }
  }, [prog.data, session]);

  useEffect(() => {
    if (positioned.current || !prog.data || !qs.length) return;
    positioned.current = true;
    const unlocked = prog.data.unlockedMission;
    const gate = prog.data.reviewGateQuestionId;
    const accessible = (q: typeof qs[number]) => q.section <= unlocked && (gate === null || q.id <= gate);
    const target = Number(new URLSearchParams(window.location.search).get('flag'));
    const selected = qs.findIndex((q) => q.id === target && accessible(q));
    const first = qs.findIndex((q) => accessible(q) && !hasResponse(prog.data!.answers[String(q.id)]));
    const pendingReview = qs.findIndex(q => q.id === gate && accessible(q));
    setIdx(selected >= 0 ? selected : first >= 0 ? first : pendingReview >= 0 ? pendingReview : 0);
  }, [prog.data, qs]);

  useEffect(() => {
    if (!prog.data || !qs.length) return;
    const p = prog.data;
    setIdx(old => {
      const q = qs[old];
      if (!q || (q.section <= p.unlockedMission && (p.reviewGateQuestionId === null || q.id <= p.reviewGateQuestionId))) return old;
      const gate = qs.findIndex(q => q.id === p.reviewGateQuestionId && q.section <= p.unlockedMission);
      return gate >= 0 ? gate : 0;
    });
  }, [prog.data?.reviewGateQuestionId, prog.data?.unlockedMission, qs]);

  if (!session) return <Shell><div className="mb-6"><Eyebrow>Activity</Eyebrow></div><Onboarding onDone={setSession} /></Shell>;
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
  const unlocked = p.unlockedMission;
  const cur = qs[Math.min(idx, qs.length - 1)];
  const total = a.questions.length;
  const doneCount = a.questions.filter((q) => isDone(q, p.answers[String(q.id)])).length;
  const pct = total ? Math.round((doneCount / total) * 1000) / 10 : 0;
  const rc = reviewCounts(a.questions, p.answers);
  const incomplete = a.questions.filter((q) => !hasResponse(p.answers[String(q.id)])).map((q) => q.code);
  const section = a.sections.find((s) => s.id === cur?.section);
  const nextIdx = idx + 1;
  const reviewLocked = nextIdx < qs.length && p.reviewGateQuestionId !== null && qs[nextIdx].id > p.reviewGateQuestionId;
  const nextLocked = reviewLocked || (nextIdx < qs.length && qs[nextIdx].section > unlocked);
  const missionLocked = (m: number) => m > unlocked || (p.reviewGateQuestionId !== null && (qs.find(q => q.section === m)?.id ?? 0) > p.reviewGateQuestionId);
  const qLocked = cur && p.reviewGateQuestionId !== null && cur.id > p.reviewGateQuestionId
    ? 'An earlier written response needs instructor approval before you can answer this question.'
    : undefined;

  return (
    <Shell>
      <div className="grid lg:grid-cols-[280px_1fr] gap-8">
        <aside className="space-y-4 lg:sticky lg:top-4 self-start" aria-label="Progress">
          <div className="bg-secondary text-secondary-foreground p-4 space-y-3">
            <p className="font-mono text-xs uppercase tracking-widest text-white/60 break-words">{p.teamName} | {p.instructorName}</p>
            <p className="font-display text-3xl font-bold" data-testid="text-score">{p.totalPoints}<span className="text-base text-white/60"> / {a.totalPoints} pts</span></p>
            <p className="text-xs text-white/70" data-testid="text-adjust">Hints -{p.penaltyPoints} | speed +{p.speedBonus} | tradecraft +{p.tradecraftBonus}</p>
            <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Correct or accepted" className="h-2 bg-white/15"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
            <p className="text-xs text-white/70" data-testid="text-progress">{p.answeredCount} of {total} answered</p>
            <p className="text-xs text-white/70" data-testid="text-complete">{doneCount} of {total} correct or accepted ({pct}%)</p>
            <p role="status" aria-live="polite" className="text-xs text-white/80" data-testid="text-review-summary">
              {rc.pending || rc.denied ? `${rc.pending} awaiting instructor review | ${rc.denied} denied, needs revision` : 'No written responses waiting on review.'}
            </p>
            <p className="text-xs text-white/70" data-testid="text-unlocked">{unlocked >= 7 ? 'All missions cleared' : `Mission ${unlocked} unlocked`}</p>
            {p.reviewGateQuestionId !== null && p.answers[String(p.reviewGateQuestionId)] && <p className="text-xs text-white/80" data-testid="text-review-gate">
              {p.answers[String(p.reviewGateQuestionId)].reviewStatus === 'denied' ? 'Written response denied. Read the feedback, revise and resubmit.' : 'Written response waiting for instructor review.'}
            </p>}
          </div>
          <nav aria-label="Missions" className="bg-card border border-border">
            {[...a.sections].sort((x, y) => x.id - y.id).map((s) => {
              const at = qs.findIndex((t) => t.section === s.id);
              const mine = a.questions.filter((x) => x.section === s.id);
              const done = mine.filter((x) => isDone(x, p.answers[String(x.id)])).length;
              const on = cur?.section === s.id;
              const lock = missionLocked(s.id);
              return (
                <button key={s.id} disabled={lock} onClick={() => setIdx(at)} aria-current={on ? 'step' : undefined} data-testid={`button-section-${s.id}`}
                  className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 border-border flex items-center gap-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed ${on ? 'bg-primary/10 font-semibold' : lock ? '' : 'hover:bg-muted'}`}>
                  <span className="font-mono text-xs text-primary">{String(s.id).padStart(2, '0')}</span>
                  <span className="flex-1">{s.title}</span>
                  {lock ? <Lock size={14} aria-label="Locked" /> : done === mine.length ? <Check size={14} className="text-[hsl(var(--ok))]" aria-label="Complete" /> : <span className="font-mono text-xs">{done}/{mine.length}</span>}
                </button>
              );
            })}
          </nav>
          <Link href="/results" className={btnGhost + ' w-full'} data-testid="link-to-results">View results</Link>
        </aside>

        <div className="space-y-5 min-w-0">
           <ArchivedResponses progress={p} />
          {section && (
            <div className="border-l-4 border-primary pl-4">
              <Eyebrow>Mission {section.id} | {section.time}</Eyebrow>
              <h1 className="font-display text-2xl font-bold">{section.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{section.inject}</p>
            </div>
          )}
          {cur && <HintPanel key={`h-${cur.section}-${p.hints.length}`} p={p} missionId={cur.section} />}
          {cur && <QuestionCard key={cur.id} q={cur} sessionId={p.sessionId} saved={p.answers[String(cur.id)]} locked={qLocked} />}
          <div className="flex justify-between gap-3">
            <button className={btnGhost} disabled={idx <= 0} onClick={() => setIdx(idx - 1)} data-testid="button-prev"><ArrowLeft size={16} /> Previous</button>
            {idx < qs.length - 1
              ? <button className={btn} disabled={nextLocked} onClick={() => setIdx(idx + 1)} data-testid="button-next">{nextLocked ? <><Lock size={16} /> {reviewLocked ? 'Instructor approval required' : "Capture this mission's flag"}</> : <>Next <ArrowRight size={16} /></>}</button>
              : p.reviewGateQuestionId !== null ? <button className={btn} disabled data-testid="button-finish"><Lock size={16} /> Instructor approval required</button>
              : <Link href="/results" className={btn} data-testid="button-finish">Review and finish <ArrowRight size={16} /></Link>}
          </div>
          <p className="text-xs text-muted-foreground font-mono" data-testid="text-incomplete">
            {incomplete.length ? `Incomplete: ${incomplete.join(', ')}` : 'All questions have a saved response.'}
          </p>
          <button className="text-xs underline text-muted-foreground" onClick={() => qc.invalidateQueries({ queryKey: getGetLanternProgressQueryKey(sid) })} data-testid="button-refresh">Refresh saved progress</button>
        </div>
      </div>
    </Shell>
  );
}
