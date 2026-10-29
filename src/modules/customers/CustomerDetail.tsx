import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, errorText, fieldErrors, newKey } from '../../api/client';
import { customersApi, type Channel, type ConsentGrid, type Customer, type FamilyMember } from '../../api/customers';
import { CONTACT_LABEL, GENDER_LABEL } from '../../api/reference';
import { useReference } from '../../api/useReference';
import { useAuth } from '../../auth/AuthProvider';
import { CustomerDocuments } from '../documents/DocumentsModule';
import { VehiclesTab } from '../vehicles/vehiclesTab';
import { Button } from '../../ui/Button';
import { Field, Tabs, fmtDate, fmtDateTime, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';
import { CustomerForm } from './CustomerForm';

type Flash = (msg?: string | null, tone?: 'ok' | 'error') => void;
const th = 'border-b border-rule py-2 pr-3 text-left font-semibold text-muted';
const td = 'border-b border-rule py-2 pr-3 align-top';
const CHANNEL: Record<Channel, string> = { WHATSAPP: 'WhatsApp', EMAIL: 'Email', SMS: 'SMS', PERSONAL_DATA: 'Store personal data' };

function Overview({ c, reload, flash }: { c: Customer; reload: () => Promise<void>; flash: Flash }) {
  const ref = useReference();
  const { can, user } = useAuth();
  const [deact, setDeact] = useState({ open: false, reason: '', note: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const act = async (fn: () => Promise<{ meta: { message?: string } }>) => {
    try { flash((await fn()).meta.message); setFields({}); setDeact({ open: false, reason: '', note: '' }); await reload(); }
    catch (e) { setFields(fieldErrors(e)); flash(errorText(e), 'error'); }
  };
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-[0.875rem]">
        <dt className="text-muted">Mobile</dt><dd>{c.mobile}{c.altMobile && <span className="text-muted"> · alt {c.altMobile}</span>}</dd>
        <dt className="text-muted">Email</dt><dd>{c.email ?? '—'}</dd>
        <dt className="text-muted">Date of birth</dt><dd>{fmtDate(c.dob)}{c.age !== null && <span className="text-muted"> · {c.age} years (GR-38)</span>}</dd>
        <dt className="text-muted">Gender</dt><dd>{c.gender ? GENDER_LABEL[c.gender] : '—'}</dd>
        <dt className="text-muted">Preferred contact</dt><dd>{c.preferredContact ? CONTACT_LABEL[c.preferredContact] : '—'}</dd>
        <dt className="text-muted">Address</dt><dd>{[c.address.line1, c.address.line2, c.address.city, c.address.state, c.address.pin].filter(Boolean).join(', ') || '—'}</dd>
        <dt className="text-muted">Anniversary</dt><dd>{fmtDate(c.anniversary)}</dd>
        <dt className="text-muted">Occupation</dt><dd>{c.occupation ?? '—'}</dd>
        <dt className="text-muted">Source</dt><dd>{c.source}{c.leads[0] && ` · lead ${c.leads[0].number}`}{c.referredBy && ` · referred by ${c.referredBy.name} (${c.referredBy.number})`}</dd>
        <dt className="text-muted">Notes</dt><dd className="whitespace-pre-wrap">{c.notes ?? '—'}</dd>
        {c.status === 'INACTIVE' && (<><dt className="text-muted">Inactive because</dt><dd>{c.statusReason}{c.statusNote && ` — ${c.statusNote}`}</dd></>)}
      </dl>
      <p className="text-[0.8125rem] text-muted">Quotations, policies, payments, renewals, documents and communications tabs arrive with their modules (Sections 9–15).</p>
      {can('customers.deactivate') && !user?.readOnly && (c.status === 'ACTIVE' ? (
        deact.open ? (
          <div className="grid gap-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
            <Field label="Reason" required error={fields.reason}><select className={inputClass} value={deact.reason} onChange={(e) => setDeact({ ...deact, reason: e.target.value })}><option value="">Choose…</option>{ref?.deactivationReasons.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Note" required={deact.reason === 'Other'} error={fields.note}><input className={inputClass} value={deact.note} onChange={(e) => setDeact({ ...deact, note: e.target.value })} /></Field>
            <Button variant="danger" onClick={() => window.confirm(`Deactivate customer ${c.number}?`) && act(() => customersApi.deactivate(c.id, { version: c.version, reason: deact.reason, ...(deact.note ? { note: deact.note } : {}) }))}>Deactivate</Button>
          </div>
        ) : <div><Button variant="danger" onClick={() => setDeact({ ...deact, open: true })}>Deactivate customer</Button></div>
      ) : <div><Button onClick={() => act(() => customersApi.reactivate(c.id, c.version))}>Reactivate customer</Button></div>)}
    </div>
  );
}

function Family({ c, reload, flash }: { c: Customer; reload: () => Promise<void>; flash: Flash }) {
  const ref = useReference();
  const [form, setForm] = useState({ name: '', relationship: '', dob: '', mobile: '', email: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const key = useRef(newKey());
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  async function add() {
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      flash((await customersApi.addMember(c.id, body, key.current)).meta.message);
      key.current = newKey(); setForm({ name: '', relationship: '', dob: '', mobile: '', email: '' }); setFields({}); await reload();
    } catch (e) { setFields(fieldErrors(e)); flash(errorText(e), 'error'); }
  }
  async function toggle(m: FamilyMember) {
    if (m.status === 'ACTIVE' && !window.confirm(`Deactivate ${m.name}?`)) return;
    try { flash((await customersApi.setMember(c.id, m.id, m.status !== 'ACTIVE', m.version)).meta.message); await reload(); }
    catch (e) { flash(errorText(e), 'error'); }
  }
  return (
    <div className="grid gap-4">
      <p className="text-[0.875rem] text-ink-soft">P-16: a family member is never a nominee or insured person automatically. Up to {ref?.limits.familyMax} active members (CFG-35).</p>
      {c.family.length > 0 && (
        <table className="w-full border-collapse text-[0.8125rem]">
          <thead><tr><th className={th}>Name</th><th className={th}>Relationship</th><th className={th}>Age</th><th className={th}>Mobile</th><th className={th}>Status</th><th className={th} /></tr></thead>
          <tbody>{c.family.map((m) => (
            <tr key={m.id}><td className={td}>{m.name}</td><td className={td}>{m.relationship}</td><td className={td}>{m.age ?? '—'}</td><td className={td}>{m.mobile ?? '—'}</td><td className={td}>{m.status}</td>
              <td className={td}>{c.status === 'ACTIVE' && <Button variant="link" onClick={() => toggle(m)}>{m.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</Button>}</td></tr>
          ))}</tbody>
        </table>
      )}
      {c.status === 'ACTIVE' && (
        <div className="grid gap-3 rounded border border-rule p-3 sm:grid-cols-3">
          <Field label="Full name" required error={fields.name}><input className={inputClass} value={form.name} onChange={set('name')} /></Field>
          <Field label="Relationship" required error={fields.relationship}><select className={inputClass} value={form.relationship} onChange={set('relationship')}><option value="">Choose…</option>{ref?.relationships.map((r) => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Date of birth" error={fields.dob}><input className={inputClass} type="date" value={form.dob} onChange={set('dob')} /></Field>
          <Field label="Mobile" error={fields.mobile}><input className={inputClass} value={form.mobile} onChange={set('mobile')} /></Field>
          <Field label="Email" error={fields.email}><input className={inputClass} value={form.email} onChange={set('email')} /></Field>
          <div className="flex items-end"><Button variant="primary" onClick={add}>+ Family member</Button></div>
        </div>
      )}
    </div>
  );
}

function Consent({ c, flash }: { c: Customer; flash: Flash }) {
  const ref = useReference();
  const [grid, setGrid] = useState<ConsentGrid | null>(null);
  const [editing, setEditing] = useState<{ personType: 'CUSTOMER' | 'FAMILY'; personId: string; name: string; channel: Channel; version?: number } | null>(null);
  const [how, setHow] = useState('');
  const [declared, setDeclared] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const load = useCallback(async () => setGrid(await customersApi.consents(c.id)), [c.id]);
  useEffect(() => { load().catch((e) => flash(errorText(e), 'error')); }, [load, flash]);

  async function record(b: { personType: 'CUSTOMER' | 'FAMILY'; personId: string; channel: Channel; action: 'GIVE' | 'WITHDRAW'; version?: number }) {
    try {
      const r = await customersApi.recordConsent(c.id, { ...b, ...(b.action === 'GIVE' ? { howGiven: how || undefined, declaration: declared } : {}) }, newKey());
      setGrid(r.data); flash(r.meta.message); setEditing(null); setHow(''); setDeclared(false); setFields({});
    } catch (e) { setFields(fieldErrors(e)); flash(errorText(e), 'error'); if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') await load(); }
  }
  if (!grid) return <p className="text-muted">Loading consent…</p>;
  const cell = (personType: 'CUSTOMER' | 'FAMILY', personId: string, name: string, ch: Channel, s: { status: string; at: string | null; version: number | null }) => (
    <td className={td} key={ch}>
      <div className={s.status === 'GIVEN' ? 'text-ok' : s.status === 'WITHDRAWN' ? 'text-bad' : 'text-muted'}>{s.status.replace('_', ' ')}</div>
      {s.at && <div className="text-[0.72rem] text-muted">{fmtDateTime(s.at)}</div>}
      {s.status === 'GIVEN'
        ? <Button variant="link" onClick={() => window.confirm(`Withdraw ${CHANNEL[ch]} consent for ${name}?`) && record({ personType, personId, channel: ch, action: 'WITHDRAW', version: s.version ?? undefined })}>Withdraw</Button>
        : c.status === 'ACTIVE' && <Button variant="link" onClick={() => setEditing({ personType, personId, name, channel: ch, version: s.version ?? undefined })}>Record</Button>}
    </td>
  );
  return (
    <div className="grid gap-4">
      <p className="text-[0.875rem] text-ink-soft">P-17: consent per person and channel, for the exact mobile or email it was given for. "Store personal data" (GR-37) must be given before PAN or Aadhaar can be saved.</p>
      <table className="w-full border-collapse text-[0.8125rem]">
        <thead><tr><th className={th}>Person</th><th className={th}>WhatsApp</th><th className={th}>Email</th><th className={th}>SMS</th><th className={th}>Store personal data</th></tr></thead>
        <tbody>{grid.rows.map((r) => (
          <tr key={r.person.id}>
            <td className={td}><span className="font-medium">{r.person.name}</span><div className="text-muted">{r.person.relationship}</div></td>
            {(['WHATSAPP', 'EMAIL', 'SMS'] as const).map((ch) => cell(r.person.type, r.person.id, r.person.name, ch, r.channels[ch]))}
            {r.person.type === 'CUSTOMER' ? cell('CUSTOMER', r.person.id, r.person.name, 'PERSONAL_DATA', grid.personalData) : <td className={td}>—</td>}
          </tr>
        ))}</tbody>
      </table>
      {editing && (
        <div className="grid gap-3 rounded border border-rule p-3">
          <h4 className="font-semibold">Record {CHANNEL[editing.channel]} consent for {editing.name}</h4>
          <Field label="How it was given" required error={fields.howGiven}>
            <select className={inputClass} value={how} onChange={(e) => setHow(e.target.value)}><option value="">Choose…</option>{ref?.consentHowGiven.map((h) => <option key={h}>{h}</option>)}</select>
          </Field>
          <Field label="Declaration" error={fields.declaration}>
            <span className="flex items-start gap-2 font-normal"><input type="checkbox" className="mt-1" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
              {editing.channel === 'PERSONAL_DATA' ? `${editing.name} agreed that I may store their identity documents and personal details in Bimayantra for insurance work.`
                : `${editing.name} agreed to receive ${CHANNEL[editing.channel]} messages from me through Bimayantra. I have explained what they will receive.`}</span>
          </Field>
          <p className="text-[0.8125rem] text-muted">Evidence file upload arrives with the document vault (P-18).</p>
          <div className="flex gap-2.5"><Button variant="primary" onClick={() => record({ personType: editing.personType, personId: editing.personId, channel: editing.channel, action: 'GIVE', version: editing.version })}>Save consent</Button><Button onClick={() => setEditing(null)}>Cancel</Button></div>
        </div>
      )}
      <div>
        <h4 className="mb-2 font-semibold">History</h4>
        <ol className="m-0 grid list-none gap-1.5 p-0 text-[0.8125rem]">{grid.history.map((h, i) => (
          <li key={i} className="border-l-2 border-rule pl-3">{h.person} · {CHANNEL[h.channel]}: {h.from ?? 'NOT_RECORDED'} → <span className="font-medium">{h.to}</span>
            <span className="text-muted"> · {fmtDateTime(h.at)}{h.howGiven && ` · ${h.howGiven}`}{h.note && ` · ${h.note}`}{h.source !== 'USER' && ` · ${h.source}`}</span></li>
        ))}{!grid.history.length && <li className="text-muted">No consent recorded yet.</li>}</ol>
      </div>
    </div>
  );
}

function Identity({ c, reload, flash }: { c: Customer; reload: () => Promise<void>; flash: Flash }) {
  const { can, user } = useAuth();
  const [form, setForm] = useState({ pan: '', aadhaar: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<{ field: string; value: string; left: number } | null>(null);
  useEffect(() => {
    if (!shown) return;
    if (shown.left <= 0) { setShown(null); return; } // masked again after CFG-176
    const t = setTimeout(() => setShown({ ...shown, left: shown.left - 1 }), 1000);
    return () => clearTimeout(t);
  }, [shown]);
  async function save() {
    try {
      const r = await customersApi.setIdentity(c.id, { version: c.version, ...(form.pan ? { pan: form.pan } : {}), ...(form.aadhaar ? { aadhaar: form.aadhaar } : {}) });
      flash([r.meta.message, ...(r.meta.warnings ?? []).map((w) => w.message)].join(' '));
      setForm({ pan: '', aadhaar: '' }); setFields({}); await reload();
    } catch (e) { setFields(fieldErrors(e)); flash(errorText(e), 'error'); }
  }
  async function reveal(field: 'PAN' | 'AADHAAR') {
    try { const r = await customersApi.reveal(c.id, field); setShown({ field, value: r.data.value, left: r.data.maskAfterSeconds }); flash(r.meta.message); }
    catch (e) { flash(errorText(e), 'error'); }
  }
  const row = (label: string, field: 'PAN' | 'AADHAAR', masked: string | null) => (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-24 text-muted">{label}</span>
      <span className="font-mono">{shown?.field === field ? `${shown.value} (${shown.left}s)` : masked ?? 'Not on file'}</span>
      {masked && can('customers.revealIdentity') && shown?.field !== field && <Button variant="link" onClick={() => reveal(field)}>Show full number</Button>}
    </div>
  );
  return (
    <div className="grid gap-4">
      <p className="text-[0.875rem] text-ink-soft">GR-36/37: stored encrypted, always shown masked. Only the advisor can show the full number, for a few seconds, and every view is recorded. Personal-data consent: <strong>{c.personalDataConsent.replace('_', ' ')}</strong>. To keep the PAN or Aadhaar card image, add it on the <strong>Documents</strong> tab: confirming it fills the number here.</p>
      <div className="grid gap-2 text-[0.9375rem]">{row('PAN', 'PAN', c.identity.pan)}{row('Aadhaar', 'AADHAAR', c.identity.aadhaar)}</div>
      {c.status === 'ACTIVE' && !user?.readOnly && (
        <div className="grid gap-3 rounded border border-rule p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="PAN" error={fields.pan}><input className={`${inputClass} uppercase`} value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })} placeholder="ABCPE1234F" autoComplete="off" /></Field>
          <Field label="Aadhaar number" error={fields.aadhaar} hint="DEC-22: legal to confirm whether the full number may be kept."><input className={inputClass} value={form.aadhaar} onChange={(e) => setForm({ ...form, aadhaar: e.target.value })} autoComplete="off" /></Field>
          <Button variant="primary" onClick={save}>Save</Button>
        </div>
      )}
    </div>
  );
}

export function CustomerDetail({ id, onChanged, initialTab }: { id: string; onChanged: (message?: string) => void; initialTab?: 'family' | 'documents' | 'vehicles' }) {
  const { can: canDo } = useAuth();
  const [c, setC] = useState<Customer | null>(null);
  const [tab, setTab] = useState<'overview' | 'family' | 'consent' | 'identity' | 'documents' | 'vehicles'>(initialTab ?? 'overview');
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const load = useCallback(async () => setC(await customersApi.get(id)), [id]);
  useEffect(() => { load().catch((e) => setNote({ text: errorText(e), tone: 'error' })); }, [load]);
  const flash: Flash = useCallback((m, tone = 'ok') => { if (m) setNote({ text: m, tone }); if (tone === 'ok') onChanged(); }, [onChanged]);

  if (!c) return note ? <Notice tone="error">{note.text}</Notice> : <p className="mt-6 text-muted">Loading customer…</p>;
  if (editing) return <div className="mt-6"><CustomerForm customer={c} onCancel={() => setEditing(false)} onSaved={async (_x, m) => { setEditing(false); await load(); flash(m); }} /></div>;
  return (
    <section className="mt-6 grid gap-4 rounded border border-rule bg-sheet p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{c.name} <span className="font-mono text-[0.85rem] text-muted">{c.number}</span></h3>
        <span className="flex items-center gap-3">
          <span className={`rounded-full px-2 py-0.5 text-[0.75rem] ${c.status === 'ACTIVE' ? 'bg-ok-tint text-ok' : 'bg-bad-tint text-bad'}`}>{c.status}</span>
          {c.status === 'ACTIVE' && <Button onClick={() => setEditing(true)}>Edit</Button>}
        </span>
      </div>
      {note && <Notice tone={note.tone}>{note.text}</Notice>}
      <Tabs tabs={[['overview', 'Overview'], ['family', `Family (${c.family.filter((m) => m.status === 'ACTIVE').length})`], ['consent', 'Consent'], ['identity', 'PAN and Aadhaar'], ...(canDo('documents.work') ? [['documents', 'Documents'] as ['documents', string]] : []), ...(canDo('vehicles.work') ? [['vehicles', 'Vehicles'] as ['vehicles', string]] : [])]} active={tab} onChange={setTab} />
      {tab === 'overview' && <Overview c={c} reload={load} flash={flash} />}
      {tab === 'family' && <Family c={c} reload={load} flash={flash} />}
      {tab === 'consent' && <Consent c={c} flash={flash} />}
      {tab === 'identity' && <Identity c={c} reload={load} flash={flash} />}
      {tab === 'documents' && <CustomerDocuments summary={c} embedded onChanged={() => void load()} />}
      {tab === 'vehicles' && <VehiclesTab customerId={c.id} customerActive={c.status === 'ACTIVE'} />}
    </section>
  );
}