import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { AlertTriangle, RefreshCw } from 'lucide-react';

const nav = [
  { href: '/', label: 'Mission' },
  { href: '/activity', label: 'Activity' },
  { href: '/results', label: 'Results' },
  { href: '/instructor', label: 'Instructor' },
];

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-accent focus:p-2">Skip to content</a>
      <header className="bg-secondary text-secondary-foreground border-b-4 border-primary">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
          <Link href="/" className="flex items-baseline gap-3" data-testid="link-home">
            <span className="font-display font-bold text-xl tracking-[0.18em]">CELLEBRITE</span>
            <span className="text-[11px] uppercase tracking-[0.2em] text-primary-foreground/60 hidden sm:inline">Defense &amp; Intelligence</span>
          </Link>
          <nav aria-label="Primary" className="flex gap-1 ml-auto">
            {nav.map((n) => {
              const on = n.href === '/' ? loc === '/' : loc.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} data-testid={`nav-${n.label.toLowerCase()}`} aria-current={on ? 'page' : undefined}
                  className={`px-3 py-1.5 text-sm font-medium border-b-2 ${on ? 'border-accent text-white' : 'border-transparent text-white/60 hover:text-white'}`}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">{children}</main>
      <footer className="border-t border-border bg-card/70 text-xs text-muted-foreground">
        <div className="max-w-6xl mx-auto px-4 py-4">
          IRON MERIDIAN is an independent practice exercise. It is not an official Cellebrite product and implies no endorsement or affiliation.
        </div>
      </footer>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">{children}</p>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skel ${className}`} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <Skeleton className="h-10 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" />
    </div>
  );
}

export function ErrorPanel({ title = 'Something failed', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="border-l-4 border-destructive bg-card p-5 flex gap-3" data-testid="panel-error">
      <AlertTriangle className="text-destructive shrink-0" />
      <div className="space-y-2">
        <p className="font-display font-bold">{title}</p>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        {onRetry && (
          <button onClick={onRetry} data-testid="button-retry" className="inline-flex items-center gap-2 text-sm font-medium text-primary underline">
            <RefreshCw size={14} /> Try again
          </button>
        )}
      </div>
    </div>
  );
}

export const btn = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
export const btnGhost = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold border border-input bg-card hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
export const field = 'w-full border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring';
