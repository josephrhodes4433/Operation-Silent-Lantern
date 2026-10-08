import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetCtfActivityQueryKey, getGetCtfInstructorKeysQueryKey, getGetCtfInstructorQuestionsQueryKey,
  getListCtfSubmissionsQueryKey, useGetCtfInstructorQuestions, useSetCtfInstructorQuestion,
} from '@workspace/api-client-react';
import type { CtfInstructorQuestion, CtfQuestionInput } from '@workspace/api-client-react';
import { ErrorPanel, Eyebrow, PageSkeleton, btn, field } from '@/components/shell';
import { errStatus } from '@/lib/ctf';

type Kind = CtfQuestionInput['kind'];
type Mode = CtfQuestionInput['validationMode'];
const KINDS: Kind[] = ['single', 'multiple', 'short', 'number', 'long'];
const MODES: Mode[] = ['normalised', 'exact', 'numeric', 'manual', 'dataset'];
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

interface Draft { prompt: string; kind: Kind; options: string; points: string; guideReference: string; validationMethod: string; validationMode: Mode; acceptedAnswers: string }
const blank: Draft = { prompt: '', kind: 'short', options: '', points: '', guideReference: '', validationMethod: '', validationMode: 'normalised', acceptedAnswers: '' };
const fromQ = (q: CtfInstructorQuestion): Draft => ({
  prompt: q.prompt, kind: q.kind, options: q.options.join('\n'), points: String(q.points), guideReference: q.guideReference,
  validationMethod: q.validationMethod, validationMode: q.validationMode, acceptedAnswers: q.acceptedAnswers.join('\n'),
});

export function validate(d: Draft): { errors: string[]; input: CtfQuestionInput } {
  const errors: string[] = [];
  const options = d.kind === 'single' || d.kind === 'multiple' ? lines(d.options) : [];
  const answers = d.validationMode === 'manual' ? lines(d.acceptedAnswers).slice(0, 0) : lines(d.acceptedAnswers);
  const pts = Number(d.points);
  if (!d.prompt.trim()) errors.push('Prompt is required.');
  if (!Number.isInteger(pts) || pts < 0 || pts > 1000 || d.points.trim() === '') errors.push('Points must be a whole number from 0 to 1000.');
  const choice = d.kind === 'single' || d.kind === 'multiple';
  if (choice) {
    if (options.length < 2) errors.push('Choice questions need at least 2 options.');
    if (new Set(options).size !== options.length) errors.push('Options must be unique.');
    if (options.length > 20) errors.push('At most 20 options.');
  } else if (lines(d.options).length) errors.push('Only single and multiple choice questions can have options.');
  const m = d.validationMode;
  if (m === 'numeric' && d.kind !== 'number') errors.push('Numeric mode is only for number questions.');
  if (d.kind === 'number' && !['numeric', 'dataset', 'manual'].includes(m)) errors.push('Number questions use numeric, dataset or manual validation.');
  if (d.kind === 'long' && m !== 'manual') errors.push('Long answers are manual review only.');
  if (m === 'manual' && lines(d.acceptedAnswers).length) errors.push('Manual review questions cannot have accepted answers.');
  if (['normalised', 'exact', 'numeric'].includes(m) && !answers.length) errors.push('This validation mode needs at least one accepted answer.');
  if (choice && answers.some((a) => !options.includes(a))) errors.push('Every accepted answer must match an option exactly.');
  if (d.kind === 'single' && answers.length > 1) errors.push('Single choice accepts one answer.');
  if (d.kind === 'number' && answers.some((a) => !Number.isFinite(Number(a.replace(/,/g, ''))))) errors.push('Numeric answers must be numbers.');
  if (answers.length > 50 || answers.some((a) => a.length > 12000)) errors.push('Use at most 50 accepted answers, each at most 12,000 characters.');
  if (new Set(answers).size !== answers.length) errors.push('Accepted answers must be unique.');
  if (options.some((o) => o.length > 2000)) errors.push('Each option must be at most 2,000 characters.');
  return { errors, input: { prompt: d.prompt.trim(), kind: d.kind, options, points: pts, guideReference: d.guideReference.trim(), validationMethod: d.validationMethod, validationMode: m, acceptedAnswers: answers } };
}

