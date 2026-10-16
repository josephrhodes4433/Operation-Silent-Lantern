import { useEffect, useState } from 'react';
import { getGetLanternWindowQueryKey, useGetLanternWindow } from '@workspace/api-client-react';
import type { ActivityWindow } from '@workspace/api-client-react';

// Countdown is derived from the server clock plus elapsed monotonic time, never the browser wall clock.
let anchor = { at: 0, perf: 0 };

export type EffectiveState = 'loading' | 'error' | 'not_started' | 'open' | 'expired';

export function useActivityWindow() {
  const q = useGetLanternWindow({ query: { queryKey: getGetLanternWindowQueryKey(), refetchInterval: 5000, staleTime: 0, refetchOnWindowFocus: true } });
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 1000); return () => window.clearInterval(t); }, []);
  const data = q.data as ActivityWindow | undefined;
  if (data && q.dataUpdatedAt !== anchor.at) anchor = { at: q.dataUpdatedAt, perf: performance.now() };
  let remainingMs: number | null = null;
  let state: EffectiveState = q.isLoading ? 'loading' : 'error';
  if (data) {
    const nowMs = Date.parse(data.serverNow) + (performance.now() - anchor.perf);
    remainingMs = data.expiresAt ? Date.parse(data.expiresAt) - nowMs : null;
    state = data.state === 'open' && (remainingMs === null || Number.isNaN(remainingMs) || remainingMs <= 0) ? 'expired' : data.state;
  }
  if (q.isError) state = 'error';
  // Fail closed: no confirmed window means no learner access.
  return { window: data, state, remainingMs, isLoading: q.isLoading && !data, isError: q.isError, stale: !!data && q.isError, refetch: () => q.refetch() };
}

/** Sessions from a different or legacy window are read-only. */
export function isArchivedSession(sessionWindowId: string | null, w: ActivityWindow | undefined): boolean {
  if (sessionWindowId === null || !w) return true;
  return w.state !== 'open' || w.windowId !== sessionWindowId;
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
