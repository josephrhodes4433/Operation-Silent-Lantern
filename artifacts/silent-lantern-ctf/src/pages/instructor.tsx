import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetLanternActivityQueryKey, getGetLanternInstructorKeysQueryKey, getGetLanternInstructorSubmissionQueryKey, getListLanternSubmissionsQueryKey,
  useAdjustLanternScore, useGetLanternActivity, useGetLanternInstructorKeys, useGetLanternInstructorSubmission,
  useListLanternSubmissions, useSetLanternInstructorKey, useVerifyLanternInstructor,
  useGetLanternWrittenHistory, getGetLanternWrittenHistoryQueryKey,
  useGetLanternInstructorAnswerGuide, getGetLanternInstructorAnswerGuideQueryKey,
} from '@workspace/api-client-react';
import type { LanternQuestion } from '@workspace/api-client-react';
import { AnswerGuide } from '@/components/answer-guide';
import { Lock } from 'lucide-react';
import { ErrorPanel, Eyebrow, PageSkeleton, Shell, btn, btnGhost, field } from '@/components/shell';
import { asText, errMessage, errStatus, hasResponse, outcome } from '@/lib/ctf';
import { ReviewActions } from '@/components/review-actions';
import { ReviewQueue } from '@/components/review-queue';
import { CompletionsPanel, SignalsBar, useNotificationData, useQueueData } from '@/components/instructor-signals';
import { WrittenComparison } from '@/components/written-comparison';
import { ArchivedResponses } from '@/components/archived-responses';

type Headers = Record<string, string>;

export default function Instructor() {
  const qc = useQueryClient();
  const [code, setCode] = useState<string | null>(null); // memory only
  const lock = () => {
    setCode(null);
    // Do not leave private submission/history data available to a later login.
    qc.cancelQueries();
    qc.clear();
  };
  return <Shell>{code ? <Console code={code} onLock={lock} /> : <Gate onOk={setCode} />}</Shell>;
}

function Gate({ onOk }: { onOk: (c: string) => void }) {
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const verify = useVerifyLanternInstructor();
  const go = (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    verify.mutate({ data: { code: input } }, {
      onSuccess: (r) => (r.valid ? onOk(input) : setMsg('That code was not accepted.')),
      onError: (er) => setMsg([501, 503].includes(errStatus(er) ?? 0)
        ? 'Instructor access is not configured on this server. Set the CTF_INSTRUCTOR_CODE secret and reload. Access stays closed until then.'
        : errStatus(er) === 401 || errStatus(er) === 403 ? 'That code was not accepted.' : 'Could not verify the code. Check the connection and retry.'),
    });
  };
  return (
    <form onSubmit={go} className="max-w-md mx-auto bg-secondary text-secondary-foreground p-8 space-y-4 rise" data-testid="form-verify">
      <Lock className="text-accent" />
      <h1 className="font-display text-3xl font-bold">Instructor access</h1>
      <p className="text-sm text-white/70">Enter the access code configured for this deployment. It is held in memory only and cleared on reload.</p>
      <label htmlFor="code" className="block text-sm">Access code</label>
      <input id="code" type="password" required autoComplete="off" className={`${field} text-foreground`} value={input} onChange={(e) => setInput(e.target.value)} data-testid="input-code" />
      {msg && <p role="alert" className="text-sm bg-destructive/20 border-l-4 border-destructive p-3" data-testid="text-gate-error">{msg}</p>}
      <button className={btn} disabled={verify.isPending} data-testid="button-verify">{verify.isPending ? 'Verifying...' : 'Unlock'}</button>
    </form>
  );
}

