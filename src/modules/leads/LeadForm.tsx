import { useEffect, useRef, useState, type FormEvent } from 'react';
import { errorText, fieldErrors, newKey, warningsOf } from '../../api/client';
import { customersApi, type CustomerSummary } from '../../api/customers';
import { leadsApi, type Duplicates, type Lead, type LeadInput, type Pipeline } from '../../api/leads';
import { PRIORITY_LABEL } from '../../api/reference';
import { useReference } from '../../api/useReference';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../ui/Button';
import { Field, Warnings, fromIstInput, inputClass, toIstInput } from '../../ui/form';
import { Notice } from '../../ui/Notice';

/** P-12 Create a lead / P-13 step 4 Edit details. */
export function LeadForm({ lead, pipelines, defaultPipelineId, onSaved, onCancel }: {
  lead?: Lead; pipelines: Pipeline[]; defaultPipelineId?: string; onSaved: (lead: Lead, message?: string) => void; onCancel: () => void;
}) {
  const ref = useReference();
  const { can } = useAuth();
  const initialFollowUp = toIstInput(lead?.nextFollowUpAt);
  const [form, setForm] = useState({
    pipelineId: lead?.pipelineId ?? defaultPipelineId ?? pipelines[0]?.id ?? '', name: lead?.name ?? '', mobile: lead?.mobile ?? '',
    altMobile: lead?.altMobile ?? '', email: lead?.email ?? '', source: lead?.source ?? '', referrerId: lead?.referrer?.id ?? '',
    referredByCustomerId: lead?.referredBy?.id ?? '', campaign: lead?.campaign ?? '', interests: lead?.interests ?? [],
    priority: lead?.priority ?? 'MEDIUM', nextFollowUpAt: initialFollowUp, notes: lead?.notes ?? '',
  });
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [dups, setDups] = useState<Duplicates | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Array<{ messageId: string; message: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey()); // GR-10: made when the form opens, reused on retry
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const sourceLocked = !!lead && !can('leads.correctSource');

  useEffect(() => {
    if (form.source === 'Referred by a client' && !customers.length) customersApi.list({ status: 'ACTIVE', limit: 100 }).then((r) => setCustomers(r.data)).catch(() => undefined);
  }, [form.source, customers.length]);

  async function checkDuplicates() {
    if (!form.mobile) return;
    try { setDups(await leadsApi.duplicates(form.mobile, form.name || undefined, lead?.id)); } catch { setDups(null); }
  }

  async function submit(confirm: string[] = [], e?: FormEvent) {
    e?.preventDefault();
    setBusy(true); setError(null); setFields({});
    const body: LeadInput = {
      pipelineId: form.pipelineId, name: form.name, mobile: form.mobile, altMobile: form.altMobile || null, email: form.email || null,
      source: form.source, referrerId: form.referrerId || null, referredByCustomerId: form.referredByCustomerId || null, campaign: form.campaign || null,
      interests: form.interests, priority: form.priority, notes: form.notes || null, confirm,
      ...(form.nextFollowUpAt !== initialFollowUp ? { nextFollowUpAt: form.nextFollowUpAt ? fromIstInput(form.nextFollowUpAt) : null } : {}),
    };
    try {
      const r = lead ? await leadsApi.update(lead.id, { ...body, version: lead.version }) : await leadsApi.create(body, key.current);
      setWarnings([]);
      onSaved(r.data, r.meta.message);
    } catch (err) {
      const w = warningsOf(err);
      if (w.length) { setWarnings(w.map((x) => ({ ...x, confirm: [...confirm] }))); return; }
      const f = fieldErrors(err);
      setFields(f);
      setError(Object.keys(f).length > 1 ? errorText(err) : Object.keys(f).length ? null : errorText(err));
    } finally { setBusy(false); }
  }

  if (!ref) return <p className="text-muted">Loading…</p>;
  return (
    <form onSubmit={(e) => submit([], e)} noValidate className="grid gap-3.5 rounded border border-rule bg-sheet p-5">
      <h3 className="text-base font-semibold">{lead ? `Edit ${lead.number}` : 'New lead'}</h3>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Pipeline" required error={fields.pipelineId}>
          <select className={inputClass} value={form.pipelineId} onChange={set('pipelineId')}>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </Field>
        <Field label="Lead name" required error={fields.name}><input className={inputClass} value={form.name} onChange={set('name')} aria-invalid={!!fields.name} /></Field>
        <Field label="Primary mobile" required error={fields.mobile}>
          <input className={inputClass} value={form.mobile} onChange={set('mobile')} onBlur={checkDuplicates} inputMode="tel" placeholder="98123 45678" aria-invalid={!!fields.mobile} />
          {dups && (dups.exact || dups.sameMobile.length > 0 || (dups.customers?.length ?? 0) > 0) && (
            <span className="font-normal text-warn">
              {dups.exact && <>Open lead with this name and mobile: {dups.exact.number}. </>}
              {dups.sameMobile.map((d) => <span key={d.id}>Open lead {d.number} ({d.name}) uses this mobile. </span>)}
              {dups.customers?.map((d) => <span key={d.id}>{d.name} is already your customer ({d.number}). </span>)}
            </span>
          )}
        </Field>
        <Field label="Alternate mobile" error={fields.altMobile}><input className={inputClass} value={form.altMobile} onChange={set('altMobile')} inputMode="tel" /></Field>
        <Field label="Email" error={fields.email}><input className={inputClass} type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Source" required error={fields.source} hint={sourceLocked ? 'Locked after saving: only the advisor can correct it.' : undefined}>
          <select className={inputClass} value={form.source} onChange={set('source')} disabled={sourceLocked}>
            <option value="">Choose…</option>{ref.leadSources.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        {form.source === 'Referred by a referrer' && (
          <Field label="Referrer" required error={fields.referrerId} hint="Referrers (P-44) are not built yet, so this list is empty.">
            <select className={inputClass} value={form.referrerId} onChange={set('referrerId')} disabled={sourceLocked}><option value="">Choose…</option></select>
          </Field>
        )}
        {form.source === 'Referred by a client' && (
          <Field label="Referred by client" required error={fields.referredByCustomerId}>
            <select className={inputClass} value={form.referredByCustomerId} onChange={set('referredByCustomerId')} disabled={sourceLocked}>
              <option value="">Choose a customer…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.number})</option>)}
            </select>
          </Field>
        )}
        {form.source === 'Campaign' && (
          <Field label="Campaign name" required error={fields.campaign}><input className={inputClass} value={form.campaign} onChange={set('campaign')} disabled={sourceLocked} /></Field>
        )}
        <Field label="Priority" error={fields.priority}>
          <select className={inputClass} value={form.priority} onChange={set('priority')}>{ref.priorities.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select>
        </Field>
        <Field label="Next follow-up (IST)" error={fields.nextFollowUpAt}>
          <input className={inputClass} type="datetime-local" value={form.nextFollowUpAt} onChange={set('nextFollowUpAt')} />
        </Field>
      </div>
      <Field label="Insurance interest" error={fields.interests}>
        <span className="flex flex-wrap gap-x-4 gap-y-1 font-normal">
          {ref.insuranceTypes.map((t) => (
            <label key={t} className="flex items-center gap-1.5">
              <input type="checkbox" checked={form.interests.includes(t)} onChange={(e) => setForm({ ...form, interests: e.target.checked ? [...form.interests, t] : form.interests.filter((x) => x !== t) })} />{t}
            </label>
          ))}
        </span>
      </Field>
      <Field label="Notes" error={fields.notes} hint={`${ref.limits.notesMax - form.notes.length} characters left`}>
        <textarea className={`${inputClass} min-h-16`} value={form.notes} onChange={set('notes')} />
      </Field>
      <Warnings items={warnings} busy={busy} onCancel={() => setWarnings([])} onConfirm={() => submit(warnings.map((w) => w.messageId))} />
      <div className="flex gap-2.5">
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : lead ? 'Save changes' : 'Create lead'}</Button>
        <Button type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