export function QuestionAuthoring({ headers }: { headers: Record<string, string> }) {
  const cat = useGetCtfInstructorQuestions({ query: { enabled: true, queryKey: getGetCtfInstructorQuestionsQueryKey(), refetchOnWindowFocus: false }, request: { headers } });
  const [sel, setSel] = useState(1);
  if (cat.isLoading) return <PageSkeleton />;
  if (cat.isError || !cat.data) return <ErrorPanel title="Could not load questions" message={errStatus(cat.error) === 401 ? 'Access code rejected.' : undefined} onRetry={() => cat.refetch()} />;
  const byId = new Map(cat.data.questions.map((q) => [q.id, q]));
  const missing = new Set(cat.data.missingIds);
  const q = byId.get(sel);
  return (
    <div className="grid lg:grid-cols-[220px_1fr] gap-6" data-testid="panel-authoring">
      <div className="self-start">
        <Eyebrow>Original IDs 1 to 120</Eyebrow>
        <p className="text-xs text-muted-foreground mb-2" data-testid="text-missing-count">{missing.size} missing</p>
        <ul className="grid grid-cols-5 gap-1 max-h-[60vh] overflow-auto" aria-label="Question IDs">
          {Array.from({ length: 120 }, (_, i) => i + 1).map((id) => (
            <li key={id}>
              <button onClick={() => setSel(id)} aria-pressed={sel === id} data-testid={`button-q-${id}`} title={missing.has(id) ? 'Missing' : 'Present'}
                className={`w-full py-1 text-xs font-mono border ${sel === id ? 'bg-primary text-primary-foreground border-primary' : missing.has(id) ? 'border-dashed border-destructive text-destructive' : 'border-border bg-card hover:bg-muted'}`}>
                {id}{missing.has(id) ? '!' : ''}
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground mt-2">Dashed red with ! marks a missing question.</p>
      </div>
      <Editor key={sel} id={sel} q={q} isMissing={!q} headers={headers} />
    </div>
  );
}

function Editor({ id, q, isMissing, headers }: { id: number; q?: CtfInstructorQuestion; isMissing: boolean; headers: Record<string, string> }) {
  const qc = useQueryClient();
  const set = useSetCtfInstructorQuestion({ request: { headers } });
  const [d, setD] = useState<Draft>(q ? fromQ(q) : blank);
  const [ok, setOk] = useState(false);
  const up = (p: Partial<Draft>) => { setD((x) => ({ ...x, ...p })); setOk(false); };
  const { errors, input } = validate(d);
  const choice = d.kind === 'single' || d.kind === 'multiple';
  const save = () => set.mutate({ questionId: id, data: input }, {
    onSuccess: () => {
      setOk(true);
      qc.invalidateQueries({ queryKey: getGetCtfInstructorQuestionsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetCtfActivityQueryKey() });
      qc.invalidateQueries({ queryKey: getGetCtfInstructorKeysQueryKey() });
      qc.invalidateQueries({ queryKey: getListCtfSubmissionsQueryKey() });
      qc.invalidateQueries({ predicate: (qq) => { const k = String(qq.queryKey[0]); return k.startsWith('/api/ctf/progress') || k.startsWith('/api/ctf/instructor/submissions'); } });
    },
  });
  const lab = 'block text-xs font-mono uppercase text-muted-foreground mt-3 mb-1';
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!errors.length) save(); }} className="bg-card border border-border p-5 space-y-1" data-testid="form-question">
      <p className="font-mono text-xs text-primary">Flag {id}{q ? ` | Section ${q.section} | ${q.sectionTitle}` : ''}</p>
      {isMissing && <p className="text-sm border-l-4 border-destructive bg-muted p-3" data-testid="text-missing-note">This question is missing from the catalog. Enter its content and point value from the revised packet. Do not guess missing prompts or keys.</p>}
      <p className="text-xs text-muted-foreground">Saving publishes this definition to learners immediately and recalculates scores using the new definition. Existing responses and original flag IDs are kept.</p>
      <label htmlFor="qa-prompt" className={lab}>Prompt</label>
      <textarea id="qa-prompt" rows={4} maxLength={12000} className={field} value={d.prompt} onChange={(e) => up({ prompt: e.target.value })} data-testid="input-prompt" />
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label htmlFor="qa-kind" className={lab}>Kind</label>
          <select id="qa-kind" className={field} value={d.kind} onChange={(e) => {
            const kind = e.target.value as Kind;
            up({ kind, ...(!['single', 'multiple'].includes(kind) ? { options: '' } : {}),
              ...(kind === 'long' ? { validationMode: 'manual', acceptedAnswers: '' } : kind === 'number' ? { validationMode: 'numeric' } : {}) });
          }} data-testid="select-kind">{KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
        <div><label htmlFor="qa-mode" className={lab}>Validation mode</label>
          <select id="qa-mode" className={field} value={d.validationMode} onChange={(e) => {
            const validationMode = e.target.value as Mode;
            up({ validationMode, ...(validationMode === 'manual' ? { acceptedAnswers: '' } : {}) });
          }} data-testid="select-mode">{MODES.map((k) => <option key={k}>{k}</option>)}</select></div>
        <div><label htmlFor="qa-pts" className={lab}>Points (0 to 1000)</label>
          <input id="qa-pts" type="number" min={0} max={1000} step={1} className={field} value={d.points} onChange={(e) => up({ points: e.target.value })} data-testid="input-points" /></div>
      </div>
      <p className="text-xs text-muted-foreground mt-2" data-testid="text-mode-help">
        Normalised ignores case and punctuation. Exact is case-sensitive. Numeric compares values as numbers. Multiple choice must match the full set of answers. Dataset uses shared keys set in the Answer keys tab. Manual is scored by instructor review.
      </p>
      {choice && <>
        <label htmlFor="qa-opts" className={lab}>Options, one per line</label>
        <textarea id="qa-opts" rows={5} className={field} value={d.options} onChange={(e) => up({ options: e.target.value })} data-testid="input-options" /></>}
      <label htmlFor="qa-ans" className={lab}>Accepted answers, one per line{d.validationMode === 'dataset' ? ' (optional, empty means unkeyed)' : ''}</label>
      <textarea id="qa-ans" rows={3} disabled={d.validationMode === 'manual'} className={`${field} disabled:opacity-50`} value={d.validationMode === 'manual' ? '' : d.acceptedAnswers} onChange={(e) => up({ acceptedAnswers: e.target.value })} data-testid="input-answers" />
      <label htmlFor="qa-guide" className={lab}>Guide reference</label>
      <input id="qa-guide" maxLength={2000} className={field} value={d.guideReference} onChange={(e) => up({ guideReference: e.target.value })} data-testid="input-guide" />
      <label htmlFor="qa-method" className={lab}>Validation method (how to verify against evidence)</label>
      <textarea id="qa-method" rows={3} maxLength={12000} className={field} value={d.validationMethod} onChange={(e) => up({ validationMethod: e.target.value })} data-testid="input-method" />
      {errors.length > 0 && <ul role="alert" className="text-sm text-destructive list-disc pl-5 pt-2" data-testid="list-validation">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="flex items-center gap-3 pt-3">
        <button className={btn} disabled={errors.length > 0 || set.isPending} data-testid="button-save-question">{set.isPending ? 'Saving...' : isMissing ? 'Restore question' : 'Save question'}</button>
        {ok && <span role="status" className="text-sm text-[hsl(var(--ok))]" data-testid="text-saved">Question saved</span>}
        {set.isError && <span role="alert" className="text-sm text-destructive" data-testid="text-save-error">Save failed{errStatus(set.error) ? ` (${errStatus(set.error)})` : ''}. Check the fields and retry.</span>}
      </div>
    </form>
  );
}
