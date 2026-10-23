import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCtfInstructorKeysQueryKey, getGetCtfInstructorSubmissionQueryKey, getListCtfSubmissionsQueryKey,
  getGetCtfActivityQueryKey, getGetCtfInstructorQuestionsQueryKey, useGetCtfInstructorQuestions,
  useGetCtfActivity, useGetCtfInstructorKeys, useGetCtfInstructorSubmission, useListCtfSubmissions,
  useSetCtfInstructorKey, useVerifyCtfInstructor,
  useGetCtfInstructorAnswerGuide, getGetCtfInstructorAnswerGuideQueryKey,
} from '@workspace/api-client-react';
import type { CtfInstructorQuestion } from '@workspace/api-client-react';
import { AnswerGuide } from '@/components/answer-guide';
import { Lock } from 'lucide-react';
import { ErrorPanel, Eyebrow, PageSkeleton, Shell, btn, btnGhost, field } from '@/components/shell';
import { QuestionAuthoring } from '@/components/question-authoring';
import { asText, errStatus, hasResponse, outcome } from '@/lib/ctf';
import { ReviewActions } from '@/components/review-actions';
import { ReviewQueue } from '@/components/review-queue';
import { SessionArchives } from '@/components/session-archives';
import { CompletionsPanel, SignalsBar, useNotificationData, useQueueData } from '@/components/instructor-signals';

export default function Instructor() {
  const [code, setCode] = useState<string | null>(null); // memory only
  const qc = useQueryClient();
  const lock = () => {
    setCode(null);
    qc.cancelQueries();
    qc.removeQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/api/ctf/instructor') });
    qc.removeQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/api/ctf/progress') });
  };
  return <Shell>{code ? <Console code={code} onLock={lock} /> : <Gate onOk={setCode} />}</Shell>;
}

function Gate({ onOk }: { onOk: (c: string) => void }) {
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const verify = useVerifyCtfInstructor();
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
  const [tab, setTab] = useState<'guide' | 'keys' | 'subs' | 'author' | 'queue' | 'notes' | 'archives'>('guide');
  const queue = useQueueData(code, 'time_asc');
  const notes = useNotificationData(code);
  const pending = queue.data?.length ?? 0;
  const unread = (notes.data ?? []).filter((n) => !n.readAt).length;
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div><Eyebrow>Instructor console</Eyebrow><h1 className="font-display text-3xl font-bold">Questions, keys and submissions</h1></div>
        <button className={btnGhost} onClick={onLock} data-testid="button-lock">Lock</button>
      </div>
      <SignalsBar pending={pending} pendingState={queue.data ? 'ready' : queue.isError ? 'error' : 'loading'} unread={unread} onQueue={() => setTab('queue')} onNotes={() => setTab('notes')} />
      <div role="tablist" className="flex flex-wrap border-b border-border">
        {([['archives', 'Sessions & rosters'], ['queue', `Review queue (${pending})`], ['notes', `Completions (${unread} new)`], ['guide', 'Answer guide'], ['author', 'Questions'], ['keys', 'Edit grading keys'], ['subs', 'Submissions']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
            className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>{l}</button>
        ))}
      </div>
      {tab === 'archives' ? <Archives code={code} /> : tab === 'queue' ? <ReviewQueue code={code} /> : tab === 'notes' ? <CompletionsPanel code={code} /> : tab === 'guide' ? <Guide code={code} /> : tab === 'author' ? <QuestionAuthoring headers={{ 'x-instructor-code': code }} /> : tab === 'keys' ? <Keys code={code} /> : <Subs code={code} />}
    </div>
  );
}

