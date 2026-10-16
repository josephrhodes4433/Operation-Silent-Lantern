import { useId, useMemo, useState } from 'react';
import type { CtfSubmissionSummary } from '@workspace/api-client-react';

const TZ = 'America/New_York';
const fmtStamp = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const fmtDay = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'full' }).format(new Date(Date.UTC(y, m - 1, d)));
};
const wrap = 'break-words [overflow-wrap:anywhere]';

export function SessionArchives({ submissions, onOpen }: { submissions: CtfSubmissionSummary[]; onOpen: (sessionId: string) => void }) {
  const selId = useId();
  const [date, setDate] = useState('all');
  const groups = useMemo(() => {
    const byDate = new Map<string, CtfSubmissionSummary[]>();
    for (const s of submissions) byDate.set(s.sessionDate, [...(byDate.get(s.sessionDate) ?? []), s]);
    return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([d, rows]) => ({ date: d, rows: [...rows].sort((x, y) => x.teamName.localeCompare(y.teamName)) }));
  }, [submissions]);
  const shown = date === 'all' ? groups : groups.filter((g) => g.date === date);

  return (
    <section className="space-y-5" aria-labelledby={`${selId}-h`} data-testid="session-archives">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={`${selId}-h`} className="font-display text-xl font-bold">Session archive</h2>
          <p className="text-sm text-muted-foreground">One table per calendar date (Eastern Time), newest first. Earlier sessions stay available.</p>
        </div>
        <div>
          <label htmlFor={selId} className="block text-xs font-mono uppercase text-muted-foreground">Session date</label>
          <select id={selId} value={date} onChange={(e) => setDate(e.target.value)} data-testid="select-session-date"
            className="border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring">
            <option value="all">All dates ({groups.length})</option>
            {groups.map((g) => <option key={g.date} value={g.date}>{fmtDay(g.date)}</option>)}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Every authorized instructor can open every recorded date. Records hold team name, instructor name, date, scores and responses only. Sessions from earlier windows are read-only.</p>

      {!shown.length && (
        <div className="bg-card border border-dashed p-8 text-center" data-testid="panel-no-sessions">
          <p className="font-display font-bold text-lg">No sessions recorded</p>
          <p className="text-sm text-muted-foreground">Team sessions appear here once a team starts saving answers.</p>
        </div>
      )}

      {shown.map((g) => (
        <div key={g.date} className="space-y-2" data-testid={`session-date-${g.date}`}>
          <h3 className="font-display font-bold">{fmtDay(g.date)} <span className="font-mono text-xs text-muted-foreground">{g.rows.length} {g.rows.length === 1 ? 'team' : 'teams'}</span></h3>
          <div className="overflow-x-auto border border-border bg-card" tabIndex={0} role="region" aria-label={`Teams for ${fmtDay(g.date)}, scrollable`}>
            <table className="w-full min-w-[640px] text-sm text-left border-collapse">
              <caption className="sr-only">Teams that started on {fmtDay(g.date)}, Eastern Time</caption>
              <thead className="bg-muted text-xs font-mono uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="p-3 font-medium">Team</th>
                  <th scope="col" className="p-3 font-medium">Instructor</th>
                  <th scope="col" className="p-3 font-medium">Saved / submitted</th>
                  <th scope="col" className="p-3 font-medium">Score and responses</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((s) => (
                  <tr key={s.sessionId} className="border-t border-border align-top">
                    <th scope="row" className={`p-3 font-semibold max-w-[14rem] ${wrap}`}>{s.teamName}{s.windowId === null && <span className="block font-mono text-[10px] uppercase text-muted-foreground">Legacy, read-only</span>}</th>
                    <td className={`p-3 max-w-[14rem] ${wrap}`}>{s.instructorName}</td>
                    <td className="p-3 text-xs">
                      <span className="block">Saved {fmtStamp(s.savedAt)}</span>
                      <span className={`block font-semibold ${s.submittedAt ? '' : 'text-muted-foreground'}`}>{s.submittedAt ? `Submitted ${fmtStamp(s.submittedAt)}` : 'Saved, not submitted'}</span>
                    </td>
                    <td className="p-3 space-y-1">
                      <p className="font-mono text-xs">{s.totalPoints} pts | {s.answeredCount} answered</p>
                      <button type="button" onClick={() => onOpen(s.sessionId)} data-testid={`button-open-${s.sessionId}`}
                        aria-label={`Open responses for team ${s.teamName}`}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        Open responses
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

export default SessionArchives;
