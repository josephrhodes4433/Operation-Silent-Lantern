import { getGetCtfLeaderboardQueryKey, useGetCtfLeaderboard } from '@workspace/api-client-react';
import { ErrorPanel, Eyebrow, Shell, Skeleton } from '@/components/shell';

export default function Leaderboard() {
  const q = useGetCtfLeaderboard({ query: { queryKey: getGetCtfLeaderboardQueryKey(), refetchInterval: 5000, staleTime: 0 } });
  const rows = [...(q.data ?? [])].sort((a, b) => b.percentage - a.percentage || a.teamNumber - b.teamNumber);
  return (
    <Shell>
      <div className="space-y-6 rise">
        <div>
          <Eyebrow>Teams | live</Eyebrow>
          <h1 className="font-display text-4xl font-bold">Leaderboard</h1>
          <p className="text-sm text-muted-foreground max-w-prose mt-2">Share of all questions a team has answered correctly or had accepted by an instructor. Team labels only. Refreshes every five seconds.</p>
        </div>
        {q.isLoading ? (
          <div role="status" aria-label="Loading leaderboard" className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : q.isError && !q.data ? (
          <ErrorPanel title="Leaderboard unavailable" message="The standings could not be loaded." onRetry={() => q.refetch()} />
        ) : !rows.length ? (
          <div className="bg-card border border-dashed p-10 text-center" data-testid="panel-leaderboard-empty">
            <p className="font-display font-bold text-lg">No teams on the board yet</p>
            <p className="text-sm text-muted-foreground">Teams appear as soon as they check in.</p>
          </div>
        ) : (
          <>
            {q.isError && <p role="alert" className="text-sm text-destructive border-l-4 border-destructive bg-card p-3" data-testid="text-leaderboard-stale">Could not refresh. Showing the last standings received. <button className="underline" onClick={() => q.refetch()}>Retry</button></p>}
            <ol className="space-y-2" data-testid="list-leaderboard">
              {rows.map((r) => {
                const pct = Math.max(0, Math.min(100, r.percentage));
                const shown = `${Number(pct.toFixed(1))}%`;
                return (
                  <li key={r.teamNumber} className="bg-card border border-border p-4 grid grid-cols-[1fr_auto] sm:grid-cols-[9rem_1fr_auto] items-center gap-x-4 gap-y-2" data-testid={`row-team-${r.teamNumber}`}>
                    <span className="font-display font-bold text-lg">Team {r.teamNumber}</span>
                    <span className="font-mono text-lg font-bold tabular-nums sm:order-last" data-testid={`text-percent-${r.teamNumber}`}>{shown}</span>
                    <div role="progressbar" aria-label={`Team ${r.teamNumber} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(pct.toFixed(1))} aria-valuetext={shown}
                      className="col-span-2 sm:col-span-1 h-3 bg-muted overflow-hidden">
                      <div className="h-full w-full bg-primary origin-left transition-transform duration-700 motion-reduce:transition-none" style={{ transform: `scaleX(${pct / 100})` }} />
                    </div>
                  </li>
                );
              })}
            </ol>
            <p role="status" aria-live="off" className="text-xs font-mono text-muted-foreground" data-testid="text-updated">Updated {new Date(q.dataUpdatedAt).toLocaleTimeString()}</p>
          </>
        )}
      </div>
    </Shell>
  );
}