function Keys({ code }: { code: string }) {
  const headers = { 'x-instructor-code': code };
  const qc = useQueryClient();
  const importer = useSetCtfInstructorKey({ request: { headers } });
  const [verified, setVerified] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const cat = useGetCtfInstructorQuestions({ query: { enabled: true, queryKey: getGetCtfInstructorQuestionsQueryKey() }, request: { headers } });
  const keys = useGetCtfInstructorKeys({ query: { enabled: true, queryKey: getGetCtfInstructorKeysQueryKey() }, request: { headers } });
  if (cat.isLoading || keys.isLoading) return <PageSkeleton />;
  if (cat.isError || keys.isError || !cat.data) return <ErrorPanel title="Could not load keys" message={errStatus(keys.error) === 401 ? 'Access code rejected.' : undefined} onRetry={() => { cat.refetch(); keys.refetch(); }} />;
  const qs = cat.data.questions.filter((q) => q.validationMode === 'dataset').sort((a, b) => a.id - b.id);
  if (!qs.length) return <p className="bg-card border border-dashed p-8 text-center">No dataset-keyed questions. Set a question to dataset validation in the Questions tab.</p>;
  const map = new Map((keys.data ?? []).map((k) => [k.questionId, k.acceptedAnswers]));
  const references = qs.filter(q => q.facilitatorAnswers?.length && !map.get(q.id)?.length);
  const importReferences = async () => {
    if (!verified || importing) return;
    setImporting(true);
    setImportMessage('');
    let saved = 0;
    try {
      for (const q of references) {
        const result = await importer.mutateAsync({ questionId: q.id, data: { acceptedAnswers: q.facilitatorAnswers!, onlyIfUnset: true } });
        if (JSON.stringify(result.acceptedAnswers) === JSON.stringify(q.facilitatorAnswers)) saved++;
      }
      setImportMessage(`${saved} verified guide keys saved. Existing instructor keys were left unchanged.`);
    } catch {
      setImportMessage(`${saved} keys saved before an error. Refresh the list, review the remaining keys and retry.`);
    } finally {
      setImporting(false);
      qc.invalidateQueries({ queryKey: getGetCtfInstructorKeysQueryKey() });
      qc.invalidateQueries({ queryKey: getGetCtfActivityQueryKey() });
      qc.invalidateQueries({ queryKey: getGetCtfInstructorQuestionsQueryKey() });
    }
  };
  return <div className="space-y-5">
    <section className="bg-card border border-border p-5 space-y-3" aria-labelledby="guide-keys">
      <h3 id="guide-keys" className="font-display font-bold text-lg">Facilitator guide reference keys</h3>
      <p className="text-sm text-muted-foreground">The guide supplies recorded values for {references.length} currently unkeyed questions. Check them against your classroom extractions, software version and the notes below before activating automatic grading. List findings, student-specific products and written assessments remain instructor-reviewed.</p>
      <label className="flex gap-3 items-start text-sm"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} disabled={importing} data-testid="checkbox-verify-guide-keys" /><span>I have verified these reference values against the current classroom datasets.</span></label>
      <button type="button" className={btn} disabled={!verified || importing || !references.length} onClick={importReferences} data-testid="button-import-guide-keys">{importing ? 'Saving verified keys…' : `Save ${references.length} verified guide keys`}</button>
      <p className="text-xs text-muted-foreground">This regrades saved responses against the active keys. Existing instructor keys and custom question definitions are not replaced. You can instead review and save each key separately below.</p>
      {importMessage && <p role="status" className="text-sm">{importMessage}</p>}
    </section>
    <ul className="space-y-3">{qs.map(q => <KeyRow key={q.id} q={q} headers={headers} initial={map.get(q.id) ?? []} />)}</ul>
  </div>;
}

