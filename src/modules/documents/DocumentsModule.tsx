import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { errorText, fieldErrors } from '../../api/client';
import { customersApi, type Customer, type CustomerSummary } from '../../api/customers';
import { documentsApi, type CatalogueInsurer, type CustomerDocs, type DocDetail, type DocVersion } from '../../api/documents';
import { fileUrl, upload } from '../../api/profile';
import { GENDER_LABEL, loadReference, type Reference } from '../../api/reference';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../ui/Button';
import { CheckList } from '../../ui/CheckList';
import { Field, Tabs, fmtDateTime, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';
import { DOCUMENT_CHECKS } from './checks';

const th = 'border-b border-rule py-2 pr-3 text-left font-semibold text-muted';
const td = 'border-b border-rule py-2.5 pr-3 align-top';
const Pill = ({ s }: { s: string }) => (
  <span className={`rounded-full px-2 py-0.5 text-[0.75rem] ${s === 'CONFIRMED' ? 'bg-ok-tint text-ok' : 'bg-warn-tint text-warn'}`}>{s === 'CONFIRMED' ? 'Confirmed' : 'Waiting to be checked'}</span>
);

// ── Customer picker (P-18 step 1: a registered customer; free text is not accepted) ──

function CustomerPicker({ onPick }: { onPick: (c: CustomerSummary) => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<CustomerSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      customersApi.list({ search: q || undefined, status: 'ACTIVE', limit: 20 }).then((r) => { setRows(r.data); setError(null); }, (e) => setError(errorText(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <section className="max-w-[760px]">
      <Field label="Customer" required hint="Search by name, number or mobile. Leads must be converted first (P-14).">
        <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers" />
      </Field>
      {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
      <ul className="mt-3 divide-y divide-rule rounded border border-rule bg-sheet">
        {rows.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[0.875rem]">
            <span><span className="font-medium">{c.name}</span> <span className="text-muted">{c.number} · {c.mobile}</span></span>
            <Button onClick={() => onPick(c)}>Open documents</Button>
          </li>
        ))}
        {rows.length === 0 && <li className="px-3 py-2 text-muted">No active customers found.</li>}
      </ul>
    </section>
  );
}

// ── Add document (P-18 steps 2–4) ────────────────────────────────────────────

function AddDocument({ customer, ref, reminder, onAdded }: { customer: Customer; ref: Reference; reminder: string; onAdded: (id: string | null, message: string) => void }) {
  const [personKey, setPersonKey] = useState(`C:${customer.id}`);
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const types = ref.documentTypes.filter((t) => !ref.vehicleDocumentTypes.includes(t)); // RC and photos: from the vehicle (P-54)
  // AC-P18-1: upload stays disabled until customer, person and type, and for Other a name, are filled.
  const blocked = !personKey || !type ? 'Choose the customer, person and document type first.' : type === 'Other' && name.trim().length === 0 ? 'Enter a name for this document.' : null;
  async function send(file: File) {
    setBusy(true); setError(null);
    try {
      const f = await upload(file, 'CUSTOMER_DOCUMENT');
      const r = await documentsApi.add({ customerId: customer.id, personKey, type, fileId: f.id, ...(type === 'Other' ? { name } : {}) });
      onAdded(r.data.verify ? r.data.id : null, r.meta.message ?? 'Saved.');
      setType(''); setName('');
    } catch (e) { setError(fieldErrors(e).file ?? errorText(e)); }
    finally { setBusy(false); }
  }
  const picker = (label: string, capture: boolean) => (
    <label className={`inline-flex items-center rounded border px-3 py-1.5 text-[0.875rem] ${blocked || busy ? 'cursor-not-allowed border-rule text-muted' : 'cursor-pointer border-ink-soft'}`}>
      {label}
      <input type="file" className="hidden" disabled={!!blocked || busy} accept={capture ? 'image/*' : 'image/png,image/jpeg,application/pdf'} {...(capture ? { capture: 'environment' as const } : {})}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); e.target.value = ''; }} />
    </label>
  );
  return (
    <section className="mb-6 rounded border border-rule bg-sheet p-4">
      <h2 className="mb-3 text-[1.05rem] font-semibold">Add document</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Person" required>
          <select className={inputClass} value={personKey} onChange={(e) => setPersonKey(e.target.value)}>
            <option value={`C:${customer.id}`}>{customer.name} (customer)</option>
            {customer.family.filter((m) => m.status === 'ACTIVE').map((m) => <option key={m.id} value={`F:${m.id}`}>{m.name} ({m.relationship})</option>)}
          </select>
        </Field>
        <Field label="Document type" required>
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Choose…</option>{types.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        {type === 'Other' && <Field label="Document name" required><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>}
      </div>
      {type === 'Aadhaar' && <div className="mt-3"><Notice tone="warn">{reminder}</Notice></div>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {picker('Choose file', false)}{picker('Use camera', true)}
        {busy && <span className="text-[0.8125rem] text-muted">Uploading…</span>}
        {blocked && <span className="text-[0.8125rem] text-muted">{blocked}</span>}
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}

// ── Verify and Confirm (P-18 steps 5–6) ──────────────────────────────────────

const VERIFY_FIELDS: Record<string, Array<[string, string, 'text' | 'gender' | 'insurer' | 'list']>> = {
  Aadhaar: [['name', 'Name', 'text'], ['dob', 'Date of birth (DD-MM-YYYY)', 'text'], ['gender', 'Gender', 'gender'], ['aadhaar', 'Aadhaar number', 'text']],
  PAN: [['name', 'Name', 'text'], ['fatherName', "Father's name", 'text'], ['dob', 'Date of birth (DD-MM-YYYY)', 'text'], ['pan', 'PAN', 'text']],
  'Old policy': [['insurerId', 'Insurer', 'insurer'], ['policyNumber', 'Policy number', 'text'], ['productName', 'Product name', 'text'],
    ['startDate', 'Start date (DD-MM-YYYY)', 'text'], ['endDate', 'End date (DD-MM-YYYY)', 'text'], ['sumInsured', 'Sum insured (₹)', 'text'],
    ['premium', 'Premium (₹)', 'text'], ['insuredPeople', 'Insured people (comma-separated)', 'list'], ['nominees', 'Nominees (comma-separated)', 'list']],
};
const REQUIRED = new Set(['name', 'aadhaar', 'pan', 'insurerId', 'policyNumber']);

function Verify({ id, customer, onDone }: { id: string; customer: Customer; onDone: (message: string) => void }) {
  const [d, setD] = useState<DocDetail | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [insurers, setInsurers] = useState<CatalogueInsurer[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [differs, setDiffers] = useState<{ field: 'PAN' | 'AADHAAR'; current?: string | null; fromDocument?: string; value: string } | null>(null);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // GR-26: reading runs after the save. Ask again until it is done; fill only fields the user has not typed in.
    const poll = async (first: boolean) => {
      try {
        const x = await documentsApi.get(id);
        if (stop) return;
        setD(x);
        const read = Object.fromEntries(Object.entries(x.readValues ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v ?? '')]));
        setValues((cur) => ({ ...read, ...Object.fromEntries(Object.entries(cur).filter(([, v]) => v.trim() !== '')) }));
        if (first && x.type === 'Old policy') documentsApi.insurers().then(setInsurers, () => setInsurers([]));
        if (x.readStatus === 'PENDING') timer = setTimeout(() => void poll(false), 1500);
      } catch (e) { if (!stop) setError(errorText(e)); }
    };
    void poll(true);
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [id]);
  if (error && !d) return <Notice tone="error">{error}</Notice>;
  if (!d) return <p className="text-muted">Loading…</p>;
  const fields = VERIFY_FIELDS[d.type] ?? [];
  async function confirm() {
    setBusy(true); setErrors({}); setError(null);
    const out: Record<string, unknown> = {};
    for (const [k, , kind] of fields) {
      const v = (values[k] ?? '').trim();
      if (!v) continue; // empty optional fields are not sent; required ones are reported by the API
      out[k] = kind === 'list' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v;
    }
    try {
      const r = await documentsApi.confirm(d!.id, d!.rev, out);
      const idn = r.data.identity;
      if (idn?.differs) { setDiffers({ field: idn.field, current: idn.current, fromDocument: idn.fromDocument, value: String(out[idn.field === 'PAN' ? 'pan' : 'aadhaar']) }); setBusy(false); return; }
      onDone(`${d!.type} confirmed.${idn?.copied ? ` ${idn.field === 'PAN' ? 'PAN' : 'Aadhaar'} saved to ${customer.name}'s record.` : ''}`);
    } catch (e) { setErrors(fieldErrors(e)); setError(errorText(e)); }
    finally { setBusy(false); }
  }
  async function useForCustomer() {
    if (!differs) return;
    try {
      const fresh = await customersApi.get(customer.id);
      await customersApi.setIdentity(customer.id, { version: fresh.version, ...(differs.field === 'PAN' ? { pan: differs.value } : { aadhaar: differs.value }) });
      onDone(`${differs.field === 'PAN' ? 'PAN' : 'Aadhaar'} updated on ${customer.name}'s record.`);
    } catch (e) { setError(errorText(e)); }
  }
  const preview: ReactNode = d.file?.type === 'PDF'
    ? <a className="underline" href={fileUrl(d.file.id)} target="_blank" rel="noreferrer">Open {d.originalName} (PDF)</a>
    : d.file ? <a href={fileUrl(d.file.id)} target="_blank" rel="noreferrer"><img src={fileUrl(d.file.id)} alt={d.type} className="max-h-[360px] w-full rounded border border-rule object-contain" /></a> : null;
  return (
    <section className="mb-6 rounded border border-warn bg-sheet p-4">
      <h2 className="mb-2 text-[1.05rem] font-semibold">Check {d.type} (version {d.version})</h2>
      {d.readStatus === 'PENDING'
        ? <div className="mb-3"><Notice>Reading the document… The details appear here when it finishes; you can start typing meanwhile.</Notice></div>
        : d.message && <div className="mb-3"><Notice tone="warn">{d.message}</Notice></div>}
      <div className="grid gap-5 md:grid-cols-2">
        <div>{preview}</div>
        <div className="grid gap-3">
          {fields.map(([k, label, kind]) => (
            <Field key={k} label={label} required={REQUIRED.has(k)} error={errors[k]}>
              {kind === 'gender' ? (
                <select className={inputClass} value={values[k] ?? ''} onChange={(e) => setValues({ ...values, [k]: e.target.value })}>
                  <option value="">Not given</option>{Object.entries(GENDER_LABEL).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                </select>
              ) : kind === 'insurer' ? (
                <select className={inputClass} value={values[k] ?? ''} onChange={(e) => setValues({ ...values, [k]: e.target.value })}>
                  <option value="">Choose…</option>{insurers.map((i) => <option key={i.id} value={i.id}>{i.name}{i.status !== 'ACTIVE' ? ' (inactive)' : ''}</option>)}
                </select>
              ) : <input className={inputClass} value={values[k] ?? ''} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />}
            </Field>
          ))}
          {differs ? (
            <Notice tone="warn">
              {customer.name}'s record already has {differs.field === 'PAN' ? 'PAN' : 'Aadhaar'} {differs.current}; this document shows {differs.fromDocument}. The document is confirmed; the record was not changed.
              <div className="mt-2 flex gap-2"><Button variant="primary" onClick={() => void useForCustomer()}>Use this {differs.field === 'PAN' ? 'PAN' : 'Aadhaar'} for {customer.name}</Button><Button onClick={() => onDone(`${d.type} confirmed. ${customer.name}'s record was not changed.`)}>Keep the record as it is</Button></div>
            </Notice>
          ) : <div><Button variant="primary" disabled={busy} onClick={() => void confirm()}>{busy ? 'Confirming…' : 'Confirm'}</Button></div>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </div>
    </section>
  );
}

// ── One version row, with label change and history (P-18 steps 7–8) ─────────

function VersionRow({ v, canRelabel, onCheck, onChanged }: { v: DocVersion; canRelabel: boolean; onCheck: () => void; onChanged: (m: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(v.label);
  const [history, setHistory] = useState<DocDetail['history'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    try { const r = await documentsApi.relabel(v.id, v.rev, label); setEditing(false); onChanged(r.meta.message ?? 'Label changed.'); }
    catch (e) { setError(fieldErrors(e).label ?? errorText(e)); }
  }
  return (
    <tr>
      <td className={td}>v{v.version}</td>
      <td className={td}>
        {editing ? (
          <div className="flex flex-wrap gap-2"><input className={`${inputClass} max-w-[260px]`} value={label} onChange={(e) => setLabel(e.target.value)} /><Button variant="primary" onClick={() => void save()}>Save</Button><Button variant="link" onClick={() => { setEditing(false); setError(null); }}>Cancel</Button></div>
        ) : <span className="font-medium">{v.label}</span>}
        {v.label !== v.originalName && !editing && <div className="text-[0.8125rem] text-muted">Uploaded as {v.originalName}</div>}
        {error && <p className="mt-1 text-[0.8125rem] text-bad">{error}</p>}
        {history && <ul className="mt-2 text-[0.8125rem] text-muted">{history.map((h, i) => <li key={i}>{fmtDateTime(h.at)}: {h.event === 'UPLOADED' ? `uploaded as ${h.name}` : `label changed from “${h.from}” to “${h.to}”`}</li>)}</ul>}
      </td>
      <td className={td}><Pill s={v.status} /></td>
      <td className={td}>{fmtDateTime(v.uploadedAt)}</td>
      <td className={td}>
        <div className="flex flex-wrap gap-2">
          {v.file && <a className="self-center underline" href={fileUrl(v.file.id)} target="_blank" rel="noreferrer">Open</a>}
          {v.status === 'UNCONFIRMED' && <Button variant="primary" onClick={onCheck}>Check and confirm</Button>}
          {canRelabel && !editing && <Button onClick={() => setEditing(true)}>Change label</Button>}
          <Button variant="link" onClick={() => (history ? setHistory(null) : documentsApi.get(v.id).then((d) => setHistory(d.history), (e) => setError(errorText(e))))}>{history ? 'Hide history' : 'History'}</Button>
        </div>
      </td>
    </tr>
  );
}

/**
 * A customer's documents: on file by person and type, add, verify/confirm, labels and history.
 * Used in two places (P-18 entry points): the Document vault (with a customer picker) and the Documents tab
 * of the customer screen (embedded: no back link or name heading; onChanged reloads the customer record,
 * because a confirmed PAN or Aadhaar fills the customer's own fields).
 */
export function CustomerDocuments({ summary, onBack, embedded = false, onChanged }: { summary: Pick<CustomerSummary, 'id'>; onBack?: () => void; embedded?: boolean; onChanged?: () => void }) {
  const { can } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [docs, setDocs] = useState<CustomerDocs | null>(null);
  const [ref, setRef] = useState<Reference | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [c, d, r] = await Promise.all([customersApi.get(summary.id), documentsApi.forCustomer(summary.id), loadReference()]);
      setCustomer(c); setDocs(d); setRef(r);
    } catch (e) { setError(errorText(e)); }
  }, [summary.id]);
  useEffect(() => { void load(); }, [load]);
  if (error && !docs) return <Notice tone="error">{error}</Notice>;
  if (!customer || !docs || !ref) return <p className="text-muted">Loading documents…</p>;
  return (
    <>
      {!embedded && (
        <div className="mb-4 flex flex-wrap items-baseline gap-3">
          {onBack && <Button variant="link" onClick={onBack}>← Choose another customer</Button>}
          <h2 className="text-[1.3rem] font-semibold">{customer.name}</h2><span className="text-muted">{customer.number}</span>
        </div>
      )}
      {docs.missing && <div className="mb-4"><Notice tone="warn">{docs.missing.message}</Notice></div>}
      {message && <div className="mb-4"><Notice>{message}</Notice></div>}
      {verifying && <Verify id={verifying} customer={customer} onDone={(m) => { setVerifying(null); setMessage(m); void load(); onChanged?.(); }} />}
      {customer.status === 'ACTIVE' && !verifying && <AddDocument customer={customer} ref={ref} reminder={docs.aadhaarReminder.message} onAdded={(id, m) => { setMessage(m); setVerifying(id); void load(); }} />}
      {docs.groups.length === 0 ? <p className="text-muted">No documents on file yet.</p> : docs.groups.map((g) => (
        <section key={`${g.personKey}|${g.type}|${g.name ?? ''}`} className="mb-5">
          <h3 className="mb-1 text-[1rem] font-semibold">{g.name ?? g.type} <span className="font-normal text-muted">· {g.personName}</span></h3>
          <div className="overflow-x-auto"><table className="w-full text-[0.875rem]">
            <thead><tr><th className={th}>Version</th><th className={th}>Label</th><th className={th}>Status</th><th className={th}>Uploaded</th><th className={th} /></tr></thead>
            <tbody>{g.versions.map((v) => <VersionRow key={`${v.id}-${v.rev}`} v={v} canRelabel={can('documents.relabel')} onCheck={() => setVerifying(v.id)} onChanged={(m) => { setMessage(m); void load(); }} />)}</tbody>
          </table></div>
        </section>
      ))}
      <p className="mt-6 text-[0.8125rem] text-muted">Documents cannot be deleted. Change the label or upload a newer version.</p>
    </>
  );
}

export function DocumentsModule() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'docs' | 'checks'>(can('documents.work') ? 'docs' : 'checks');
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  return (
    <main className="overflow-y-auto px-[clamp(20px,4vw,56px)] pt-9 pb-16">
      <header className="mb-6 max-w-[68ch]">
        <h1 className="text-[1.9rem] leading-tight font-bold tracking-[-0.01em]">Document vault</h1>
        <p className="mt-2 text-ink-soft">P-18. Every client document is kept as a permanent record: new uploads add versions, nothing is deleted, and Aadhaar, PAN and old policies are checked by a person before anything is saved. Each customer also has Documents and Vehicles (P-54) tabs.</p>
      </header>
      <Tabs tabs={[...(can('documents.work') ? [['docs', 'Documents']] as Array<['docs', string]> : []), ['checks', 'Backend checks']]} active={tab} onChange={setTab} />
      {tab === 'docs' && (customer ? <CustomerDocuments summary={customer} onBack={() => setCustomer(null)} /> : <CustomerPicker onPick={setCustomer} />)}
      {tab === 'checks' && <CheckList checks={DOCUMENT_CHECKS} intro="Each check uses a throwaway advisor and customer, with personal-data consent recorded where a check needs it." />}
    </main>
  );
}