function Console({ code, onLock }: { code: string; onLock: () => void }) {
  const [tab, setTab] = useState<'guide' | 'keys' | 'subs' | 'queue' | 'notes'>('guide');
  const queue = useQueueData(code, 'time_asc');
  const notes = useNotificationData(code);
  const pending = queue.data?.length ?? 0;
  const unread = (notes.data ?? []).filter((n) => !n.readAt).length;
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div><Eyebrow>Instructor console</Eyebrow><h1 className="font-display text-3xl font-bold">Keys and submissions</h1></div>
        <button className={btnGhost} onClick={onLock} data-testid="button-lock">Lock</button>
      </div>
      <SignalsBar pending={pending} pendingState={queue.data ? 'ready' : queue.isError ? 'error' : 'loading'} unread={unread} onQueue={() => setTab('queue')} onNotes={() => setTab('notes')} />
      <div role="tablist" className="flex flex-wrap border-b border-border">
        {([['queue', `Review queue (${pending})`], ['notes', `Completions (${unread} new)`], ['guide', 'Answer guide'], ['keys', 'Edit grading keys'], ['subs', 'Submissions']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
            className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>{l}</button>
        ))}
      </div>
      {tab === 'queue' ? <ReviewQueue code={code} /> : tab === 'notes' ? <CompletionsPanel code={code} /> : tab === 'guide' ? <Guide code={code} /> : tab === 'keys' ? <Keys code={code} /> : <Subs code={code} />}
    </div>
  );
}

function Keys({ code }: { code: string }) {
  const headers = { 'x-instructor-code': code };
  const act = useGetLanternActivity();
  const keys = useGetLanternInstructorKeys({ query: { enabled: true, queryKey: getGetLanternInstructorKeysQueryKey() }, request: { headers } });
  if (act.isLoading || keys.isLoading) return <PageSkeleton />;
  if (act.isError || keys.isError || !act.data) return <ErrorPanel title="Could not load keys" message={errStatus(keys.error) === 401 ? 'Access code rejected.' : undefined} onRetry={() => { act.refetch(); keys.refetch(); }} />;
  const qs = act.data.questions.filter((q) => q.keyMode === 'dataset').sort((a, b) => a.id - b.id);
  const map = new Map((keys.data ?? []).map((k) => [k.questionId, k.acceptedAnswers]));
  return (
    <div className="space-y-4">
      <p role="note" className="text-sm border-l-4 border-accent bg-card p-4">Triage setup: use the instructor-kit iPhone 8, not the ZTE. For the beta, demonstrate the workflow and share the saved report; learners do not need their own kits for this step. Start with an offline profile matching the kit's actual IMEI, or pre-test an expanded profile against known planted contact/message indicators and Major/Minor priorities. Check the first actual Major row before setting the FLAG-02 reference; do not assume an IMEI must always be first. No shared kit content is guaranteed. Keep the ZTE's separate UFED Classic mission. Configure the courier alias from the same iPhone. For M6-FLAG06, enter only the watchlist keyword, one variant per line—not a full TPL. Each learner's own SIM IMSI is reviewed individually, never configured as a class-wide key. Existing keys are retained; verify them against the current demonstration.</p>
      {!qs.length ? <p className="bg-card border border-dashed p-8 text-center">No dataset-keyed questions in this activity.</p> :
        <ul className="space-y-3">{qs.map((q) => <KeyRow key={q.id} q={q} headers={headers} initial={map.get(q.id) ?? []} />)}</ul>}
    </div>
  );
}