function KeyRow({ q, headers, initial }: { q: CtfInstructorQuestion; headers: Record<string, string>; initial: string[] }) {
  const qc = useQueryClient();
  const set = useSetCtfInstructorKey({ request: { headers } });
  const [text, setText] = useState(initial.join('\n'));
  const [ok, setOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const initialText = initial.join('\n');
  useEffect(() => { setText(initialText); }, [initialText]);
  const list = text.split('\n').map((s) => s.trim()).filter(Boolean);
  return (
    <li className="bg-card border border-border p-4 space-y-2" data-testid={`row-key-${q.id}`}>
      <p className="text-sm"><span className="font-mono text-xs text-primary">Flag {q.id}</span> | {q.sectionTitle} | {q.points} pts</p>
      <p className="text-sm font-medium">{q.prompt}</p>
      {q.facilitatorNote && <p className="text-sm border-l-2 border-accent pl-3 text-muted-foreground">{q.facilitatorNote}</p>}
      {!!q.facilitatorAnswers?.length && <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">Guide reference: {q.facilitatorAnswers.join(' / ')}</p>
        <button type="button" className={btnGhost} onClick={() => { setText(q.facilitatorAnswers!.join('\n')); setOk(false); setSaveError(null); }} data-testid={`button-use-guide-key-${q.id}`}>Load reference for review</button>
      </div>}
      <label htmlFor={`k-${q.id}`} className="text-xs font-mono uppercase text-muted-foreground">Accepted answers, one per line {initial.length ? '' : '(not set)'}</label>
      <textarea id={`k-${q.id}`} rows={3} className={field} value={text} onChange={(e) => { setText(e.target.value); setOk(false); setSaveError(null); }} data-testid={`input-key-${q.id}`} />
      <div className="flex items-center gap-3">
        <button className={btn} disabled={!list.length || set.isPending} data-testid={`button-save-key-${q.id}`}
          onClick={() => {
            setOk(false); setSaveError(null);
            set.mutate({ questionId: q.id, data: { acceptedAnswers: list } }, {
              onSuccess: () => { setOk(true); qc.invalidateQueries({ queryKey: getGetCtfInstructorKeysQueryKey() }); qc.invalidateQueries({ queryKey: getGetCtfActivityQueryKey() }); qc.invalidateQueries({ queryKey: getGetCtfInstructorQuestionsQueryKey() }); },
              onError: (error) => {
                const data: unknown = error && typeof error === 'object' && 'data' in error ? error.data : null;
                const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : null;
                setSaveError(message ?? 'Save failed. Check the connection and retry.');
              },
            });
          }}>
          {set.isPending ? 'Saving...' : 'Save verified key'}
        </button>
        {ok && <span role="status" className="text-sm text-[hsl(var(--ok))]">Key saved</span>}
        {saveError && <span role="alert" className="text-sm text-destructive">{saveError}</span>}
      </div>
    </li>
  );
}

function Archives({ code }: { code: string }) {
  const headers = { 'x-instructor-code': code };
  const [selected, setSelected] = useState<string | null>(null);
  const list = useListCtfSubmissions({ query: { queryKey: getListCtfSubmissionsQueryKey(), refetchInterval: 5000, staleTime: 0 }, request: { headers } });
  if (list.isLoading) return <PageSkeleton />;
  if (list.isError) return <ErrorPanel title="Could not load session archives" onRetry={() => list.refetch()} />;
  if (selected) return <div className="space-y-4">
    <button className={btnGhost} onClick={() => setSelected(null)} data-testid="button-back-archives">Back to all sessions</button>
    <Detail key={selected} sid={selected} headers={headers} />
  </div>;
  return <SessionArchives submissions={list.data ?? []} onOpen={setSelected} />;
}

function Subs({ code }: { code: string }) {
  const headers = { 'x-instructor-code': code };
  const [sel, setSel] = useState<string | null>(null);
  const list = useListCtfSubmissions({ query: { enabled: true, queryKey: getListCtfSubmissionsQueryKey() }, request: { headers } });
  if (list.isLoading) return <PageSkeleton />;
  if (list.isError) return <ErrorPanel title="Could not load submissions" onRetry={() => list.refetch()} />;
  if (!list.data?.length) return <div className="bg-card border border-dashed p-10 text-center" data-testid="panel-no-subs"><p className="font-display font-bold text-lg">No submissions yet</p><p className="text-sm text-muted-foreground">Analyst sessions appear here once they start saving answers.</p></div>;
  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-6">
      <ul className="space-y-2 self-start">
        {list.data.map((s) => (
          <li key={s.sessionId}>
            <button onClick={() => setSel(s.sessionId)} aria-pressed={sel === s.sessionId} data-testid={`button-sub-${s.sessionId}`}
              className={`w-full text-left bg-card border p-3 ${sel === s.sessionId ? 'border-primary' : 'border-border hover:bg-muted'}`}>
              <p className="font-semibold text-sm">{s.teamName}</p><p className="text-xs text-muted-foreground">{s.instructorName} · {s.sessionDate}</p>
              <p className="font-mono text-xs mt-1">{s.totalPoints} pts | {s.answeredCount} answered | {s.submittedAt ? 'submitted' : 'in progress'}</p>
            </button>
          </li>
        ))}
      </ul>
      {sel ? <Detail key={sel} sid={sel} headers={headers} /> : <p className="text-muted-foreground p-6">Select a submission to review.</p>}
    </div>
  );
}

