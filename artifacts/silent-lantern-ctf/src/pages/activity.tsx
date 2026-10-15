import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetLanternProgressQueryKey, useCreateLanternProgress, useGetLanternActivity, useGetLanternProgress,
  useUseLanternHint,
} from '@workspace/api-client-react';
import type { LanternProgress } from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, Check, Lightbulb, Lock } from 'lucide-react';
import { ErrorPanel, Eyebrow, PageSkeleton, Shell, btn, btnGhost, field } from '@/components/shell';
import { QuestionCard } from '@/components/question-card';
import { ArchivedResponses } from '@/components/archived-responses';
import { type Session, errMessage, errStatus, hasResponse, isDone, loadSession, orderedQuestions, reviewCounts, storeSession } from '@/lib/ctf';
import { clearCheckInDraft, loadCheckInDraft, loadLearnerProfile, storeCheckInDraft, type CheckInDraft } from '@/lib/check-in';

function Onboarding({ onDone }: { onDone: (s: Session) => void }) {
  const create = useCreateLanternProgress();
  const [f, setF] = useState(loadCheckInDraft);
  const [editDetails, setEditDetails] = useState(() => {
    const p = loadLearnerProfile();
    return !p || !f.firstName.trim() || !f.lastName.trim() || p.name !== f.name || p.email !== f.email || p.instructorEmail !== f.instructorEmail;
  });
  const [identityError, setIdentityError] = useState('');
  const change = (next: CheckInDraft) => {
    next = { ...next, name: `${next.firstName.trim()} ${next.lastName.trim()}`.trim() };
    setF(next); storeCheckInDraft(next); setIdentityError('');
  };
  const [roe, setRoe] = useState(false);
  const [resume, setResume] = useState('');
  const resumeRef = useRef<HTMLInputElement>(null);
  const team = Number(f.team);
  const teamOk = Number.isInteger(team) && team >= 1 && team <= 999;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.firstName.trim() || !f.lastName.trim() || f.name.trim().length > 140) {
      setIdentityError('Enter both first and last name, using no more than 140 characters in total.');
      setEditDetails(true);
      return;
    }
    if (!teamOk || !roe) return;
    storeCheckInDraft(f);
    const s: Session = { sessionId: f.sessionId, name: f.name.trim(), firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim(), instructorEmail: f.instructorEmail.trim(), teamNumber: team };
    create.mutate({ data: { sessionId: s.sessionId, name: s.name, email: s.email, instructorEmail: s.instructorEmail, teamNumber: team, roeAcknowledged: true } },
      { onSuccess: (p) => {
        const saved: Session = { ...s, sessionId: p.sessionId, name: p.name, email: p.email, instructorEmail: p.instructorEmail, teamNumber: p.teamNumber };
        storeSession(saved); clearCheckInDraft(); onDone(saved);
      } });
  };
  return (
    <div className="grid md:grid-cols-[1fr_1fr] gap-8 max-w-4xl rise">
      <form onSubmit={submit} className="bg-card border border-border p-6 space-y-4" aria-labelledby="ob-h">
        <Eyebrow>Analyst onboarding</Eyebrow>
        <h1 id="ob-h" className="font-display text-3xl font-bold">Check in to the mission</h1>
        <p className="text-sm text-muted-foreground">Enter your details once. We reuse them for every mission, save and instructor email draft.</p>
        {!editDetails && <div className="bg-muted p-3 space-y-1" data-testid="saved-learner-details">
          <p className="text-sm font-semibold">{f.name}</p>
          <p className="text-sm break-all">{f.email}</p>
          <p className="text-xs text-muted-foreground break-all">Instructor: {f.instructorEmail}</p>
          <button type="button" className="text-sm text-primary underline" onClick={() => setEditDetails(true)} data-testid="button-edit-learner-details">Edit details / different learner</button>
        </div>}
        {editDetails && ([['firstName', 'First name', 'text'], ['lastName', 'Last name', 'text'], ['email', 'Learner email address', 'email'], ['instructorEmail', 'Instructor email address', 'email']] as const).map(([k, l, t]) => (
          <div key={k}>
            <label htmlFor={`f-${k}`} className="block text-sm font-medium mb-1">{l}</label>
            <input id={`f-${k}`} name={k} required type={t} maxLength={t === 'text' ? 70 : 254} className={field} value={f[k]} data-testid={`input-${k}`}
              autoComplete={k === 'firstName' ? 'given-name' : k === 'lastName' ? 'family-name' : k === 'email' ? 'email' : 'off'}
              onChange={(e) => change({ ...f, [k]: e.target.value })} />
          </div>
        ))}
        <div>
          <label htmlFor="f-team" className="block text-sm font-medium mb-1">Team number (1 to 999)</label>
          <input id="f-team" required type="number" min={1} max={999} step={1} className={field} value={f.team} data-testid="input-teamNumber" onChange={(e) => change({ ...f, team: e.target.value })} />
        </div>
        <label className="flex gap-3 items-start text-sm border border-border p-3 cursor-pointer">
          <input type="checkbox" required checked={roe} onChange={(e) => setRoe(e.target.checked)} className="mt-1 accent-[hsl(var(--primary))]" data-testid="checkbox-roe" />
          <span>I have read the rules of engagement on the Mission page and agree to follow them.</span>
        </label>
        <p className="text-xs text-muted-foreground">Your details are remembered in this browser. Your name, emails and responses are saved for instructor review. Your team shares ONE saved submission. On another device, use your private resume link instead of checking in again. Share that link only with your teammates; anyone holding it can continue the team's session.</p>
        {identityError && <p role="alert" className="text-sm text-destructive">{identityError}</p>}
        {create.isError && <ErrorPanel title={errStatus(create.error) === 409 ? 'Team already has a submission' : 'Could not start'} message={errStatus(create.error) === 409
          ? `${errMessage(create.error, 'A submission already exists for this team.')} Each team shares one saved submission. Ask a teammate for the private resume link and use it instead of creating a new one.`
          : errMessage(create.error, 'The server rejected the details. Check the fields and retry.')} />}
        {create.isError && errStatus(create.error) === 409 && <button type="button" className={btnGhost} onClick={() => resumeRef.current?.focus()} data-testid="button-use-resume">Resume with a teammate's link</button>}
        <button className={btn} disabled={create.isPending || !roe || !teamOk} data-testid="button-start">{create.isPending ? 'Starting...' : 'Start activity'}</button>
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
    if (r) { const s = { sessionId: r, name: '', email: '', instructorEmail: '' }; storeSession(s); return s; }
    return loadSession();
  });
  const act = useGetLanternActivity();
  const sid = session?.sessionId ?? '';
  const prog = useGetLanternProgress(sid, { query: { enabled: !!session, queryKey: getGetLanternProgressQueryKey(sid), refetchInterval: 5000, staleTime: 0 } });
  const [idx, setIdx] = useState(0);
  const positioned = useRef(false);

  const qs = useMemo(() => (act.data ? orderedQuestions(act.data) : []), [act.data]);

  useEffect(() => {
    if (session && prog.data?.name) {
      const s = { sessionId: session.sessionId, name: prog.data.name, email: prog.data.email, instructorEmail: prog.data.instructorEmail, teamNumber: prog.data.teamNumber };
      storeSession(s);
      if (JSON.stringify(s) !== JSON.stringify(session)) setSession(s);
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
            <p className="font-mono text-xs uppercase tracking-widest text-white/60">{p.name || 'Analyst'} | Team {p.teamNumber}</p>
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
