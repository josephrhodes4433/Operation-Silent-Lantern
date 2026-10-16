import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { btnGhost, field } from '@/components/shell';
import { buildMailDraft, downloadResults } from '@/lib/ctf';
import type { LanternActivity, LanternProgress } from '@workspace/api-client-react';

type Mode = 'self' | 'instructor';

// Copy-sharing only. The recipient lives in React state, is never stored, sent to this app's server, or placed in the page URL.
export function EmailShare({ a, p, disabled }: { a: LanternActivity; p: LanternProgress; disabled?: boolean }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => () => setTo(''), []);
  const cancel = () => { setMode(null); setTo(''); };
  const open = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const r = to.trim();
    if (!r || !e.currentTarget.checkValidity()) return;
    const d = buildMailDraft(a, p, r);
    setTo(''); setMode(null);
    if (d.oversize) {
      downloadResults(a, p);
      setNote('Your responses are too long for a draft body, so a text file was downloaded. Attach that file to the draft yourself before you press Send. It is not attached automatically.');
    } else {
      setNote('Your mail app should now show a draft. Press Send there; nothing is sent from this site.');
    }
    window.location.href = d.href;
  };
  return (
    <div className="space-y-3 border-t border-border pt-4" data-testid="email-share">
      <p className="text-sm font-medium">Optional: copy these results to an inbox</p>
      <p className="text-xs text-muted-foreground">This opens a draft in your own mail app, where you press Send. There is no mail-service integration, and the address never reaches this app's server; it is cleared as soon as the draft opens.</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={btnGhost} disabled={disabled} onClick={() => { setMode('self'); setNote(''); setTo(''); }} data-testid="button-email-self"><Mail size={16} /> Email myself</button>
        <button type="button" className={btnGhost} disabled={disabled} onClick={() => { setMode('instructor'); setNote(''); setTo(''); }} data-testid="button-email-instructor"><Mail size={16} /> Email instructor</button>
      </div>
      {mode && (
        <form onSubmit={open} autoComplete="off" className="bg-muted p-4 space-y-3" data-testid="form-email-share">
          <label htmlFor="share-to" className="block text-sm font-medium">{mode === 'self' ? 'Your email address' : "Instructor's email address"}</label>
          <input id="share-to" type="email" required autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={254} className={field} value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-share-recipient" />
          <p className="text-xs text-muted-foreground">You must press Send in your mail app. Long responses are not placed in the draft; you will get a text file to attach by hand.</p>
          <div className="flex gap-3">
            <button className={btnGhost} data-testid="button-open-draft">Open email draft</button>
            <button type="button" className="text-sm underline" onClick={cancel} data-testid="button-cancel-share">Cancel</button>
          </div>
        </form>
      )}
      {note && <p role="status" className="text-sm" data-testid="text-share-note">{note}</p>}
    </div>
  );
}