function Detail({ sid, headers }: { sid: string; headers: Record<string, string> }) {
  const act = useGetCtfActivity();
  const catalog = useGetCtfInstructorQuestions({ request: { headers } });
  const d = useGetCtfInstructorSubmission(sid, { query: { enabled: true, queryKey: getGetCtfInstructorSubmissionQueryKey(sid), refetchInterval: 5000, staleTime: 0 }, request: { headers } });
  if (d.isLoading || act.isLoading) return <PageSkeleton />;
  if (d.isError || !d.data || !act.data) return <ErrorPanel title="Could not load submission" onRetry={() => d.refetch()} />;
  const p = d.data;
  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold">{p.teamName} <span className="font-mono text-sm text-muted-foreground break-words">{p.instructorName} · {p.sessionDate} | {p.totalPoints} pts</span></h2>
      {[...act.data.questions].sort((a, b) => a.section - b.section || a.id - b.id).map((q) => {
        const an = p.answers[String(q.id)];
        const guidance = q.manualReview ? catalog.data?.questions.find(item => item.id === q.id) : undefined;
        return (
          <div key={q.id} className="bg-card border border-border p-4 space-y-2" data-testid={`review-${q.id}`}>
            <p className="text-xs font-mono text-primary">Flag {q.id} | {q.points} pts{q.manualReview ? ' | written' : ''}</p>
            <p className="text-sm font-medium">{q.prompt}</p>
            {guidance && <p className="text-xs whitespace-pre-wrap border-l-2 border-primary pl-3 text-muted-foreground"><strong>Review guidance: </strong>{guidance.facilitatorNote || guidance.validationMethod}</p>}
            <p className="text-sm whitespace-pre-wrap bg-muted p-2">{an ? asText(an.value) : 'Not answered'}</p>
            {an && <p className="text-xs font-mono" data-testid={`text-status-${q.id}`}>Status: {outcome(q, an).text} | earned {an.earnedPoints} / {q.points}</p>}
            {an && q.manualReview && an.instructorNote && <p className="text-xs whitespace-pre-wrap bg-muted p-2" data-testid={`text-last-note-${q.id}`}>Latest feedback sent: {an.instructorNote}</p>}
            {an && q.manualReview && hasResponse(an) && <ReviewActions sessionId={sid} questionId={q.id} points={q.points} updatedAt={an.updatedAt} headers={headers} label={`Flag ${q.id}`} />}
          </div>
        );
      })}
    </div>
  );
}

function Guide({ code }: { code: string }) {
  const query = useGetCtfInstructorAnswerGuide({ request: { headers: { 'x-instructor-code': code } }, query: { staleTime: 0, refetchOnWindowFocus: true, queryKey: getGetCtfInstructorAnswerGuideQueryKey() } });
  return <AnswerGuide query={query} />;
}
