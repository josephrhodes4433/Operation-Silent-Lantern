import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, MessageSquarePlus, X } from 'lucide-react';
import {
  getGetLanternInstructorSubmissionQueryKey, getGetLanternReviewQueueQueryKey, getListLanternSubmissionsQueryKey, useReviewLanternWrittenAnswer,
} from '@workspace/api-client-react';
import { field } from '@/components/shell';
import { errMessage, errStatus } from '@/lib/ctf';

type Decision = 'approved' | 'approved_with_feedback' | 'denied';
const DONE: Record<Decision, string> = {
  approved: 'Accepted. Full points awarded.',
  approved_with_feedback: 'Accepted with feedback. Full points awarded.',
  denied: 'Denied with feedback. The team must revise and resubmit.',
};
const base = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Three explicit decisions for one written (non-choice) response. Accepting always awards the
 * full question points; feedback is mandatory unless the response is accepted plainly.
 * `updatedAt` must be the latest saved answer timestamp so the server can reject stale decisions.
 */
export function ReviewActions({ sessionId, questionId, points, updatedAt, headers, label, onDecided }: {
  sessionId: string; questionId: number; points: number; updatedAt: string; headers: Record<string, string>;
  label?: string; onDecided?: (message: string) => void;
}) {
  const qc = useQueryClient();
  const rev = useReviewLanternWrittenAnswer({ request: { headers } });
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'stale' | 'error'; text: string } | null>(null);
  const [seenAt, setSeenAt] = useState(updatedAt);
  const revised = seenAt !== updatedAt;
  const trimmed = note.trim();
  const noteId = `nt-${sessionId}-${questionId}`;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetLanternInstructorSubmissionQueryKey(sessionId) });
    qc.invalidateQueries({ queryKey: [getListLanternSubmissionsQueryKey()[0]] });
    qc.invalidateQueries({ queryKey: [getGetLanternReviewQueueQueryKey()[0]] });
  };

  const decide = (decision: Decision) => {
    if (decision !== 'approved' && !trimmed) return;
    setMsg(null);
    rev.mutate({
      sessionId, questionId,
      data: { decision, note: decision === 'approved' ? '' : trimmed, points, responseUpdatedAt: updatedAt },
    }, {
      onSuccess: () => {
        setNote('');
        setMsg({ kind: 'ok', text: DONE[decision] });
        onDecided?.(`${label ?? `Question ${questionId}`}: ${DONE[decision]}`);
        refresh();
      },
      onError: (e) => {
        if (errStatus(e) === 409) {
          setMsg({ kind: 'stale', text: `${errMessage(e, 'This response changed before your decision could be saved.')} Nothing was recorded. The latest response is being loaded; read it, then decide again. Your feedback has been kept.` });
          refresh();
        } else {
          setMsg({ kind: 'error', text: `Decision NOT saved. ${errMessage(e, 'Check the connection and try again.')}` });
        }
      },
    });
  };

  const blocked = rev.isPending || revised;
  return (
    <div className="border-t border-border pt-3 space-y-3" data-testid={`review-actions-${questionId}`}>
      {revised && (
        <div role="alert" className="border-l-4 border-[hsl(var(--warn))] bg-muted/60 p-3 text-sm space-y-2" data-testid={`notice-revised-${questionId}`}>
          <p>The team revised this response after you opened it. Read the updated text above before deciding. Your typed feedback is preserved.</p>
          <button type="button" className={`${base} border border-input bg-card hover:bg-muted`} onClick={() => setSeenAt(updatedAt)} data-testid={`button-ack-revised-${questionId}`}>I have read the revised response</button>
        </div>
      )}
      <div>
        <label htmlFor={noteId} className="text-xs font-mono uppercase text-muted-foreground">Feedback for the team (required to accept with feedback or deny)</label>
        <textarea id={noteId} rows={2} maxLength={2000} className={field} value={note} onChange={(e) => { setNote(e.target.value); if (msg?.kind !== 'stale') setMsg(null); }}
          aria-describedby={`${noteId}-hint`} data-testid={`input-note-${questionId}`} />
        <p id={`${noteId}-hint`} className="text-xs text-muted-foreground mt-1">All accept decisions award the full {points} {points === 1 ? 'point' : 'points'}. A plain accept sends no note.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${base} bg-primary text-primary-foreground hover:brightness-110`} disabled={blocked} onClick={() => decide('approved')} data-testid={`button-accept-${questionId}`}>
          <Check size={16} /> Accept response
        </button>
        <button type="button" className={`${base} border-2 border-[hsl(var(--ok))] bg-card text-foreground hover:bg-muted`} disabled={blocked || !trimmed} onClick={() => decide('approved_with_feedback')} data-testid={`button-accept-feedback-${questionId}`}>
          <MessageSquarePlus size={16} /> Accept with feedback
        </button>
        <button type="button" className={`${base} bg-destructive text-destructive-foreground hover:brightness-110`} disabled={blocked || !trimmed} onClick={() => decide('denied')} data-testid={`button-deny-${questionId}`}>
          <X size={16} /> Deny with feedback
        </button>
      </div>
      <div role="status" aria-live="polite" className="text-sm" data-testid={`status-review-${questionId}`}>
        {rev.isPending && 'Saving decision...'}
        {!rev.isPending && msg?.kind === 'ok' && <span className="text-[hsl(var(--ok))] font-semibold">Decision saved. {msg.text}</span>}
      </div>
      {msg && msg.kind !== 'ok' && <p role="alert" className="text-sm text-destructive border-l-4 border-destructive bg-muted/50 p-3" data-testid={`error-review-${questionId}`}>{msg.text}</p>}
    </div>
  );
}