function KeyRow({ q, headers, initial }: { q: LanternQuestion; headers: Headers; initial: string[] }) {
  const qc = useQueryClient();
  const set = useSetLanternInstructorKey({ request: { headers } });
  const [text, setText] = useState(initial.join('\n'));
  const [ok, setOk] = useState(false);
  const list = text.split('\n').map((s) => s.trim()).filter(Boolean);
  return (
    <li className="bg-card border border-border p-4 space-y-2" data-testid={`row-key-${q.id}`}>
      <p className="text-sm"><span className="font-mono text-xs text-primary">{q.code}</span> | {q.sectionTitle} | {q.points} pts</p>
      <p className="text-sm font-medium">{q.prompt}</p>
      <p className="text-xs font-mono text-muted-foreground">Expected key format: {q.id === 124 ? 'Watchlist keyword only (letters, numbers, underscores, or hyphens)' : q.format || 'not specified'}</p>
      <label htmlFor={`k-${q.id}`} className="text-xs font-mono uppercase text-muted-foreground">Accepted answers, one per line {initial.length ? '' : '(not set)'}</label>
      <textarea id={`k-${q.id}`} rows={3} className={field} value={text} onChange={(e) => { setText(e.target.value); setOk(false); }} data-testid={`input-key-${q.id}`} />
      <div className="flex items-center gap-3">
        <button className={btn} disabled={!list.length || set.isPending} data-testid={`button-save-key-${q.id}`}
          onClick={() => set.mutate({ questionId: q.id, data: { acceptedAnswers: list } }, { onSuccess: () => { setOk(true); qc.invalidateQueries({ queryKey: getGetLanternInstructorKeysQueryKey() }); qc.invalidateQueries({ queryKey: getGetLanternActivityQueryKey() }); } })}>
          {set.isPending ? 'Saving...' : 'Save key'}
        </button>
        {ok && <span role="status" className="text-sm text-[hsl(var(--ok))]">Key saved</span>}
        {set.isError && <span role="alert" className="text-sm text-destructive">{errMessage(set.error, 'Save failed')}</span>}
      </div>
    </li>
  );
}

function Subs({ code }: { code: string }) {
  const headers = { 'x-instructor-code': code };
  const [sel, setSel] = useState<string | null>(null);
  const [pendingOnly, setPendingOnly] = useState(false);
  const list = useListLanternSubmissions({ query: { enabled: true, queryKey: getListLanternSubmissionsQueryKey(), refetchInterval: 5000, staleTime: 0 }, request: { headers } });
  if (list.isLoading) return <PageSkeleton />;
  if (list.isError) return <ErrorPanel title="Could not load submissions" onRetry={() => list.refetch()} />;
  if (!list.data?.length) return <div className="bg-card border border-dashed p-10 text-center" data-testid="panel-no-subs"><p className="font-display font-bold text-lg">No submissions yet</p><p className="text-sm text-muted-foreground">Analyst sessions appear here once they start saving answers.</p></div>;
  const pendingTotal = list.data.reduce((total, s) => total + s.pendingWrittenReviewCount, 0);
  const pendingLearners = list.data.filter(s => s.pendingWrittenReviewCount > 0).length;
  const visible = pendingOnly ? list.data.filter(s => s.pendingWrittenReviewCount > 0) : list.data;
  const selectedOutsideFilter = sel && pendingOnly && !visible.some(s => s.sessionId === sel);
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border p-4 space-y-3">
        <p role="status" className="text-sm font-semibold" data-testid="text-pending-review-total">
          {pendingTotal} written {pendingTotal === 1 ? 'response' : 'responses'} awaiting review across {pendingLearners} {pendingLearners === 1 ? 'learner' : 'learners'}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pendingOnly} onChange={e => setPendingOnly(e.target.checked)} className="accent-[hsl(var(--primary))]" data-testid="checkbox-pending-only" />
          Only show learners awaiting written review
        </label>
        <p className="text-xs text-muted-foreground">Counts include only the latest nonblank written responses, not response history. Updates automatically every five seconds.</p>
      </div>
    <div className="grid lg:grid-cols-[320px_1fr] gap-6">
      <ul className="space-y-2 self-start">
        {!visible.length && <li className="bg-card border border-dashed p-6 text-sm" data-testid="panel-no-pending">No written responses awaiting review. Clear the filter to see all learners.</li>}
        {visible.map((s) => (
          <li key={s.sessionId}>
            <button onClick={() => setSel(s.sessionId)} aria-pressed={sel === s.sessionId} data-testid={`button-sub-${s.sessionId}`}
              className={`w-full text-left bg-card border p-3 ${sel === s.sessionId ? 'border-primary' : 'border-border hover:bg-muted'}`}>
              <p className="font-semibold text-sm">{s.name} <span className="font-mono text-xs text-muted-foreground">Team {s.teamNumber}</span></p><p className="text-xs text-muted-foreground">{s.email}</p>
              <p className="font-mono text-xs mt-1">{s.totalPoints} pts | {s.answeredCount} answered | mission {Math.min(s.unlockedMission, 6)} | {s.submittedAt ? 'submitted' : 'in progress'}</p>
              <p className={`text-xs font-semibold mt-2 ${s.pendingWrittenReviewCount > 0 ? 'text-primary' : 'text-muted-foreground'}`} data-testid={`text-pending-${s.sessionId}`}>
                {s.pendingWrittenReviewCount} written {s.pendingWrittenReviewCount === 1 ? 'response' : 'responses'} awaiting review
              </p>
            </button>
          </li>
        ))}
      </ul>
      <div className="space-y-3">
        {selectedOutsideFilter && <p className="text-sm border-l-4 border-accent bg-card p-3" data-testid="text-selected-outside-filter">The selected learner has no written responses awaiting review. Their details remain open; select another learner or clear the filter.</p>}
        {sel ? <Detail key={sel} sid={sel} headers={headers} /> : <p className="text-muted-foreground p-6">Select a submission to review.</p>}
      </div>
    </div>
    </div>
  );
}

