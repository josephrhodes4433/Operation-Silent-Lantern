import { Link } from 'wouter';
import { useGetLanternActivity } from '@workspace/api-client-react';
import { ArrowRight } from 'lucide-react';
import { ErrorPanel, Eyebrow, PageSkeleton, Shell, btn, btnGhost } from '@/components/shell';

export default function Overview() {
  const q = useGetLanternActivity();
  const a = q.data;
  return (
    <Shell>
      {q.isLoading && <PageSkeleton />}
      {q.isError && <ErrorPanel title="Mission brief unavailable" message="The activity could not be loaded." onRetry={() => q.refetch()} />}
      {a && (
        <div className="space-y-12">
          <section className="rise grid lg:grid-cols-[1.4fr_1fr] gap-8 items-end">
            <div className="space-y-5">
              <Eyebrow>{a.course}</Eyebrow>
              <h1 className="font-display font-bold text-5xl sm:text-7xl leading-[0.95] tracking-tight" data-testid="text-title">{a.title}</h1>
              <p className="max-w-xl text-lg text-muted-foreground">
                A six-mission UFED exercise for analysts. Work each mission in order, capture the flag to unlock the next, and write up findings for instructor review.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/activity" className={btn} data-testid="link-start">Begin activity <ArrowRight size={16} /></Link>
                <Link href="/results" className={btnGhost} data-testid="link-results">Saved results</Link>
              </div>
            </div>
            <dl className="grid grid-cols-4 border border-border bg-card">
              {[['Responses', a.questions.length], ['Flags', a.totalFlags === a.questions.length ? 6 : a.questions.filter((x) => x.isFlag).length], ['Points', a.totalPoints], ['Duration', a.duration]].map(([k, v]) => (
                <div key={String(k)} className="p-4 border-r last:border-r-0 border-border">
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{k}</dt>
                  <dd className="font-display text-2xl font-bold mt-1" data-testid={`stat-${String(k).toLowerCase()}`}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="bg-card border border-border p-6 space-y-4" aria-labelledby="read-in">
            <Eyebrow>Scenario read-in</Eyebrow>
            <h2 id="read-in" className="font-display text-2xl font-bold">Scenario</h2>
            <p className="text-muted-foreground whitespace-pre-line" data-testid="text-scenario">{a.scenario}</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-display font-bold mb-2">Rules of engagement</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground" data-testid="list-rules">{a.rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
              <div>
                <h3 className="font-display font-bold mb-2">Evidence</h3>
                <ul className="space-y-2 text-sm" data-testid="list-evidence">{a.evidence.map((e, i) => <li key={i} className="border-l-2 border-accent pl-3 text-muted-foreground">{e}</li>)}</ul>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">All people, organizations, locations, and events are fictitious. Three hint tokens are available for the whole exercise; each costs 2 points.</p>
          </section>

          <section aria-labelledby="sections">
            <h2 id="sections" className="font-display text-2xl font-bold mb-4">Missions</h2>
            <ol className="grid md:grid-cols-2 gap-4">
              {[...a.sections].sort((x, y) => x.id - y.id).map((s) => {
                const first = a.questions.filter((x) => x.section === s.id).sort((x, y) => x.id - y.id)[0];
                return (
                  <li key={s.id} className="bg-card border border-border p-5 flex gap-4" data-testid={`card-section-${s.id}`}>
                    <span className="font-display text-4xl font-bold text-primary/30">{String(s.id).padStart(2, '0')}</span>
                    <div className="space-y-2 flex-1">
                      <h3 className="font-display font-bold text-lg">{s.title}</h3>
                      <p className="text-sm text-muted-foreground">{s.inject}</p>
                      <p className="font-mono text-xs text-muted-foreground">{s.time} | flags {s.flags} | {s.points} pts</p>
                      {first && <Link href={`/activity?flag=${first.id}`} className="text-sm font-semibold text-primary inline-flex items-center gap-1">Open <ArrowRight size={14} /></Link>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      )}
    </Shell>
  );
}
