import { useMemo, useState } from 'react';
import type { InstructorAnswerGuide, InstructorAnswerGuideEntry } from '@workspace/api-client-react';
import { ErrorPanel, PageSkeleton, btn, btnGhost, field } from '@/components/shell';
import { errStatus } from '@/lib/ctf';

type Q = { data?: InstructorAnswerGuide; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };

const SOURCE: Record<string, { label: string; note: string }> = {
  fixed: { label: 'Fixed key', note: 'Verified key built into the activity.' },
  classroom: { label: 'Classroom key (active)', note: 'Active instructor grading key.' },
  reference: { label: 'Reference only', note: 'Facilitator reference; not active grading.' },
  manual: { label: 'Manual review', note: 'Individual instructor review. Sample is illustrative only.' },
   format: { label: 'Format validation', note: 'Must match the registered team number.' },
  unconfigured: { label: 'Not configured', note: 'Requires an instructor key or individual evidence.' },
};

export function AnswerGuide({ query }: { query: Q }) {
  const [search, setSearch] = useState('');
  const [section, setSection] = useState('all');
  const entries = query.isError ? undefined : query.data?.entries;
  const sections = useMemo(() => {
    const m = new Map<number, string>();
    (entries ?? []).forEach((e) => m.set(e.section, e.sectionTitle));
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [entries]);
  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (entries ?? []).filter((e) => (section === 'all' || String(e.section) === section) &&
      (!t || [e.code, e.prompt, e.sectionTitle, e.guidance, e.sampleResponse, e.notes, e.format, ...e.answers, ...e.referenceAnswers].join('\n').toLowerCase().includes(t)));
  }, [entries, search, section]);
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError || !query.data) {
    const s = errStatus(query.error);
    return <ErrorPanel title="Could not load answer guide" message={s === 401 || s === 403 ? 'Access code rejected. Lock and unlock again.' : undefined} onRetry={() => query.refetch()} />;
  }
  const groups = sections.filter(([n]) => shown.some((e) => e.section === n));
  return (
    <div className="space-y-5 answer-guide-print">
      <div className="print-hide flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 max-w-2xl">
          <h2 className="font-display text-2xl font-bold">{query.data.title}</h2>
          <p className="text-sm text-muted-foreground" data-testid="text-guide-notice">{query.data.notice}</p>
        </div>
        <button type="button" className={btnGhost} onClick={() => window.print()} data-testid="button-print-guide">Print guide</button>
      </div>
      <div className="print-only hidden"><h2 className="text-xl font-bold">{query.data.title}</h2><p className="text-sm">{query.data.notice}</p></div>
      <div className="print-hide grid sm:grid-cols-[1fr_260px] gap-3">
        <div><label htmlFor="guide-search" className="text-xs font-mono uppercase text-muted-foreground">Search code, question or answer</label>
          <input id="guide-search" type="search" className={field} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-guide-search" /></div>
        <div><label htmlFor="guide-section" className="text-xs font-mono uppercase text-muted-foreground">Section</label>
          <select id="guide-section" className={field} value={section} onChange={(e) => setSection(e.target.value)} data-testid="select-guide-section">
            <option value="all">All sections</option>{sections.map(([n, t]) => <option key={n} value={n}>{n}. {t}</option>)}</select></div>
        <p role="status" className="text-xs text-muted-foreground sm:col-span-2">{shown.length} of {query.data.entries.length} entries shown</p>
      </div>
      {!shown.length ? (
        <div className="bg-card border border-dashed p-8 text-center space-y-3" data-testid="panel-guide-empty">
          <p className="font-display font-bold">No matching entries</p>
          <button type="button" className={btn} onClick={() => { setSearch(''); setSection('all'); }}>Clear search and filter</button>
        </div>
      ) : groups.map(([n, title]) => (
        <section key={n} aria-labelledby={`guide-sec-${n}`} className="space-y-3">
          <h3 id={`guide-sec-${n}`} className="font-display font-bold text-lg">{n}. {title}</h3>
          <ol className="space-y-3">{shown.filter((e) => e.section === n).map((e) => <Entry key={e.id} e={e} />)}</ol>
        </section>
      ))}
    </div>
  );
}

function Block({ label, items, text }: { label: string; items?: string[]; text?: string }) {
  if (!(items?.length) && !text) return null;
  return <div className="space-y-1"><h4 className="text-xs font-mono uppercase text-muted-foreground">{label}</h4>
    {items?.length ? <ul className="space-y-1">{items.map((a, i) => <li key={i} className="text-sm bg-muted p-2 whitespace-pre-wrap break-words">{a}</li>)}</ul> : null}
    {text ? <p className="text-sm whitespace-pre-wrap break-words">{text}</p> : null}</div>;
}

function Entry({ e }: { e: InstructorAnswerGuideEntry }) {
  const s = SOURCE[e.source] ?? { label: e.source, note: '' };
  const multiple = (e.source === 'fixed' || e.source === 'classroom') && e.kind === 'multiple';
  const active = e.source === 'fixed' || e.source === 'classroom' || e.source === 'format';
  const pattern = e.answers.some(answer => answer.includes('<'));
  return (
    <li className="bg-card border border-border p-4 space-y-3 break-inside-avoid" data-testid={`guide-entry-${e.id}`}>
      <p className="text-sm"><span className="font-mono text-xs text-primary">{e.code}</span> | {e.points} pts | {e.kind}</p>
      <p className="text-sm font-medium break-words">{e.prompt}</p>
      <p className="text-xs font-semibold border-l-2 border-accent pl-3">{s.label}<span className="font-normal text-muted-foreground"> - {s.note}</span></p>
      {active && <Block label={pattern ? 'Answer pattern — substitute learner evidence' : multiple ? 'Answer key - all required' : e.answers.length > 1 ? 'Answer key - any one accepted' : 'Answer key'} items={e.answers} />}
      {!active && <Block label="Answer (not active grading)" items={e.answers} />}
      <Block label="Facilitator reference (not active grading)" items={e.referenceAnswers} />
      <Block label="Illustrative sample (not a key)" text={e.sampleResponse} />
      <Block label="Guidance" text={e.guidance} />
      <Block label="Expected format" text={e.format} />
      <Block label="Notes" text={e.notes} />
    </li>
  );
}
