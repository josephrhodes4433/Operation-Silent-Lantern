import { useLocation } from 'wouter';
import { formatCountdown, useActivityWindow } from '@/lib/window';

export function WindowBar() {
  const [loc] = useLocation();
  const w = useActivityWindow();
  if (loc.startsWith('/instructor') || w.isLoading) return null;
  let text: string;
  if (w.isError) text = 'Activity clock unavailable. Learner access is paused until it reconnects.';
  else if (w.state === 'not_started') text = 'The shared 24-hour window starts when the first team begins.';
  else if (w.state === 'open' && w.remainingMs !== null) text = `Shared window closes in ${formatCountdown(w.remainingMs)}. Every team uses this same clock.`;
  else text = 'The activity window has closed.';
  return (
    <div className="bg-accent/20 border-b border-accent/40 text-xs font-mono" data-testid="window-bar" role="timer" aria-live="off">
      <div className="max-w-6xl mx-auto px-4 py-1.5 flex flex-wrap gap-x-4 justify-between">
        <span data-testid="text-window-countdown">{text}</span>
        {w.stale && <span className="text-destructive" data-testid="text-window-stale">Connection lost, retrying. Clock may be behind.</span>}
      </div>
    </div>
  );
}
