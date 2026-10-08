import { useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetLanternProgressQueryKey, useGetLanternActivity, useGetLanternProgress, useSubmitLanternProgress } from '@workspace/api-client-react';
import { Copy, Download, Mail, Send } from 'lucide-react';
import { ErrorPanel, Eyebrow, PageSkeleton, Shell, btn, btnGhost } from '@/components/shell';
import { asText, buildMailto, buildResultsText, buildWrittenEmailBody, errMessage, hasResponse, hasUnsavedWork, loadSession, orderedQuestions, resumeLink, submitBlockers } from '@/lib/ctf';

const tone: Record<string, string> = { correct: 'text-[hsl(var(--ok))]', incorrect: 'text-destructive', manual: 'text-[hsl(var(--warn))]', unkeyed: 'text-[hsl(var(--warn))]' };
const label: Record<string, string> = { correct: 'Correct', incorrect: 'Incorrect', manual: 'Awaiting review', unkeyed: 'Pending key' };

export default function Results() {
  const session = loadSession();
  const qc = useQueryClient();
  const act = useGetLanternActivity();
  const sid = session?.sessionId ?? '';
  const prog = useGetLanternProgress(sid, { query: { enabled: !!session, queryKey: getGetLanternProgressQueryKey(sid), refetchInterval: 15000 } });
  const submit = useSubmitLanternProgress();
  const [copied, setCopied] = useState(false);
  const [mailCopied, setMailCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  if (!session) {
    return (
      <Shell>
        <div className="bg-card border border-dashed border-input p-10 text-center space-y-3" data-testid="panel-empty">
          <h1 className="font-display text-2xl font-bold">No saved session in this browser</h1>
          <p className="text-muted-foreground">Start the activity, or resume with your private link.</p>
          <Link href="/activity" className={btn}>Go to activity</Link>
        </div>
      </Shell>
    );
  }
  if (act.isLoading || prog.isLoading) return <Shell><PageSkeleton /></Shell>;
  if (!act.data || !prog.data) return <Shell><ErrorPanel title="Results unavailable" onRetry={() => { act.refetch(); prog.refetch(); }} /></Shell>;

  const a = act.data, p = prog.data;
  const link = resumeLink(p.sessionId);
  const blockers = submitBlockers(a, p);
  const unsaved = hasUnsavedWork(a, p);
  const download = () => {
    const url = URL.createObjectURL(new Blob([buildResultsText(a, p)], { type: 'text/plain' }));
    const el = document.createElement('a'); el.href = url; el.download = 'silent-lantern-results.txt'; el.click(); URL.revokeObjectURL(url);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setCopyError(false); setTimeout(() => setCopied(false), 2000); }
    catch { setCopyError(true); }
  };
  const copyMail = async () => {
    try { await navigator.clipboard.writeText(buildWrittenEmailBody(a, p)); setMailCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  };
  const qs = orderedQuestions(a);

  return (
    <Shell>
      <div className="space-y-8 rise">
        <div className="grid md:grid-cols-[1fr_auto] gap-6 items-end">
          <div><Eyebrow>Results | {p.name} | Team {p.teamNumber}</Eyebrow><h1 className="font-display text-4xl font-bold">Saved responses</h1></div>
          <div className="bg-secondary text-secondary-foreground px-6 py-4">
            <p className="font-display text-5xl font-bold" data-testid="text-total">{p.totalPoints}<span className="text-lg text-white/60"> / {a.totalPoints}</span></p>
            <p className="text-xs font-mono text-white/70">{p.answeredCount} of {a.totalFlags} answered | hints -{p.penaltyPoints} | bonuses +{p.speedBonus + p.tradecraftBonus}</p>
          </div>
        </div>

        <section className="bg-card border border-border p-5 space-y-4" aria-labelledby="ship">
          <h2 id="ship" className="font-display font-bold text-lg">Send to your instructor</h2>
          <p className="text-sm text-muted-foreground">Written answers are already saved on the server for instructor review. The email button opens your own mail app with a draft; nothing is sent automatically, so press send there.</p>
          <p className="text-xs text-muted-foreground">Sending to: {p.instructorEmail}. For a long response, the draft will ask you to attach the downloaded text file or paste your copied responses. Attachments are not added automatically.</p>
          <div className="flex flex-wrap gap-3">
            <a href={unsaved ? undefined : buildMailto(a, p)} aria-disabled={unsaved} onClick={e => { if (unsaved) e.preventDefault(); }} className={`${btn} ${unsaved ? 'opacity-50 cursor-not-allowed' : ''}`} data-testid="link-mailto"><Mail size={16} /> Email instructor</a>
            <button className={btnGhost} disabled={unsaved} onClick={download} data-testid="button-download"><Download size={16} /> Download text</button>
            <button className={btnGhost} disabled={unsaved} onClick={copyMail} data-testid="button-copy-written"><Copy size={16} /> {mailCopied ? 'Written responses copied' : 'Copy written responses'}</button>
            <button className={btnGhost} onClick={copy} data-testid="button-copy-link"><Copy size={16} /> {copied ? 'Copied' : 'Copy private resume link'}</button>
            <button className={btnGhost} disabled={submit.isPending || !!p.submittedAt || blockers.length > 0} data-testid="button-submit"
              onClick={() => submit.mutate({ sessionId: p.sessionId }, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetLanternProgressQueryKey(sid) }) })}>
              <Send size={16} /> {p.submittedAt ? 'Marked ready for review' : submit.isPending ? 'Submitting...' : 'Mark ready for review'}
            </button>
          </div>
          {unsaved && <p role="alert" className="text-sm text-[hsl(var(--warn))]">Sending and export are paused while changes are unsaved. <Link href="/activity" className="underline">Return to the activity</Link> to finish saving; your local drafts are preserved.</p>}
          {blockers.length > 0 && !p.submittedAt && <ul className="text-xs text-muted-foreground list-disc pl-5" data-testid="list-blockers">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
          {submit.isError && <p role="alert" className="text-sm text-destructive">{errMessage(submit.error, 'Submit failed. Try again.')}</p>}
          {copyError && <p role="alert" className="text-sm text-destructive">Your browser blocked clipboard access. Download the text file instead, or select and copy the private link below.</p>}
          {p.submittedAt && <p className="text-xs font-mono text-muted-foreground">Submitted {new Date(p.submittedAt).toLocaleString()}</p>}
          <p className="text-xs text-muted-foreground break-all font-mono">Keep this link private: {link}</p>
        </section>

        <section aria-labelledby="resp"><h2 id="resp" className="font-display font-bold text-lg mb-3">Responses in mission order</h2>
          <ol className="space-y-2">
            {qs.map((q) => {
              const savedAnswer = p.answers[String(q.id)];
              const an = hasResponse(savedAnswer) ? savedAnswer : undefined;
              return (
                <li key={q.id} className="bg-card border border-border p-4 grid sm:grid-cols-[90px_1fr_auto] gap-3" data-testid={`row-result-${q.id}`}>
                  <span className="font-mono text-xs text-muted-foreground">{q.code}</span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">{q.prompt}</p>
                    <p className="text-sm whitespace-pre-wrap break-words">{an ? asText(an.value) : <span className="text-muted-foreground italic">Incomplete</span>}</p>
                    {an?.instructorNote && <p className="text-xs bg-muted p-2">Instructor: {an.instructorNote}</p>}
                    {q.section <= p.unlockedMission && (p.reviewGateQuestionId === null || q.id <= p.reviewGateQuestionId) && <Link href={`/activity?flag=${q.id}`} className="text-xs text-primary underline">{an ? 'Revisit' : 'Answer now'}</Link>}
                  </div>
                  <div className="text-right text-sm">
                    <p className={`font-semibold ${an ? tone[an.status] : 'text-muted-foreground'}`}>{an ? q.manualReview ? an.reviewStatus === 'approved' ? 'Approved' : an.reviewStatus === 'denied' ? 'Denied — revise' : 'Awaiting approval' : label[an.status] : 'Incomplete'}</p>
                    <p className="font-mono text-xs">{an ? (an.instructorPoints ?? an.earnedPoints) : 0} / {q.points} pts</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </Shell>
  );
}
