import { useId, useMemo, useState } from 'react';
import type { CtfSubmissionSummary } from '@workspace/api-client-react';

const TZ = 'America/New_York';
const fmtStamp = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const fmtDay = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'full' }).format(new Date(Date.UTC(y, m - 1, d)));
};

type Team = { key: string; name: string; members: string[]; subs: CtfSubmissionSummary[] };

function buildTeams(rows: CtfSubmissionSummary[]): Team[] {
  const map = new Map<string, Team>();
  for (const s of rows) {
    const label = (s.teamName ?? '').trim() || 'Unnamed team';
    const key = label.toLowerCase();
    const t = map.get(key) ?? { key, name: label, members: [], subs: [] };
    t.subs.push(s);
    for (const m of [...(s.teamMembers ?? []), s.name]) {
      const v = (m ?? '').trim();
      if (v && !t.members.some((x) => x.toLowerCase() === v.toLowerCase())) t.members.push(v);
    }
    map.set(key, t);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const latest = (xs: string[]) => xs.reduce((a, b) => (new Date(b) > new Date(a) ? b : a));
const wrap = 'break-words [overflow-wrap:anywhere]';

export function SessionArchives({ submissions, onOpen }: { submissions: CtfSubmissionSummary[]; onOpen: (sessionId: string) => void }) {
  const selId = useId();
  const [date, setDate] = useState('all');
  const groups = useMemo(() => {
    const byDate = new Map<string, CtfSubmissionSummary[]>();
    for (const s of submissions) byDate.set(s.sessionDate, [...(byDate.get(s.sessionDate) ?? []), s]);
    return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([d, rows]) => ({ date: d, teams: buildTeams(rows) }));
  }, [submissions]);
  const shown = date === 'all' ? groups : groups.filter((g) => g.date === date);

  return (
    <section className="space-y-5" aria-labelledby={`${selId}-h`} data-testid="session-archives">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={`${selId}-h`} className="font-display text-xl font-bold">Session archive</h2>
          <p className="text-sm text-muted-foreground">One table per start date (Eastern Time), newest first. Earlier sessions stay available.</p>
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
      <p className="text-xs text-muted-foreground">All instructors with valid access can open every recorded date. Older submissions may list only the originally recorded learner; their dates use the recorded submission date or, if not submitted, the last-saved date.</p>

      {!shown.length && (
        <div className="bg-card border border-dashed p-8 text-center" data-testid="panel-no-sessions">
          <p className="font-display font-bold text-lg">No sessions recorded</p>
          <p className="text-sm text-muted-foreground">Team sessions appear here once a team starts saving answers.</p>
        </div>
      )}

      {shown.map((g) => (
        <div key={g.date} className="space-y-2" data-testid={`session-date-${g.date}`}>
          <h3 className="font-display font-bold">{fmtDay(g.date)} <span className="font-mono text-xs text-muted-foreground">{g.teams.length} {g.teams.length === 1 ? 'team' : 'teams'}</span></h3>
          <div className="overflow-x-auto border border-border bg-card" tabIndex={0} role="region" aria-label={`Teams for ${fmtDay(g.date)}, scrollable`}>
            <table className="w-full min-w-[640px] text-sm text-left border-collapse">
              <caption className="sr-only">Teams and members that started on {fmtDay(g.date)}, Eastern Time</caption>
              <thead className="bg-muted text-xs font-mono uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="p-3 font-medium">Team</th>
                  <th scope="col" className="p-3 font-medium">Members</th>
                  <th scope="col" className="p-3 font-medium">Saved / submitted</th>
                  <th scope="col" className="p-3 font-medium">Responses</th>
                </tr>
              </thead>
              <tbody>
                {g.teams.map((t) => (
                  <tr key={t.key} className="border-t border-border align-top">
                    <th scope="row" className={`p-3 font-semibold max-w-[14rem] ${wrap}`}>{t.name}</th>
                    <td className={`p-3 max-w-[16rem] ${wrap}`}>
                      <ul className="space-y-0.5">{t.members.map((m) => <li key={m}>{m}</li>)}</ul>
                    </td>
                    <td className="p-3 text-xs space-y-2">
                      {t.subs.map((s) => (
                        <p key={s.sessionId} className={wrap}>
                          <span className="block">Saved {fmtStamp(s.savedAt)}</span>
                          <span className={`block font-semibold ${s.submittedAt ? '' : 'text-muted-foreground'}`}>
                            {s.submittedAt ? `Submitted ${fmtStamp(s.submittedAt)}` : 'Saved, not submitted'}
                          </span>
                        </p>
                      ))}
                      {t.subs.length > 1 && <span className="block text-muted-foreground">Latest save {fmtStamp(latest(t.subs.map((s) => s.savedAt)))}</span>}
                    </td>
                    <td className="p-3 space-y-2">
                      {t.subs.map((s) => (
                        <div key={s.sessionId} className="space-y-1">
                          <p className={`font-mono text-xs ${wrap}`}>{s.name} | {s.totalPoints} pts | {s.answeredCount} answered</p>
                          <button type="button" onClick={() => onOpen(s.sessionId)} data-testid={`button-open-${s.sessionId}`}
                            aria-label={`Open responses for ${s.name}, team ${t.name}`}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                            Open responses
                          </button>
                        </div>
                      ))}
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
