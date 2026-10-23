import { useRef, useState, type FormEvent } from 'react';
import { errorText, fieldErrors, newKey, warningsOf } from '../../api/client';
import { customersApi, type Customer } from '../../api/customers';
import { CONTACT_LABEL, GENDER_LABEL } from '../../api/reference';
import { useReference } from '../../api/useReference';
import { Button } from '../../ui/Button';
import { Field, Warnings, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';

/** P-15 Create or edit a customer. Changing mobile or email asks CU-21 / CU-22 first (consent belongs to them). */
export function CustomerForm({ customer, onSaved, onCancel }: { customer?: Customer; onSaved: (c: Customer, message?: string) => void; onCancel: () => void }) {
  const ref = useReference();
  const c = customer;
  const [form, setForm] = useState({
    name: c?.name ?? '', mobile: c?.mobile ?? '', altMobile: c?.altMobile ?? '', email: c?.email ?? '', dob: c?.dob ?? '', gender: c?.gender ?? '',
    preferredContact: c?.preferredContact ?? '', addressLine1: c?.address.line1 ?? '', addressLine2: c?.address.line2 ?? '', city: c?.address.city ?? '',
    state: c?.address.state ?? '', pin: c?.address.pin ?? '', anniversary: c?.anniversary ?? '', occupation: c?.occupation ?? '', notes: c?.notes ?? '',
  });
  const [dupText, setDupText] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Array<{ messageId: string; message: string }>>([]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function checkDuplicates() {
    if (!form.mobile) return;
    try {
      const d = await customersApi.duplicates(form.mobile, form.name || undefined, c?.id);
      const parts = [d.exact && `${d.exact.name} (${d.exact.number}) has this name and mobile.`, ...d.sameMobile.map((m) => `${m.name} (${m.number}) uses this mobile.`)].filter(Boolean);
      setDupText(parts.length ? parts.join(' ') : null);
    } catch { setDupText(null); }
  }

  async function submit(confirm: string[], e?: FormEvent) {
    e?.preventDefault();
    setBusy(true); setError(null); setFields({});
    const body: Record<string, unknown> = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]));
    try {
      const r = c ? await customersApi.update(c.id, { ...body, version: c.version, confirm }) : await customersApi.create({ ...body, confirm }, key.current);
      onSaved(r.data, r.meta.message);
    } catch (err) {
      const w = warningsOf(err);
      if (w.length) { setConfirmed(confirm); setWarnings(w); return; }
      const f = fieldErrors(err);
      setFields(f);
      if (Object.keys(f).length !== 1) setError(errorText(err));
    } finally { setBusy(false); }
  }

  if (!ref) return <p className="text-muted">Loading…</p>;
  const text = (k: keyof typeof form, label: string, extra: object = {}) => (
    <Field label={label} error={fields[k]} required={k === 'name' || k === 'mobile'}>
      <input className={inputClass} value={form[k]} onChange={set(k)} aria-invalid={!!fields[k]} {...extra} />
    </Field>
  );
  return (
    <form onSubmit={(e) => submit([], e)} noValidate className="grid gap-3.5 rounded border border-rule bg-sheet p-5">
      <h3 className="text-base font-semibold">{c ? `Edit ${c.number}` : 'New customer'}</h3>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-3.5 sm:grid-cols-3">
        {text('name', 'Full name')}
        <Field label="Primary mobile" required error={fields.mobile}>
          <input className={inputClass} value={form.mobile} onChange={set('mobile')} onBlur={checkDuplicates} inputMode="tel" aria-invalid={!!fields.mobile} />
          {dupText && <span className="font-normal text-warn">{dupText}</span>}
        </Field>
        {text('altMobile', 'Alternate mobile', { inputMode: 'tel' })}
        {text('email', 'Email', { type: 'email' })}
        <Field label="Date of birth" error={fields.dob}><input className={inputClass} type="date" value={form.dob} onChange={set('dob')} /></Field>
        <Field label="Gender" error={fields.gender}><select className={inputClass} value={form.gender} onChange={set('gender')}><option value="">—</option>{ref.genders.map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}</select></Field>
        <Field label="Preferred contact"><select className={inputClass} value={form.preferredContact} onChange={set('preferredContact')}><option value="">—</option>{ref.preferredContacts.map((p) => <option key={p} value={p}>{CONTACT_LABEL[p]}</option>)}</select></Field>
        <Field label="Wedding anniversary" error={fields.anniversary}><input className={inputClass} type="date" value={form.anniversary} onChange={set('anniversary')} /></Field>
        {text('occupation', 'Occupation')}
        {text('addressLine1', 'Address line 1')}
        {text('addressLine2', 'Address line 2')}
        {text('city', 'City')}
        <Field label="State" error={fields.state}><select className={inputClass} value={form.state} onChange={set('state')}><option value="">—</option>{ref.states.map((s) => <option key={s}>{s}</option>)}</select></Field>
        {text('pin', 'PIN code', { inputMode: 'numeric' })}
      </div>
      <Field label="Notes" error={fields.notes} hint={`${ref.limits.notesMax - form.notes.length} characters left`}>
        <textarea className={`${inputClass} min-h-14`} value={form.notes} onChange={set('notes')} />
      </Field>
      <Warnings items={warnings} busy={busy} confirmLabel="Continue" onCancel={() => setWarnings([])} onConfirm={() => { const next = [...confirmed, ...warnings.map((w) => w.messageId)]; setWarnings([]); void submit(next); }} />
      <div className="flex gap-2.5">
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : c ? 'Save changes' : 'Save customer'}</Button>
        <Button type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