function Detail({ sid, headers }: { sid: string; headers: Headers }) {
  const qc = useQueryClient();
  const act = useGetLanternActivity();
  const d = useGetLanternInstructorSubmission(sid, { query: { enabled: true, queryKey: getGetLanternInstructorSubmissionQueryKey(sid), refetchInterval: 5000 }, request: { headers } });
  const adjust = useAdjustLanternScore({ request: { headers } });
  const [speed, setSpeed] = useState<number | null>(null);
  const [trade, setTrade] = useState<boolean | null>(null);
  if (d.isLoading || act.isLoading) return <PageSkeleton />;
  if (d.isError || !d.data || !act.data) return <ErrorPanel title="Could not load submission" onRetry={() => d.refetch()} />;
  const p = d.data;
  const refresh = () => { qc.invalidateQueries({ queryKey: getGetLanternInstructorSubmissionQueryKey(sid) }); qc.invalidateQueries({ queryKey: getListLanternSubmissionsQueryKey() }); };
  const speedV = speed ?? p.speedBonus;
  const tradeV = trade ?? p.tradecraftBonus > 0;
  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold">{p.name} <span className="font-mono text-sm text-muted-foreground">Team {p.teamNumber} | {p.totalPoints} pts</span></h2>
      <ArchivedResponses progress={p} history={id => <WrittenHistory sid={sid} questionId={id} headers={headers} />} />
      <p className="text-sm text-muted-foreground">Preserved Extraction/SafeGuard is knowledge-based in Mission 1. Review each SIM IMSI against that learner's extraction; an empty SIM is a valid observation when supported by its summary.</p>
      <div className="bg-card border border-border p-4 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end" data-testid="panel-bonuses">
        <div><label htmlFor="speed" className="text-xs font-mono">Speed bonus</label>
          <select id="speed" className={field} value={speedV} onChange={(e) => setSpeed(Number(e.target.value))} data-testid="select-speed">{[0, 1, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
        <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={tradeV} onChange={(e) => setTrade(e.target.checked)} className="accent-[hsl(var(--primary))]" data-testid="checkbox-tradecraft" /> Tradecraft bonus</label>
        <button className={btn} disabled={adjust.isPending} data-testid="button-adjust"
          onClick={() => adjust.mutate({ sessionId: sid, data: { speedBonus: speedV as 0 | 1 | 3 | 5, tradecraftBonus: tradeV } }, { onSuccess: () => { setSpeed(null); setTrade(null); refresh(); } })}>{adjust.isPending ? 'Saving...' : 'Save bonuses'}</button>
        {adjust.isError && <p role="alert" className="text-xs text-destructive sm:col-span-3">{errMessage(adjust.error, 'Bonus update failed')}</p>}
        <p className="text-xs text-muted-foreground sm:col-span-3 font-mono">Raw {p.rawPoints} | hint penalty -{p.penaltyPoints} | hints used {p.hints.length}/3</p>
      </div>
      {[...act.data.questions].sort((a, b) => a.section - b.section || a.id - b.id).map((q) => {
        const an = p.answers[String(q.id)];
        return (
          <div key={q.id} className="bg-card border border-border p-4 space-y-2" data-testid={`review-${q.id}`}>
            <p className="text-xs font-mono text-primary">{q.code} | {q.points} pts{q.manualReview ? ' | written' : ''}</p>
            <p className="text-sm font-medium">{q.prompt}</p>
            <p className="text-sm whitespace-pre-wrap bg-muted p-2">{an ? asText(an.value) : 'Not answered'}</p>
            {an && <p className="text-xs font-mono" data-testid={`text-status-${q.id}`}>Status: {outcome(q, an).text} | earned {an.earnedPoints} / {q.points}</p>}
            {an && q.manualReview && an.instructorNote && <p className="text-xs whitespace-pre-wrap bg-muted p-2" data-testid={`text-last-note-${q.id}`}>Latest feedback sent: {an.instructorNote}</p>}
            {an && q.manualReview && hasResponse(an) && <ReviewActions sessionId={sid} questionId={q.id} points={q.points} updatedAt={an.updatedAt} headers={headers} label={q.code}
              onDecided={() => qc.invalidateQueries({ queryKey: getGetLanternWrittenHistoryQueryKey(sid, q.id) })} />}
            {q.manualReview && <WrittenHistory sid={sid} questionId={q.id} headers={headers} />}
          </div>
        );
      })}
    </div>
  );
}

function WrittenHistory({ sid, questionId, headers }: { sid: string; questionId: number; headers: Headers }) {
  const [open, setOpen] = useState(false);
  const history = useGetLanternWrittenHistory(sid, questionId, {
    query: { enabled: open, queryKey: getGetLanternWrittenHistoryQueryKey(sid, questionId), refetchInterval: open ? 5000 : false, staleTime: 0 },
    request: { headers },
  });
  return (
    <div className="border-t border-border pt-3">
      <button className={btnGhost} aria-expanded={open} aria-controls={`history-${questionId}`} onClick={() => setOpen(!open)} data-testid={`button-history-${questionId}`}>
        {open ? 'Hide response history' : 'View response history'}
      </button>
      {open && <div id={`history-${questionId}`} className="mt-3 space-y-3" data-testid={`history-${questionId}`}>
        {history.isLoading ? <p role="status" className="text-sm">Loading history...</p> : history.isError ? (
          <ErrorPanel title="Could not load response history" onRetry={() => history.refetch()} />
        ) : !history.data?.length ? <p className="text-sm text-muted-foreground">No written submissions recorded.</p> : (
          <>
          <WrittenComparison entries={history.data} questionId={questionId} />
          <h3 className="text-sm font-semibold">Chronological history — submissions and decisions</h3>
          <ol className="space-y-3">
            {history.data.map(entry => <li key={entry.id} className="border border-border p-3 space-y-2">
              <p className="text-xs font-mono">Version {entry.version} | {entry.event === 'imported' ? 'Imported latest snapshot' : entry.event === 'submitted' ? 'Learner submission' : 'Instructor decision'} | {entry.decision} | {entry.points === null ? 'not scored' : `${entry.points} pts`}</p>
              <p className="text-sm whitespace-pre-wrap bg-muted p-2">{entry.value || '(Blank response)'}</p>
              <p className="text-sm whitespace-pre-wrap">Feedback: {entry.feedback || 'None'}</p>
              <p className="text-xs text-muted-foreground">Response saved: {new Date(entry.responseUpdatedAt).toLocaleString()} | Recorded: {new Date(entry.recordedAt).toLocaleString()}</p>
              {entry.event === 'imported' && <p className="text-xs text-muted-foreground">Only the latest response and review state were available when history tracking began. Earlier attempts and the original decision time are unavailable.</p>}
            </li>)}
          </ol>
          </>
        )}
      </div>}
    </div>
  );
}

function Guide({ code }: { code: string }) {
  const query = useGetLanternInstructorAnswerGuide({ request: { headers: { 'x-instructor-code': code } }, query: { staleTime: 0, refetchOnWindowFocus: true, queryKey: getGetLanternInstructorAnswerGuideQueryKey() } });
  return <AnswerGuide query={query} />;
}
