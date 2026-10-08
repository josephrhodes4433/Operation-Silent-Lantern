import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCtfInstructorKeysQueryKey, getGetCtfInstructorSubmissionQueryKey, getListCtfSubmissionsQueryKey,
  getGetCtfActivityQueryKey, getGetCtfInstructorQuestionsQueryKey, useGetCtfInstructorQuestions,
  useGetCtfActivity, useGetCtfInstructorKeys, useGetCtfInstructorSubmission, useListCtfSubmissions,
  useReviewCtfWrittenAnswer, useSetCtfInstructorKey, useVerifyCtfInstructor,
} from '@workspace/api-client-react';
import type { CtfInstructorQuestion, CtfQuestion } from '@workspace/api-client-react';
import { Lock } from 'lucide-react';
import { ErrorPanel, Eyebrow, PageSkeleton, Shell, btn, btnGhost, field } from '@/components/shell';
import { QuestionAuthoring } from '@/components/question-authoring';
import { asText, errStatus } from '@/lib/ctf';

export default function Instructor() {
  const [code, setCode] = useState<string | null>(null); // memory only
  const qc = useQueryClient();
  const lock = () => {
    setCode(null);
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
  const [tab, setTab] = useState<'keys' | 'subs' | 'author'>('keys');
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div><Eyebrow>Instructor console</Eyebrow><h1 className="font-display text-3xl font-bold">Questions, keys and submissions</h1></div>
        <button className={btnGhost} onClick={onLock} data-testid="button-lock">Lock</button>
      </div>
      <div role="tablist" className="flex border-b border-border">
        {([['author', 'Questions'], ['keys', 'Answer keys'], ['subs', 'Submissions']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
            className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>{l}</button>
        ))}
      </div>
      {tab === 'author' ? <QuestionAuthoring headers={{ 'x-instructor-code': code }} /> : tab === 'keys' ? <Keys code={code} /> : <Subs code={code} />}
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
    <ul className="space-y-3">{qs.map(q => <KeyRow key={`${q.id}:${(map.get(q.id) ?? []).join('|')}`} q={q} headers={headers} initial={map.get(q.id) ?? []} />)}</ul>
  </div>;
}

function KeyRow({ q, headers, initial }: { q: CtfInstructorQuestion; headers: Record<string, string>; initial: string[] }) {
  const qc = useQueryClient();
  const set = useSetCtfInstructorKey({ request: { headers } });
  const [text, setText] = useState(initial.join('\n'));
  const [ok, setOk] = useState(false);
  const list = text.split('\n').map((s) => s.trim()).filter(Boolean);
  return (
    <li className="bg-card border border-border p-4 space-y-2" data-testid={`row-key-${q.id}`}>
      <p className="text-sm"><span className="font-mono text-xs text-primary">Flag {q.id}</span> | {q.sectionTitle} | {q.points} pts</p>
      <p className="text-sm font-medium">{q.prompt}</p>
      {q.facilitatorNote && <p className="text-sm border-l-2 border-accent pl-3 text-muted-foreground">{q.facilitatorNote}</p>}
      {!!q.facilitatorAnswers?.length && <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">Guide reference: {q.facilitatorAnswers.join(' / ')}</p>
        <button type="button" className={btnGhost} onClick={() => { setText(q.facilitatorAnswers!.join('\n')); setOk(false); }} data-testid={`button-use-guide-key-${q.id}`}>Load reference for review</button>
      </div>}
      <label htmlFor={`k-${q.id}`} className="text-xs font-mono uppercase text-muted-foreground">Accepted answers, one per line {initial.length ? '' : '(not set)'}</label>
      <textarea id={`k-${q.id}`} rows={3} className={field} value={text} onChange={(e) => { setText(e.target.value); setOk(false); }} data-testid={`input-key-${q.id}`} />
      <div className="flex items-center gap-3">
        <button className={btn} disabled={!list.length || set.isPending} data-testid={`button-save-key-${q.id}`}
          onClick={() => set.mutate({ questionId: q.id, data: { acceptedAnswers: list } }, { onSuccess: () => { setOk(true); qc.invalidateQueries({ queryKey: getGetCtfInstructorKeysQueryKey() }); qc.invalidateQueries({ queryKey: getGetCtfActivityQueryKey() }); qc.invalidateQueries({ queryKey: getGetCtfInstructorQuestionsQueryKey() }); } })}>
          {set.isPending ? 'Saving...' : 'Save verified key'}
        </button>
        {ok && <span role="status" className="text-sm text-[hsl(var(--ok))]">Key saved</span>}
        {set.isError && <span role="alert" className="text-sm text-destructive">Save failed</span>}
      </div>
    </li>
  );
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
              <p className="font-semibold text-sm">{s.name}</p><p className="text-xs text-muted-foreground">{s.email}</p>
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
  const d = useGetCtfInstructorSubmission(sid, { query: { enabled: true, queryKey: getGetCtfInstructorSubmissionQueryKey(sid) }, request: { headers } });
  if (d.isLoading || act.isLoading) return <PageSkeleton />;
  if (d.isError || !d.data || !act.data) return <ErrorPanel title="Could not load submission" onRetry={() => d.refetch()} />;
  const p = d.data;
  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold">{p.name} <span className="font-mono text-sm text-muted-foreground">{p.totalPoints} pts</span></h2>
      {[...act.data.questions].sort((a, b) => a.section - b.section || a.id - b.id).map((q) => {
        const an = p.answers[String(q.id)];
        return (
          <div key={q.id} className="bg-card border border-border p-4 space-y-2" data-testid={`review-${q.id}`}>
            <p className="text-xs font-mono text-primary">Flag {q.id} | {q.points} pts{q.manualReview ? ' | written' : ''}</p>
            <p className="text-sm font-medium">{q.prompt}</p>
            <p className="text-sm whitespace-pre-wrap bg-muted p-2">{an ? asText(an.value) : 'Not answered'}</p>
            {an && <p className="text-xs font-mono">Status: {an.status} | earned {an.earnedPoints}</p>}
            {an && q.manualReview && <Review sid={sid} q={q} headers={headers} pts={an.instructorPoints ?? 0} note={an.instructorNote ?? ''} />}
          </div>
        );
      })}
    </div>
  );
}

