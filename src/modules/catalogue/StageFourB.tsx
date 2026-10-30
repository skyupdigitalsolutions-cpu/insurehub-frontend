import { useCallback, useEffect, useState } from 'react';
import { errorText, fieldErrors } from '../../api/client';
import { correctionsApi, ocrApi, type CorrectionView, type OcrJobView } from '../../api/catalogue';
import { upload } from '../../api/profile';
import { Button } from '../../ui/Button';
import { Field, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';

const th = 'border-b border-rule py-1.5 pr-2 text-left text-[0.8125rem] font-semibold text-muted';
const td = 'border-b border-rule py-1.5 pr-2 align-top';
const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** P-58 (advisor): suggest a correction to a verified product; never an edit of the shared record. */
export function SuggestCorrection({ productId }: { productId: string }) {
  const [fields, setFields] = useState<Array<{ field: string; label: string }>>([]);
  const [mine, setMine] = useState<CorrectionView[]>([]);
  const [f, setF] = useState({ field: '', proposedValue: '', reason: '' });
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { correctionsApi.mine(productId).then(setMine, () => undefined); }, [productId]);
  useEffect(() => { load(); correctionsApi.fields(productId).then(setFields, () => undefined); }, [productId, load]);
  async function send() {
    setErrors({}); setError(null);
    try { const r = await correctionsApi.suggest(productId, f); setMessage(r.meta.message ?? 'Sent.'); setOpen(false); setF({ field: '', proposedValue: '', reason: '' }); load(); }
    catch (e) { setErrors(fieldErrors(e)); setError(errorText(e)); }
  }
  return (
    <div className="mt-4 rounded border border-rule p-3 text-[0.875rem]">
      <div className="flex flex-wrap items-center gap-3"><h4 className="font-semibold">Corrections</h4><span className="text-muted">Something wrong? SkyUp checks every suggestion.</span><span className="flex-1" />{!open && <Button onClick={() => setOpen(true)}>Suggest a correction</Button>}</div>
      {message && <div className="mt-2"><Notice>{message}</Notice></div>}
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Field" required error={errors.field}><select className={inputClass} value={f.field} onChange={(e) => setF({ ...f, field: e.target.value })}><option value="">Choose…</option>{fields.map((x) => <option key={x.field} value={x.field}>{x.label}</option>)}</select></Field>
          <Field label="Correct value" required error={errors.proposedValue}><input className={inputClass} value={f.proposedValue} onChange={(e) => setF({ ...f, proposedValue: e.target.value })} /></Field>
          <Field label="Reason" required error={errors.reason} hint="For example: brochure page 4"><input className={inputClass} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          <div className="flex gap-2 sm:col-span-3"><Button variant="primary" onClick={() => void send()}>Send to SkyUp</Button><Button variant="link" onClick={() => setOpen(false)}>Cancel</Button></div>
          {error && <div className="sm:col-span-3"><Notice tone="error">{error}</Notice></div>}
        </div>
      )}
      {mine.length > 0 && (
        <table className="mt-3 w-full"><thead><tr><th className={th}>Field</th><th className={th}>Suggested</th><th className={th}>Status</th></tr></thead>
          <tbody>{mine.map((c) => <tr key={c.id}><td className={td}>{fields.find((x) => x.field === c.field)?.label ?? c.field}</td><td className={td}>{c.proposedValue}</td><td className={td}>{c.status.toLowerCase()}{c.rejectReason ? `: ${c.rejectReason}` : ''}</td></tr>)}</tbody></table>
      )}
    </div>
  );
}

/** P-58 (SkyUp): Admin → Approvals → Product corrections. */
export function CorrectionsQueue() {
  const [rows, setRows] = useState<CorrectionView[] | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { correctionsApi.queue().then(setRows, (e) => setError(errorText(e))); }, []);
  useEffect(load, [load]);
  async function act(c: CorrectionView, accept: boolean) {
    setError(null); setMessage(null);
    try {
      if (accept) { await correctionsApi.accept(c.id); setMessage(`Accepted: the value is in a draft of ${c.product}. Submit it for approval in Products.`); }
      else { if (!(reason[c.id] ?? '').trim()) { setError('Enter a reason for rejecting.'); return; } await correctionsApi.reject(c.id, reason[c.id]!.trim()); setMessage('Rejected; the advisor has been told.'); }
      load();
    } catch (e) { setError(errorText(e)); }
  }
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-[1.05rem] font-semibold">Product corrections</h3>
      {message && <div className="mb-2"><Notice>{message}</Notice></div>}
      {error && <div className="mb-2"><Notice tone="error">{error}</Notice></div>}
      {!rows ? <p className="text-muted">Loading…</p> : rows.length === 0 ? <p className="text-muted">No corrections waiting.</p> : rows.map((c) => (
        <div key={c.id} className="mb-3 rounded border border-rule bg-sheet p-3 text-[0.875rem]">
          <div className="font-semibold">{c.product}: {c.field}</div>
          <div>Now: <span className="text-muted">{show(c.currentValue)}</span> → suggested: <span className="font-medium">{c.proposedValue}</span></div>
          <div className="text-muted">Reason: {c.reason}</div>
          <div className="mt-2 flex flex-wrap gap-2"><Button variant="primary" onClick={() => void act(c, true)}>Accept</Button>
            <input className={`${inputClass} max-w-[280px]`} placeholder="Reason (to reject)" value={reason[c.id] ?? ''} onChange={(e) => setReason({ ...reason, [c.id]: e.target.value })} />
            <Button variant="danger" onClick={() => void act(c, false)}>Reject</Button></div>
        </div>
      ))}
    </section>
  );
}

