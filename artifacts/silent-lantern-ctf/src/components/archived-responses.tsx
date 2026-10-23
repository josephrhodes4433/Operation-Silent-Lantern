import type { LanternProgress } from '@workspace/api-client-react';
import type { ReactNode } from 'react';
import { asText } from '@/lib/ctf';

const codes = ['M1-Q1', 'M1-FLAG01', 'M1-Q2', 'M2-Q1', 'M2-FLAG02', 'M2-Q2', 'M3-Q1', 'M3-FLAG03', 'M3-Q2', 'M4-FLAG04', 'M4-Q1', 'M4-Q2', 'M5-Q1', 'M5-FLAG05', 'M5-Q2', 'M6-FLAG06', 'M6-Q1', 'M6-Q2'];

export function ArchivedResponses({ progress: p, history }: { progress: LanternProgress; history?: (id: number) => ReactNode }) {
  const entries = Object.entries(p.archivedAnswers ?? {}).sort(([a], [b]) => Number(a) - Number(b));
  if (!entries.length && !p.authorizationNotes) return null;
  return <details className="border border-border bg-card p-4 space-y-3" data-testid="archived-responses">
    <summary className="cursor-pointer font-semibold">Earlier activity — saved responses (read-only)</summary>
    <p className="text-sm text-muted-foreground">The feedback revision uses new question identities. Earlier work is retained here, but its answers, approvals, hints, and final-submission state do not count toward the revised activity.</p>
    {entries.map(([id, answer]) => <div key={id} className="border-t border-border pt-3">
      <p className="font-mono text-xs">Earlier {codes[Number(id) - 1] ?? `question ${id}`} · {answer.reviewStatus ?? answer.status} · {new Date(answer.updatedAt).toLocaleString()}</p>
      <p className="text-sm whitespace-pre-wrap break-words">{asText(answer.value)}</p>
      {answer.instructorNote && <p className="text-sm text-muted-foreground">Instructor: {answer.instructorNote}</p>}
      {[6, 7, 11, 17, 18].includes(Number(id)) && history?.(Number(id))}
    </div>)}
    {p.authorizationNotes && <p className="text-sm whitespace-pre-wrap">Earlier preservation notes: {p.authorizationNotes}</p>}
  </details>;
}