function Review({ sid, q, headers, pts, note }: { sid: string; q: CtfQuestion; headers: Record<string, string>; pts: number; note: string }) {
  const qc = useQueryClient();
  const rev = useReviewCtfWrittenAnswer({ request: { headers } });
  const [points, setPoints] = useState(String(pts));
  const [n, setN] = useState(note);
  const num = Number(points);
  const bad = !Number.isFinite(num) || num < 0 || num > q.points;
  return (
    <div className="grid sm:grid-cols-[120px_1fr_auto] gap-2 items-end border-t border-border pt-3">
      <div><label htmlFor={`pt-${q.id}`} className="text-xs font-mono">Points (max {q.points})</label>
        <input id={`pt-${q.id}`} type="number" min={0} max={q.points} className={field} value={points} onChange={(e) => setPoints(e.target.value)} data-testid={`input-points-${q.id}`} /></div>
      <div><label htmlFor={`nt-${q.id}`} className="text-xs font-mono">Note</label>
        <input id={`nt-${q.id}`} maxLength={2000} className={field} value={n} onChange={(e) => setN(e.target.value)} data-testid={`input-note-${q.id}`} /></div>
      <button className={btn} disabled={bad || rev.isPending} data-testid={`button-review-${q.id}`}
        onClick={() => rev.mutate({ sessionId: sid, questionId: q.id, data: { points: num, note: n } }, {
          onSuccess: () => { qc.invalidateQueries({ queryKey: getGetCtfInstructorSubmissionQueryKey(sid) }); qc.invalidateQueries({ queryKey: getListCtfSubmissionsQueryKey() }); } })}>
        {rev.isPending ? 'Saving...' : rev.isSuccess ? 'Saved' : 'Save review'}
      </button>
      {rev.isError && <p role="alert" className="text-xs text-destructive sm:col-span-3">Review failed to save.</p>}
    </div>
  );
}