/** P-23 (SkyUp): Brochure → Read with OCR → review every value → Apply to draft. */
export function BrochureOcr({ versionId, onApplied }: { versionId: string; onApplied: () => void }) {
  const [job, setJob] = useState<OcrJobView | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setJob(await ocrApi.latest(versionId)); } catch { /* none yet */ } }, [versionId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (job?.status !== 'QUEUED' && job?.status !== 'PROCESSING') return;
    const t = setTimeout(() => void load(), 2000);
    return () => clearTimeout(t);
  }, [job, load]);
  async function run(file: File) {
    setError(null); setMessage(null);
    try { const f = await upload(file, 'BROCHURE'); const r = await ocrApi.start(versionId, f.id); setMessage(r.meta.message ?? null); setJob(r.data); }
    catch (e) { setError(fieldErrors(e).fileId ?? errorText(e)); }
  }
  async function decide(key: string, decision: string, value?: string) {
    if (!job) return;
    try { setJob(await ocrApi.decide(job.id, [{ key, decision, value: value ?? null }])); } catch (e) { setError(errorText(e)); }
  }
  async function apply() {
    if (!job) return;
    setError(null);
    try { const r = await ocrApi.apply(job.id); setMessage(r.meta.message ?? 'Applied.'); setJob(r.data); onApplied(); } catch (e) { setError(errorText(e)); }
  }
  return (
    <div className="mt-4 rounded border border-rule p-3 text-[0.875rem]">
      <div className="flex flex-wrap items-center gap-3">
        <h4 className="font-semibold">Brochure</h4>
        <label className="inline-flex cursor-pointer items-center rounded border border-ink-soft px-2.5 py-1 text-[0.8125rem]">Read with OCR…
          <input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(f); e.target.value = ''; }} /></label>
        {job && <span className="text-muted">Last job: {job.status.replace('_', ' ').toLowerCase()}</span>}
      </div>
      {message && <div className="mt-2"><Notice>{message}</Notice></div>}
      {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
      {job?.status === 'FAILED' && <div className="mt-2"><Notice tone="error">We could not read this brochure. Enter the values by hand, or try again. <Button onClick={() => void ocrApi.retry(job.id).then((r) => setJob(r.data), (e) => setError(errorText(e)))}>Try again</Button></Notice></div>}
      {job?.status === 'REVIEW_REQUIRED' && (
        <>
          <table className="mt-3 w-full"><thead><tr><th className={th}>Feature</th><th className={th}>Value found</th><th className={th}>Confidence</th><th className={th}>Page</th><th className={th}>Decision</th></tr></thead>
            <tbody>{job.rows.map((r) => (
              <tr key={r.key} className={r.flagged ? 'bg-warn-tint' : ''}>
                <td className={td}>{r.name}</td>
                <td className={td}>{r.found ? r.value : <span className="text-muted">Not found. Mark it Not stated, or type it.</span>}</td>
                <td className={td}>{r.found ? `${Math.round(r.confidence * 100)}%` : '—'}</td>
                <td className={td}>{r.page ?? '—'}</td>
                <td className={td}>
                  <select className={`${inputClass} py-1`} value={r.decision ?? ''} onChange={(e) => e.target.value && e.target.value !== 'EDIT' && void decide(r.key, e.target.value)}>
                    <option value="">Choose…</option>{r.found && <option value="ACCEPT">Accept</option>}<option value="EDIT">Edit</option><option value="IGNORE">Ignore</option><option value="NOT_STATED">Not stated</option>
                  </select>
                  <span className="mt-1 flex gap-1"><input className={`${inputClass} py-1`} placeholder="Correct value" value={edits[r.key] ?? r.editedValue ?? ''} onChange={(e) => setEdits({ ...edits, [r.key]: e.target.value })} />
                    <Button onClick={() => void decide(r.key, 'EDIT', edits[r.key] ?? '')}>Use</Button></span>
                </td>
              </tr>
            ))}</tbody></table>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void ocrApi.acceptHigh(job.id).then(setJob, (e) => setError(errorText(e)))}>Accept all above {job.threshold}%</Button>
            <Button variant="primary" onClick={() => void apply()}>Apply to draft</Button>
          </div>
        </>
      )}
    </div>
  );
}