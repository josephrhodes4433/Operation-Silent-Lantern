import { useState } from 'react';
import type { LanternWrittenHistoryEntry } from '@workspace/api-client-react';
import { field } from '@/components/shell';
import { groupWrittenVersions, resolveComparison, type WrittenVersion } from '@/lib/written-versions';

export function WrittenComparison({ entries, questionId }: { entries: LanternWrittenHistoryEntry[]; questionId: number }) {
  const [selection, setSelection] = useState<{ left: number; right: number } | null>(null);
  const versions = groupWrittenVersions(entries);
  const pair = resolveComparison(versions, selection);
  return (
    <section aria-labelledby={`compare-heading-${questionId}`} className="border border-border p-3 space-y-3" data-testid={`panel-compare-${questionId}`}>
      <h3 id={`compare-heading-${questionId}`} className="font-semibold text-sm">Compare learner revisions</h3>
      <p className="text-xs text-muted-foreground">Read-only. Instructor decisions on the same version are not separate learner revisions. Only the latest response can be reviewed using the controls above.</p>
      {!pair ? (
        <p role="status" className="text-sm" data-testid={`text-compare-unavailable-${questionId}`}>Only one saved version is available. Comparison requires two learner versions; additional instructor decisions do not create another version.</p>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-3">
            {(['left', 'right'] as const).map(side => {
              const chosen = pair[side];
              const other = pair[side === 'left' ? 'right' : 'left'];
              const id = `compare-${side}-${questionId}`;
              return <div key={side} className="min-w-0 space-y-2">
                <label htmlFor={id} className="text-xs font-mono">{side === 'left' ? 'Left version' : 'Right version'}</label>
                <select id={id} className={field} value={chosen.version} data-testid={`select-${id}`}
                  onChange={event => setSelection({ left: pair.left.version, right: pair.right.version, [side]: Number(event.target.value) })}>
                  {versions.map(version => <option key={version.version} value={version.version} disabled={version.version === other.version}>
                    Version {version.version}{version.version === versions[versions.length - 1].version ? ' (latest)' : ''}{version.imported ? ' (imported snapshot)' : ''} — {new Date(version.snapshot.responseUpdatedAt).toLocaleString()}
                  </option>)}
                </select>
                <VersionCard version={chosen} latest={chosen.version === versions[versions.length - 1].version} testId={`${side}-${questionId}`} />
              </div>;
            })}
          </div>
          {pair.left.snapshot.value === pair.right.snapshot.value && <p role="status" className="text-sm" data-testid={`text-compare-identical-${questionId}`}>These versions contain identical response text.</p>}
        </>
      )}
    </section>
  );
}

function VersionCard({ version, latest, testId }: { version: WrittenVersion; latest: boolean; testId: string }) {
  const { snapshot } = version;
  return (
    <article className="border border-border p-3 space-y-3" data-testid={`comparison-version-${testId}`}>
      <h4 className="text-sm font-semibold">Version {version.version} — {latest ? 'Latest saved response' : 'Historical response'}</h4>
      <p className="text-xs text-muted-foreground">Response saved: {new Date(snapshot.responseUpdatedAt).toLocaleString()}</p>
      <p className="text-sm whitespace-pre-wrap break-words bg-muted p-2" data-testid={`text-comparison-response-${testId}`}>{snapshot.value || '(Blank response)'}</p>
      <p className="text-xs font-mono" data-testid={`text-comparison-status-${testId}`}>Last recorded state: {version.latest.decision} | {version.latest.points === null ? 'not scored' : `${version.latest.points} pts`}</p>
      {version.imported && <p className="text-xs text-muted-foreground">Imported latest snapshot: earlier attempts and the original decision time are unavailable. Importing a snapshot is not a new learner revision.</p>}
      {snapshot.event === 'imported' && <p className="text-sm whitespace-pre-wrap break-words">Imported feedback: {snapshot.feedback || 'None'}</p>}
      <h5 className="text-xs font-semibold">Instructor decisions on this version ({version.decisions.length})</h5>
      {!version.decisions.length ? <p className="text-xs text-muted-foreground">No instructor decision events recorded for this version.</p> : (
        <ol className="space-y-2" data-testid={`list-comparison-decisions-${testId}`}>
          {version.decisions.map((decision, index) => <li key={decision.id} className="border-t border-border pt-2 space-y-1">
            <p className="text-xs font-mono">Decision {index + 1}: {decision.decision} | {decision.points === null ? 'not scored' : `${decision.points} pts`}</p>
            <p className="text-xs text-muted-foreground">Recorded: {new Date(decision.recordedAt).toLocaleString()}</p>
            <p className="text-sm whitespace-pre-wrap break-words">Feedback: {decision.feedback || 'None'}</p>
          </li>)}
        </ol>
      )}
    </article>
  );
}
