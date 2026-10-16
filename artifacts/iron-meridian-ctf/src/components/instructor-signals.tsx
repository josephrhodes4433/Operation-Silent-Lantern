import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, ClipboardList } from 'lucide-react';
import {
  getGetCtfNotificationsQueryKey, getGetCtfReviewQueueQueryKey, useGetCtfNotifications, useGetCtfReviewQueue, useReadCtfNotification,
} from '@workspace/api-client-react';
import type { GetCtfReviewQueueParams } from '@workspace/api-client-react';
import { ErrorPanel, Skeleton, btn, btnGhost } from '@/components/shell';
import { errMessage } from '@/lib/ctf';

export type QueueSort = NonNullable<GetCtfReviewQueueParams['sort']>;

/** Non-secret scope derived from the access code so cached private data never crosses instructor sessions. */
export function authScope(code: string) {
  let h = 5381;
  for (const c of code) h = ((h * 33) ^ (c.codePointAt(0) ?? 0)) >>> 0;
  return `auth-${h.toString(36)}`;
}

export function useQueueData(code: string, sort: QueueSort) {
  return useGetCtfReviewQueue({ sort }, {
    query: { queryKey: [...getGetCtfReviewQueueQueryKey({ sort }), { scope: authScope(code) }], refetchInterval: 5000, staleTime: 0 },
    request: { headers: { 'x-instructor-code': code } },
  });
}

export function useNotificationData(code: string) {
  return useGetCtfNotifications({
    query: { queryKey: [...getGetCtfNotificationsQueryKey(), { scope: authScope(code) }], refetchInterval: 5000, staleTime: 0 },
    request: { headers: { 'x-instructor-code': code } },
  });
}

/** Prominent entry to the all-pending queue, with a polite live summary for assistive tech. */
export function SignalsBar({ pending, pendingState, unread, onQueue, onNotes }: {
  pending: number; pendingState: 'loading' | 'error' | 'ready'; unread: number; onQueue: () => void; onNotes: () => void;
}) {
  const summary = `${pendingState === 'ready' ? `${pending} written ${pending === 1 ? 'response' : 'responses'} awaiting review.` : 'Review count unavailable.'} ${unread} unread team ${unread === 1 ? 'completion' : 'completions'}.`;
  return (
    <section aria-label="Instructor attention" className="grid md:grid-cols-[1fr_auto] gap-3">
      <div className="bg-secondary text-secondary-foreground p-5 flex flex-wrap items-center gap-5 border-l-8 border-accent" data-testid="panel-queue-callout">
        <p className="font-display text-5xl font-bold leading-none tabular-nums" data-testid="text-queue-count" aria-hidden>
          {pendingState === 'ready' ? pending : '-'}
        </p>
        <div className="flex-1 min-w-[12rem]">
          <p className="font-display font-bold text-lg">{pending === 1 ? 'Response' : 'Responses'} waiting for your decision</p>
          <p className="text-sm text-white/70">Every latest, nonblank written response across all teams. Refreshes every five seconds.</p>
        </div>
        <button className={`${btn} bg-accent text-accent-foreground`} onClick={onQueue} data-testid="button-open-queue"><ClipboardList size={16} /> Open review queue</button>
      </div>
      <button onClick={onNotes} className="bg-card border border-border p-5 text-left flex items-center gap-3 hover:bg-muted" data-testid="button-open-completions">
        <Bell size={22} className={unread ? 'text-primary' : 'text-muted-foreground'} aria-hidden />
        <span>
          <span className="block font-display font-bold text-lg" data-testid="badge-unread">{unread} unread</span>
          <span className="block text-xs text-muted-foreground">Team completions</span>
        </span>
      </button>
      <div role="status" aria-live="polite" className="sr-only" data-testid="status-live">{summary}</div>
    </section>
  );
}

export function CompletionsPanel({ code }: { code: string }) {
  const qc = useQueryClient();
  const q = useNotificationData(code);
  const read = useReadCtfNotification({ request: { headers: { 'x-instructor-code': code } } });
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: [getGetCtfNotificationsQueryKey()[0]] });
  if (q.isLoading) return <div role="status" aria-label="Loading completions" className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;
  if (q.isError || !q.data) return <ErrorPanel title="Could not load completions" message={errMessage(q.error, 'Check the connection and retry.')} onRetry={() => q.refetch()} />;
  const items = [...q.data].sort((a, b) => Number(!!a.readAt) - Number(!!b.readAt) || b.completedAt.localeCompare(a.completedAt));
  const unread = items.filter((n) => !n.readAt);
  const mark = (id: string) => read.mutateAsync({ notificationId: id });
  const markOne = (id: string) => { setErr(null); mark(id).then(refresh).catch((e) => setErr(errMessage(e, 'Could not mark that completion as read.'))); };
  const markAll = () => { setErr(null); Promise.all(unread.map((n) => mark(n.id))).catch((e) => setErr(errMessage(e, 'Some completions could not be marked read.'))).finally(refresh); };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-prose">Teams appear here once, when every question is correct or instructor-accepted. These alerts live in this console only; no email is sent.</p>
        <button className={btnGhost} disabled={!unread.length || read.isPending} onClick={markAll} data-testid="button-mark-all-read">Mark all read ({unread.length})</button>
      </div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {!items.length ? (
        <div className="bg-card border border-dashed p-10 text-center" data-testid="panel-no-completions">
          <p className="font-display font-bold text-lg">No team has finished yet</p>
          <p className="text-sm text-muted-foreground">A notice appears here the moment a team clears every question.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id} className={`border p-4 flex flex-wrap items-center gap-3 ${n.readAt ? 'bg-card border-border' : 'bg-primary/5 border-primary'}`} data-testid={`notification-${n.id}`}>
              <span className={`font-mono text-[11px] uppercase px-2 py-1 ${n.readAt ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'}`}>{n.readAt ? 'Read' : 'New'}</span>
              <p className="flex-1 min-w-[14rem] text-sm break-words"><strong>{n.teamName}</strong> completed every question<span className="text-muted-foreground"> | Session {n.sessionDate} | {new Date(n.completedAt).toLocaleString()}</span></p>
              {!n.readAt && <button className={btnGhost} disabled={read.isPending} onClick={() => markOne(n.id)} data-testid={`button-read-${n.id}`}>Mark read</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
