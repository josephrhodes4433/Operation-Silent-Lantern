import { useState } from 'react';
import { ErrorPanel, Skeleton } from '@/components/shell';
import { ReviewActions } from '@/components/review-actions';
import { type QueueSort, useQueueData } from '@/components/instructor-signals';
import { errMessage } from '@/lib/ctf';

const SORTS: [QueueSort, string][] = [
  ['time_asc', 'Submitted: oldest first'], ['time_desc', 'Submitted: newest first'],
  ['name_asc', 'Name: A to Z'], ['name_desc', 'Name: Z to A'],
];

export function ReviewQueue({ code }: { code: string }) {
  const headers = { 'x-instructor-code': code };
  const [sort, setSort] = useState<QueueSort>('time_asc');
  const [decided, setDecided] = useState('');
  const q = useQueueData(code, sort);
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border p-4 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[14rem]">
          <p className="font-display font-bold text-lg" data-testid="text-queue-heading">
            {q.data ? `${q.data.length} ${q.data.length === 1 ? 'response' : 'responses'} awaiting review` : 'Review queue'}
          </p>
          <p className="text-xs text-muted-foreground">Latest nonblank written responses only. A revised response replaces the earlier one. Updates every five seconds.</p>
        </div>
        <div>
          <label htmlFor="queue-sort" className="block text-xs font-mono uppercase text-muted-foreground">Sort by</label>
          <select id="queue-sort" value={sort} onChange={(e) => setSort(e.target.value as QueueSort)} className="border border-input bg-card px-3 py-2 text-sm" data-testid="select-queue-sort">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <p role="status" aria-live="polite" className={decided ? 'text-sm font-semibold text-[hsl(var(--ok))]' : 'sr-only'} data-testid="status-last-decision">{decided}</p>
      {q.isLoading ? <div role="status" aria-label="Loading review queue" className="space-y-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>
        : q.isError || !q.data ? <ErrorPanel title="Could not load the review queue" message={errMessage(q.error, 'Check the connection and retry.')} onRetry={() => q.refetch()} />
        : !q.data.length ? (
          <div className="bg-card border border-dashed p-10 text-center" data-testid="panel-queue-empty">
            <p className="font-display font-bold text-lg">Nothing is waiting</p>
            <p className="text-sm text-muted-foreground">New written responses appear here within a few seconds of being saved.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {q.data.map((it) => (
              <li key={`${it.sessionId}-${it.questionId}`} className="bg-card border border-border" data-testid={`queue-item-${it.sessionId}-${it.questionId}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 bg-muted/60 border-b border-border text-xs font-mono">
                  <span className="bg-secondary text-secondary-foreground px-2 py-0.5">{it.teamNumber == null ? 'No team' : `Team ${it.teamNumber}`}</span>
                  <span className="font-semibold text-sm font-sans">{it.name}</span>
                  <span className="text-primary">{it.code || `Flag ${it.questionId}`}</span>
                  <span>{it.points} pts</span>
                  <time className="ml-auto text-muted-foreground" dateTime={it.updatedAt}>Submitted {new Date(it.updatedAt).toLocaleString()}</time>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-sm font-medium">{it.prompt}</p>
                  <p className="text-sm whitespace-pre-wrap break-words bg-muted p-3" data-testid={`queue-value-${it.sessionId}-${it.questionId}`}>{it.value}</p>
                  <ReviewActions sessionId={it.sessionId} questionId={it.questionId} points={it.points} updatedAt={it.updatedAt} headers={headers}
                    label={`${it.teamNumber == null ? it.name : `Team ${it.teamNumber}`} ${it.code || `Flag ${it.questionId}`}`} onDecided={setDecided} />
                </div>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
