import { Link } from 'wouter';
import { useGetCtfActivity } from '@workspace/api-client-react';
import { ArrowRight, FileWarning } from 'lucide-react';
import { ErrorPanel, Eyebrow, PageSkeleton, Shell, btn, btnGhost } from '@/components/shell';

const PIRS = [
  'Who are the persons of interest within the MERIDIAN network, and why?',
  'What is the MERIDIAN network’s area of operation and its primary operating hubs? Which can be confirmed to the standard required for physical action?',
  'What additional collection opportunities exist beyond the seized devices — cloud accounts, associated handsets, backup hosts or partner-held data — that would extend coverage of the network?',
];

export default function Overview() {
  const q = useGetCtfActivity();
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
                A media-exploitation scenario for analysts. Work each section in order, validate keyed answers instantly, and write up findings for instructor review.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/activity" className={btn} data-testid="link-start">Begin activity <ArrowRight size={16} /></Link>
                <Link href="/results" className={btnGhost} data-testid="link-results">Saved results</Link>
              </div>
            </div>
            <dl className="grid grid-cols-3 border border-border bg-card">
              {[['Questions', a.totalFlags], ['Points', a.totalPoints], ['Duration', a.duration]].map(([k, v]) => (
                <div key={String(k)} className="p-4 border-r last:border-r-0 border-border">
                  <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{k}</dt>
                  <dd className="font-display text-2xl font-bold mt-1" data-testid={`stat-${String(k).toLowerCase()}`}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="bg-card border border-border p-6 space-y-4" aria-labelledby="read-in">
            <Eyebrow>Scenario read-in</Eyebrow>
            <h2 id="read-in" className="font-display text-2xl font-bold">The warehouse on Meridian Road</h2>
            <p className="text-muted-foreground">At 0410, a joint task force raids a freight consolidation yard linked to MERIDIAN, a compartmented network moving precision components through shell consignees. Your media exploitation cell receives the recovered extractions. You have an air-gapped workstation, Inseyets Physical Analyzer and the course software folder — but no second shift. The commander's targeting board needs findings that are hashed, independently validated and traceable to their source artifacts.</p>
            <dl className="grid md:grid-cols-3 gap-4">
              {[
                ['ALPHA', 'Samsung Galaxy S21 5G', 'C — Drew Cheatham: File System Qualcomm Live 03 + Advanced Logical 01. Yard leaseholder / facilitator.'],
                ['BRAVO', 'Apple iPhone 12', 'D — Jay Walker: EvidenceCollection.ufd / .ufdx. Courier and targeting candidate.'],
                ['CHARLIE', 'Apple iPhone 5S backup', 'F — Manual Trabajo: iTunes Backup Extraction. Foreign-language node; handset still at large.'],
              ].map(([call, device, description]) => <div key={call} className="border-l-2 border-accent pl-3"><dt className="font-mono text-sm font-bold">{call} / {device}</dt><dd className="text-sm text-muted-foreground mt-2">{description}</dd></div>)}
            </dl>
            <p className="text-xs text-muted-foreground">All people, organisations, locations and events are fictitious. Use only the course Student Folder extractions and taught capabilities. The source schedule includes a 40-minute break.</p>
          </section>

          <section aria-labelledby="pir" className="rise bg-secondary text-secondary-foreground p-6 sm:p-8">
            <Eyebrow>Priority intelligence requirements</Eyebrow>
            <h2 id="pir" className="font-display text-2xl font-bold mt-2 mb-5">What the command needs from you</h2>
            <ol className="space-y-3">
              {PIRS.map((p, i) => (
                <li key={i} className="flex gap-4"><span className="font-mono text-accent">PIR-{i + 1}</span><span className="text-white/85">{p}</span></li>
              ))}
            </ol>
            <p className="mt-6 text-sm text-white/80 border-t border-white/20 pt-4"><strong className="text-accent">CCIR:</strong> Report immediately any indication that the network has been alerted to the raid, or that material has been remotely wiped or is scheduled for destruction. Do not wait for the board.</p>
          </section>

          <section aria-labelledby="sections">
            <h2 id="sections" className="font-display text-2xl font-bold mb-4">Mission sections</h2>
            <p role="note" className="text-sm border-l-4 border-accent bg-card p-4 mb-5">The revised packet's summary advertises 120 flags and 1,370 points, but originally left 43 question rows blank. Currently {a.totalFlags} questions worth {a.totalPoints} points are available, preserving their original flag numbers. {120 - a.totalFlags > 0 ? `${120 - a.totalFlags} rows still need instructor-supplied content. Ask your instructor for updated tasking rather than guessing at absent questions.` : 'Your instructor has supplied all missing question rows.'}</p>
            <ol className="grid md:grid-cols-2 gap-4">
              {a.sections.map((s) => {
                const count = a.questions.filter((x) => x.section === s.id).length;
                return (
                  <li key={s.id} className="bg-card border border-border p-5 flex gap-4" data-testid={`card-section-${s.id}`}>
                    <span className="font-display text-4xl font-bold text-primary/30">{String(s.id).padStart(2, '0')}</span>
                    <div className="space-y-2 flex-1">
                      <h3 className="font-display font-bold text-lg">{s.title}</h3>
                      <p className="text-sm text-muted-foreground">{s.inject}</p>
                      <p className="font-mono text-xs text-muted-foreground">{s.time} | flags {s.flags} | {count} populated</p>
                      {count === 0 ? (
                        <p className="flex items-center gap-2 text-sm text-[hsl(var(--warn))]"><FileWarning size={16} /> Source-content gap: this section has no question content.</p>
                      ) : (
                        <Link href={`/activity?flag=${a.questions.find(x => x.section === s.id)?.id}`} className="text-sm font-semibold text-primary inline-flex items-center gap-1">Open <ArrowRight size={14} /></Link>
                      )}
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
