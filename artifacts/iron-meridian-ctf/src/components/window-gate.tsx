import { useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetCtfWindowQueryKey, useReopenCtfWindow } from '@workspace/api-client-react';
import { Lock } from 'lucide-react';
import { ErrorPanel, Eyebrow, PageSkeleton, Shell, btn, btnGhost, field } from '@/components/shell';
import { errMessage, errStatus } from '@/lib/ctf';
import { useActivityWindow } from '@/lib/window';

function Locked() {
  const qc = useQueryClient();
  const w = useActivityWindow();
  // The instructor password lives only in this component's state.
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const reopen = useReopenCtfWindow({ request: { headers: { 'x-instructor-code': code } } });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    setErr('');
    reopen.mutate(undefined, {
      onSuccess: async (next) => {
        setCode('');
        qc.setQueryData(getGetCtfWindowQueryKey(), next);
        await qc.invalidateQueries({ queryKey: getGetCtfWindowQueryKey() });
      },
      onError: (e2) => {
        const s = errStatus(e2);
        setErr(s === 401 || s === 403 ? 'That instructor password was not accepted.' : errMessage(e2, 'The window could not be reopened. Try again.'));
      },
    });
  };
  return (
    <div className="max-w-2xl space-y-6 rise" data-testid="panel-window-locked">
      <div className="bg-secondary text-secondary-foreground p-6 space-y-3 border-l-8 border-accent">
        <Lock aria-hidden />
        <Eyebrow>Activity closed</Eyebrow>
        <h1 className="font-display text-3xl font-bold">This 24-hour window has ended</h1>
        <p className="text-sm text-white/75">Overview, activity, results and leaderboard are locked for every team.{w.window?.expiresAt ? ` The window closed ${new Date(w.window.expiresAt).toLocaleString()}.` : ''} Saved work is kept. Instructors can still review archives and give feedback.</p>
        <Link href="/instructor" className={`${btnGhost} text-foreground`} data-testid="link-locked-instructor">Open instructor console</Link>
      </div>
      <form onSubmit={submit} className="bg-card border border-border p-6 space-y-3" aria-labelledby="reopen-h" autoComplete="off">
        <h2 id="reopen-h" className="font-display text-xl font-bold">Reopen for a new class</h2>
        <p className="text-sm text-muted-foreground">Instructors only. Reopening starts fresh: the next team to register starts a new 24-hour window. Earlier team sessions become read-only.</p>
        <label htmlFor="reopen-code" className="block text-sm font-medium">Instructor password</label>
        <input id="reopen-code" type="password" autoComplete="off" className={field} value={code} onChange={(e) => setCode(e.target.value)} data-testid="input-reopen-code" />
        {err && <p role="alert" className="text-sm text-destructive" data-testid="text-reopen-error">{err}</p>}
        <button className={btn} disabled={!code || reopen.isPending} data-testid="button-reopen">{reopen.isPending ? 'Reopening...' : 'Reopen activity'}</button>
      </form>
    </div>
  );
}

export function WindowGate({ children }: { children: ReactNode }) {
  const w = useActivityWindow();
  if (w.isLoading) return <Shell><PageSkeleton /></Shell>;
  if (w.isError) return <Shell><ErrorPanel title="Cannot confirm the activity window" message="Learner pages stay closed until the server clock can be checked." onRetry={() => w.refetch()} /></Shell>;
  if (w.state === 'expired') return <Shell><Locked /></Shell>;
  return <>{children}</>;
}

export function ArchivedNotice({ onNew }: { onNew: () => void }) {
  return (
    <div className="max-w-2xl bg-card border-l-8 border-[hsl(var(--warn))] border border-border p-6 space-y-3" role="status" data-testid="panel-archived">
      <Eyebrow>Earlier session</Eyebrow>
      <h1 className="font-display text-2xl font-bold">This session is read-only</h1>
      <p className="text-sm text-muted-foreground">It belongs to an earlier window, so it can no longer be edited. Your saved results stay available to read and download. Start a new session to take part again.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/results" className={btnGhost} data-testid="link-archived-results">View saved results</Link>
        <button className={btn} onClick={onNew} data-testid="button-new-session">Start new session</button>
      </div>
    </div>
  );
}
