import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, errorText, fieldErrors, warningsOf } from '../../api/client';
import {
  fileUrl, insurersApi, kycApi, profileApi, reviewApi, upload, type FileInfo, type FilePurpose, type FlagGroup, type InsurerRef, type Kyc, type Mapping, type Profile, type QueueItem, type ReviewItem, type Section,
} from '../../api/profile';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../ui/Button';
import { CheckList } from '../../ui/CheckList';
import { Field, Tabs, fmtDate, fmtDateTime, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';
import { PROFILE_CHECKS } from './checks';

const th = 'border-b border-rule py-2 pr-3 text-left font-semibold text-muted';
const td = 'border-b border-rule py-2.5 pr-3 align-top';
const kycTone: Record<string, string> = { VERIFIED: 'bg-ok-tint text-ok', PENDING_REVIEW: 'bg-warn-tint text-warn', REJECTED: 'bg-bad-tint text-bad', NOT_SUBMITTED: 'bg-rule text-ink-soft' };
const KycPill = ({ s }: { s: string }) => <span className={`rounded-full px-2 py-0.5 text-[0.75rem] ${kycTone[s] ?? ''}`}>{s.replace(/_/g, ' ')}</span>;
/** Stored ISO date → the DD-MM-YYYY the user types (Section 1.2). */
const toInput = (iso: string | null | undefined) => (iso ? fmtDate(iso) : '');
const isConflict = (e: unknown) => e instanceof ApiError && e.messageId === 'GEN-05';

// ── Advisor: completion ─────────────────────────────────────────────────────

function Completion({ p }: { p: Profile }) {
  return (
    <section className="mb-6 rounded border border-rule bg-sheet p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[1.05rem] font-semibold">Profile {p.completion.percent}% complete</h2>
        <span className="text-[0.8125rem] text-muted">KYC <KycPill s={p.kycStatus} /></span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-rule" role="progressbar" aria-valuenow={p.completion.percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-ok transition-[width]" style={{ width: `${p.completion.percent}%` }} />
      </div>
      {p.completion.message && <p className="mt-3 text-[0.875rem] text-ink-soft">{p.completion.message}</p>}
      {p.completion.missing.length > 0 && (
        <ul className="mt-2 grid gap-1 text-[0.8125rem] text-muted">
          {p.completion.missing.map((g) => <li key={g.section}><span className="font-medium text-ink-soft">{g.section}:</span> {g.missing.join(', ')}</li>)}
        </ul>
      )}
      {p.licence.message && <div className="mt-3"><Notice tone={p.licence.state === 'EXPIRED' ? 'error' : 'warn'}>{p.licence.message}</Notice></div>}
    </section>
  );
}

// ── Files ──────────────────────────────────────────────────────────────────

/** One file input: uploads at once; a failed upload keeps everything else and offers Retry (P-06). */
function FileField({ label, purpose, value, onChange, required, error, accept }: {
  label: string; purpose: FilePurpose; value: { id: string; name?: string; type?: string } | null; onChange: (f: FileInfo) => void;
  required?: boolean; error?: string; accept: string;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [last, setLast] = useState<File | null>(null);
  async function send(file: File) {
    setBusy(true); setProblem(null); setLast(file);
    try { onChange(await upload(file, purpose)); setLast(null); }
    catch (e) { setProblem(fieldErrors(e).file ?? errorText(e)); }
    finally { setBusy(false); }
  }
  const image = value && value.type !== 'PDF';
  return (
    <Field label={label} required={required} error={problem ?? error}>
      <div className="grid gap-2">
        {value && (
          <div className="flex items-center gap-3 text-[0.8125rem]">
            {image ? <img src={fileUrl(value.id)} alt="" className="h-14 w-14 rounded border border-rule object-cover" />
              : <span className="rounded border border-rule px-2 py-1">PDF</span>}
            <a className="underline" href={fileUrl(value.id)} target="_blank" rel="noreferrer">{value.name ?? 'Open file'}</a>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input type="file" accept={accept} disabled={busy} className="text-[0.8125rem]" onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); e.target.value = ''; }} />
          {busy && <span className="text-[0.8125rem] text-muted">Uploading…</span>}
          {problem && last && !busy && <Button type="button" onClick={() => void send(last)}>Retry</Button>}
        </div>
      </div>
    </Field>
  );
}

// ── Advisor: one section form ───────────────────────────────────────────────

function SectionForm({ title, section, version, initial, onSaved, children }: {
  title: string; section: Section; version: number; initial: Record<string, unknown>; onSaved: (p: Profile, message?: string) => void;
  children: (v: Record<string, unknown>, set: (k: string, val: unknown) => void, errors: Record<string, string>) => ReactNode;
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => { setValues(initial); }, [JSON.stringify(initial)]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, val: unknown) => { setValues((v) => ({ ...v, [k]: val })); setSaved(null); };

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErrors({}); setError(null); setConflict(false); setSaved(null);
    try {
      const r = await profileApi.save(section, { version, ...values });
      setSaved(r.meta.message ?? 'Saved.');
      onSaved(r.data, r.meta.message);
    } catch (err) {
      if (isConflict(err)) { setConflict(true); return; }
      const f = fieldErrors(err); setErrors(f); setError(errorText(err)); // GR-04: entries are kept
    } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="mb-5 rounded border border-rule bg-sheet p-4">
      <h3 className="mb-3 text-[1rem] font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children(values, set, errors)}</div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save section'}</Button>
        {saved && <span className="text-[0.8125rem] text-ok">{saved}</span>}
      </div>
      {conflict && <div className="mt-3"><Notice tone="warn">This section was changed in another tab or by someone else, so nothing was overwritten (GEN-05). <button type="button" className="underline" onClick={() => onSaved(null as unknown as Profile)}>Reload the latest</button>, then make your change again.</Notice></div>}
      {error && !conflict && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </form>
  );
}

const text = (v: Record<string, unknown>, k: string) => (v[k] ?? '') as string;

function MyProfile() {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setP(await profileApi.get()); } catch (e) { setError(errorText(e)); } }, []);
  useEffect(() => { void load(); }, [load]);
  const onSaved = (next: Profile | null) => { if (next) setP(next); else void load(); };
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!p) return <p className="text-muted">Loading your profile…</p>;
  const s = p.sections;
  return (
    <>
      <Completion p={p} />
      <SectionForm title="Personal" section="personal" version={s.personal.version} onSaved={onSaved}
        initial={{ fullName: s.personal.fullName, dob: toInput(s.personal.dob), gender: s.personal.gender ?? '', photoFileId: s.personal.photoFileId }}>
        {(v, set, e) => <>
          <Field label="Full name" required error={e.fullName}><input className={inputClass} value={text(v, 'fullName')} onChange={(x) => set('fullName', x.target.value)} /></Field>
          <Field label="Date of birth" required error={e.dob} hint="DD-MM-YYYY"><input className={inputClass} value={text(v, 'dob')} onChange={(x) => set('dob', x.target.value)} placeholder="DD-MM-YYYY" /></Field>
          <Field label="Gender" error={e.gender}>
            <select className={inputClass} value={text(v, 'gender')} onChange={(x) => set('gender', x.target.value)}>
              <option value="">Not given</option>{p.options.genders.map((g) => <option key={g}>{g}</option>)}
            </select>
          </Field>
          <FileField label="Profile photo" purpose="PROFILE_PHOTO" accept="image/png,image/jpeg" error={e.photoFileId}
            value={v.photoFileId ? { id: String(v.photoFileId), type: 'PNG' } : null} onChange={(f) => set('photoFileId', f.id)} />
        </>}
      </SectionForm>

      <SectionForm title="Contact" section="contact" version={s.contact.version} onSaved={onSaved}
        initial={{ email: s.contact.email ?? '', altMobile: s.contact.altMobile ?? '', address1: s.contact.address1 ?? '', address2: s.contact.address2 ?? '', city: s.contact.city ?? '', state: s.contact.state ?? '', pin: s.contact.pin ?? '' }}>
        {(v, set, e) => <>
          <Field label="Email" required error={e.email}><input className={inputClass} type="email" value={text(v, 'email')} onChange={(x) => set('email', x.target.value)} /></Field>
          <Field label="Alternate mobile" error={e.altMobile} hint={`Not your login number (${s.contact.loginMobile})`}><input className={inputClass} inputMode="tel" value={text(v, 'altMobile')} onChange={(x) => set('altMobile', x.target.value)} /></Field>
          <Field label="Address line 1" required error={e.address1}><input className={inputClass} value={text(v, 'address1')} onChange={(x) => set('address1', x.target.value)} /></Field>
          <Field label="Address line 2" error={e.address2}><input className={inputClass} value={text(v, 'address2')} onChange={(x) => set('address2', x.target.value)} /></Field>
          <Field label="City" required error={e.city}><input className={inputClass} value={text(v, 'city')} onChange={(x) => set('city', x.target.value)} /></Field>
          <Field label="State" required error={e.state}><input className={inputClass} value={text(v, 'state')} onChange={(x) => set('state', x.target.value)} placeholder="Karnataka" /></Field>
          <Field label="PIN code" required error={e.pin}><input className={inputClass} inputMode="numeric" value={text(v, 'pin')} onChange={(x) => set('pin', x.target.value)} /></Field>
        </>}
      </SectionForm>

      <SectionForm title="Professional" section="professional" version={s.professional.version} onSaved={onSaved}
        initial={{ advisorType: s.professional.advisorType ?? '', licenceNumber: s.professional.licenceNumber ?? '', licenceValidUntil: toInput(s.professional.licenceValidUntil), experienceYears: s.professional.experienceYears ?? '', categories: s.professional.categories }}>
        {(v, set, e) => <>
          <Field label="Advisor type" required error={e.advisorType}>
            <select className={inputClass} value={text(v, 'advisorType')} onChange={(x) => set('advisorType', x.target.value)}>
              <option value="">Choose…</option>{p.options.advisorTypes.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="IRDAI licence or POSP certificate number" required error={e.licenceNumber}><input className={inputClass} value={text(v, 'licenceNumber')} onChange={(x) => set('licenceNumber', x.target.value)} /></Field>
          <Field label="Licence valid until" required error={e.licenceValidUntil} hint="DD-MM-YYYY, today or later"><input className={inputClass} value={text(v, 'licenceValidUntil')} onChange={(x) => set('licenceValidUntil', x.target.value)} placeholder="DD-MM-YYYY" /></Field>
          <Field label="Experience in years" error={e.experienceYears}><input className={inputClass} inputMode="numeric" value={String(v.experienceYears ?? '')} onChange={(x) => set('experienceYears', x.target.value)} /></Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 text-[0.8125rem] font-medium">Authorised insurance categories <span className="text-bad">*</span></legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[0.875rem]">
              {p.options.categories.map((c) => {
                const list = (v.categories as string[]) ?? [];
                return <label key={c} className="flex items-center gap-2"><input type="checkbox" checked={list.includes(c)} onChange={(x) => set('categories', x.target.checked ? [...list, c] : list.filter((y) => y !== c))} />{c}</label>;
              })}
            </div>
            {e.categories && <p className="mt-1 text-[0.8125rem] text-bad">{e.categories}</p>}
          </fieldset>
        </>}
      </SectionForm>

      <SectionForm title="Business" section="business" version={s.business.version} onSaved={onSaved}
        initial={{ displayName: s.business.displayName ?? '', gstin: s.business.gstin ?? '', logoFileId: s.business.logoFileId }}>
        {(v, set, e) => <>
          <Field label="Name shown on quotations" error={e.displayName} hint={`Leave blank to use ${s.personal.fullName}`}><input className={inputClass} value={text(v, 'displayName')} onChange={(x) => set('displayName', x.target.value)} /></Field>
          <Field label="GSTIN" error={e.gstin} hint="Printed on SkyUp's invoices to you"><input className={inputClass} value={text(v, 'gstin')} onChange={(x) => set('gstin', x.target.value)} /></Field>
          <FileField label="Logo" purpose="BUSINESS_LOGO" accept="image/png,image/jpeg" error={e.logoFileId}
            value={v.logoFileId ? { id: String(v.logoFileId), type: 'PNG' } : null} onChange={(f) => set('logoFileId', f.id)} />
        </>}
      </SectionForm>
    </>
  );
}

// ── Advisor: KYC (P-06) ─────────────────────────────────────────────────────

function MyKyc() {
  const [k, setK] = useState<Kyc | null>(null);
  const [form, setForm] = useState({ pan: '', nameOnPan: '', declaration: false });
  const [panFile, setPanFile] = useState<FileInfo | null>(null);
  const [licFile, setLicFile] = useState<FileInfo | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const d = await kycApi.get();
      setK(d); setForm({ pan: d.pan ?? '', nameOnPan: d.nameOnPan ?? '', declaration: false });
      setPanFile(d.panFile); setLicFile(d.licenceFile);
    } catch (e) { setError(errorText(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit(e: FormEvent, confirm: string[] = []) {
    e.preventDefault();
    if (!k) return;
    setBusy(true); setErrors({}); setError(null); setDone(null);
    try {
      const r = await kycApi.submit({ version: k.version, pan: form.pan, nameOnPan: form.nameOnPan, panFileId: panFile?.id ?? '', licenceFileId: licFile?.id ?? '', declaration: form.declaration, confirm });
      setK(r.data); setDone(r.meta.message ?? null); setForm((f) => ({ ...f, declaration: false }));
    } catch (err) {
      const w = warningsOf(err);
      if (w.length && w[0]!.messageId === 'PRF-07') { // GR-34: ask before sending verified KYC back to review
        setBusy(false);
        if (window.confirm(w[0]!.message)) return submit(e, ['PRF-07']);
        return;
      }
      if (isConflict(err)) { setError('Your KYC was changed in another tab, so nothing was overwritten (GEN-05). Reloaded the latest; check it and submit again.'); void load(); return; }
      setErrors(fieldErrors(err)); setError(errorText(err));
    } finally { setBusy(false); }
  }

  if (!k) return error ? <Notice tone="error">{error}</Notice> : <p className="text-muted">Loading KYC…</p>;
  return (
    <form onSubmit={(e) => void submit(e)} className="max-w-[760px] rounded border border-rule bg-sheet p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-[1.05rem] font-semibold">KYC</h2><KycPill s={k.status} />
        {k.submittedAt && <span className="text-[0.8125rem] text-muted">Submitted {fmtDateTime(k.submittedAt)}</span>}
      </div>
      {k.status === 'PENDING_REVIEW' && k.message && <div className="mb-4"><Notice tone="warn">{k.message}</Notice></div>}
      {k.status === 'VERIFIED' && <div className="mb-4"><Notice>Your KYC has been verified. Changing PAN, the name on PAN or a document sends it for review again.</Notice></div>}
      {k.rejection && <div className="mb-4"><Notice tone="error">{k.rejection.message}</Notice></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="PAN" required error={errors.pan}><input className={inputClass} value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} placeholder="ABCPE1234F" /></Field>
        <Field label="Name as on PAN" required error={errors.nameOnPan}><input className={inputClass} value={form.nameOnPan} onChange={(e) => setForm({ ...form, nameOnPan: e.target.value })} /></Field>
        <FileField label="PAN card image" required purpose="KYC_PAN" accept="image/png,image/jpeg,application/pdf" value={panFile} onChange={setPanFile} error={errors.panFileId} />
        <FileField label="IRDAI licence or POSP certificate" required purpose="KYC_LICENCE" accept="image/png,image/jpeg,application/pdf" value={licFile} onChange={setLicFile} error={errors.licenceFileId} />
      </div>
      <label className="mt-4 flex items-start gap-2 text-[0.875rem]">
        <input type="checkbox" className="mt-1" checked={form.declaration} onChange={(e) => setForm({ ...form, declaration: e.target.checked })} />
        <span>These documents are mine and are true.</span>
      </label>
      {errors.declaration && <p className="mt-1 text-[0.8125rem] text-bad">{errors.declaration}</p>}
      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit for review'}</Button>
        {done && <span className="text-[0.8125rem] text-ok">{done}</span>}
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </form>
  );
}

// ── Advisor: My insurers (P-07) ─────────────────────────────────────────────

function MappingRow({ m, onChanged }: { m: Mapping; onChanged: (message?: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState(m.agentCode);
  const [until, setUntil] = useState(toInput(m.validUntil));
  const [letter, setLetter] = useState<FileInfo | null>(m.appointmentLetter);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function act(fn: () => Promise<unknown>, done?: string) {
    setBusy(true); setError(null); setErrors({});
    try { await fn(); setEditing(false); onChanged(done); }
    catch (e) {
      if (isConflict(e)) { setError('This entry was changed in another tab, so nothing was overwritten (GEN-05). Reloaded the latest.'); onChanged(); return; }
      setErrors(fieldErrors(e)); setError(errorText(e));
    } finally { setBusy(false); }
  }
  async function deactivate() {
    try { await insurersApi.deactivate(m.id, m.version); }
    catch (e) {
      const w = warningsOf(e);
      if (w[0]?.messageId === 'PRF-12') { // GR-34: ask first
        if (window.confirm(w[0].message)) return act(() => insurersApi.deactivate(m.id, m.version, ['PRF-12']), `${m.insurer?.name} deactivated.`);
        return;
      }
      setError(errorText(e));
    }
  }
  return (
    <tr>
      <td className={td}><span className="font-medium">{m.insurer?.name}</span><div className="text-muted">{m.insurer?.category}</div>
        {m.warnings.map((w) => <div key={w.messageId} className="mt-1.5"><Notice tone="warn">{w.message}</Notice></div>)}
        {error && <div className="mt-1.5"><Notice tone="error">{error}</Notice></div>}
      </td>
      {editing ? (
        <td className={td} colSpan={3}>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Agent code" required error={errors.agentCode}><input className={inputClass} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></Field>
            <Field label="Code valid until" error={errors.validUntil} hint="DD-MM-YYYY; blank for none"><input className={inputClass} value={until} onChange={(e) => setUntil(e.target.value)} placeholder="DD-MM-YYYY" /></Field>
            <div className="sm:col-span-2"><FileField label="Appointment letter" purpose="APPOINTMENT_LETTER" accept="image/png,image/jpeg,application/pdf" value={letter} onChange={setLetter} error={errors.appointmentLetterFileId} /></div>
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" disabled={busy} onClick={() => void act(() => insurersApi.edit(m.id, { version: m.version, agentCode: code, validUntil: until || null, appointmentLetterFileId: letter?.id ?? null }), 'Saved.')}>Save</Button>
            <Button variant="link" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </td>
      ) : (<>
        <td className={td}><span className="font-mono">{m.agentCode}</span></td>
        <td className={td}>{m.validUntil ? fmtDate(m.validUntil) : '—'}{m.appointmentLetter && <div><a className="underline" href={fileUrl(m.appointmentLetter.id)} target="_blank" rel="noreferrer">Appointment letter</a></div>}</td>
        <td className={td}><span className={`rounded-full px-2 py-0.5 text-[0.75rem] ${m.status === 'ACTIVE' ? 'bg-ok-tint text-ok' : 'bg-rule text-ink-soft'}`}>{m.status}</span></td>
      </>)}
      <td className={td}>
        {!editing && <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => setEditing(true)}>Edit</Button>
          {m.status === 'ACTIVE'
            ? <Button variant="danger" disabled={busy} onClick={() => void deactivate()}>Deactivate</Button>
            : <Button disabled={busy} onClick={() => void act(() => insurersApi.activate(m.id, m.version), `${m.insurer?.name} is active again.`)}>Activate</Button>}
        </div>}
      </td>
    </tr>
  );
}

function MyInsurers() {
  const [rows, setRows] = useState<Mapping[] | null>(null);
  const [options, setOptions] = useState<InsurerRef[]>([]);
  const [form, setForm] = useState({ insurerId: '', agentCode: '', validUntil: '', declaration: false });
  const [letter, setLetter] = useState<FileInfo | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (done?: string) => {
    try { const [l, a] = await Promise.all([insurersApi.list(), insurersApi.available()]); setRows(l); setOptions(a); if (done) setMessage(done); }
    catch (e) { setError(errorText(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErrors({}); setError(null); setMessage(null);
    try {
      const r = await insurersApi.add({ insurerId: form.insurerId, agentCode: form.agentCode, declaration: form.declaration, ...(form.validUntil ? { validUntil: form.validUntil } : {}), ...(letter ? { appointmentLetterFileId: letter.id } : {}) });
      setForm({ insurerId: '', agentCode: '', validUntil: '', declaration: false }); setLetter(null);
      await load(r.meta.message);
    } catch (err) { setErrors(fieldErrors(err)); setError(errorText(err)); }
    finally { setBusy(false); }
  }
  return (
    <>
      <form onSubmit={(e) => void add(e)} className="mb-6 max-w-[860px] rounded border border-rule bg-sheet p-4">
        <h2 className="mb-3 text-[1.05rem] font-semibold">Add insurer</h2>
        {options.length === 0 && rows && <div className="mb-3"><Notice tone="warn">No more ACTIVE insurers to add. Until the catalogue module, create test insurers in Test tools (dev only).</Notice></div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Insurer" required error={errors.insurerId}>
            <select className={inputClass} value={form.insurerId} onChange={(e) => setForm({ ...form, insurerId: e.target.value })}>
              <option value="">Choose…</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.category})</option>)}
            </select>
          </Field>
          <Field label="Agent code" required error={errors.agentCode}><input className={inputClass} value={form.agentCode} onChange={(e) => setForm({ ...form, agentCode: e.target.value.toUpperCase() })} /></Field>
          <Field label="Code valid until" error={errors.validUntil} hint="DD-MM-YYYY, optional"><input className={inputClass} value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} placeholder="DD-MM-YYYY" /></Field>
          <FileField label="Appointment letter" purpose="APPOINTMENT_LETTER" accept="image/png,image/jpeg,application/pdf" value={letter} onChange={setLetter} error={errors.appointmentLetterFileId} />
        </div>
        <label className="mt-3 flex items-start gap-2 text-[0.875rem]">
          <input type="checkbox" className="mt-1" checked={form.declaration} onChange={(e) => setForm({ ...form, declaration: e.target.checked })} />
          <span>I am authorised to sell this insurer’s products using this code.</span>
        </label>
        {errors.declaration && <p className="mt-1 text-[0.8125rem] text-bad">{errors.declaration}</p>}
        <div className="mt-3"><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></div>
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      </form>
      {message && <div className="mb-4"><Notice>{message}</Notice></div>}
      {!rows ? <p className="text-muted">Loading…</p> : rows.length === 0 ? <p className="text-muted">No insurers added yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-[0.875rem]">
          <thead><tr><th className={th}>Insurer</th><th className={th}>Agent code</th><th className={th}>Valid until</th><th className={th}>Status</th><th className={th} /></tr></thead>
          <tbody>{rows.map((m) => <MappingRow key={`${m.id}-${m.version}`} m={m} onChanged={(d) => void load(d)} />)}</tbody>
        </table></div>
      )}
    </>
  );
}

// ── SkyUp: shared agent codes (DEC-09) ─────────────────────────────────────

function SharedCodes() {
  const [groups, setGroups] = useState<FlagGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { insurersApi.flags().then(setGroups, (e) => setError(errorText(e))); }, []);
  if (error) return <Notice tone="error">{error}</Notice>;
  return (
    <section>
      <p className="mb-3 max-w-[70ch] text-ink-soft">Accounts that entered the same insurer and agent code (DEC-09, to confirm). Neither advisor is told.</p>
      {!groups ? <p className="text-muted">Loading…</p> : groups.length === 0 ? <p className="text-muted">No shared agent codes.</p> : (
        <table className="w-full text-[0.875rem]"><thead><tr><th className={th}>Insurer</th><th className={th}>Agent code</th><th className={th}>Accounts</th></tr></thead>
          <tbody>{groups.map((g) => (
            <tr key={`${g.insurer}|${g.agentCode}`}><td className={td}>{g.insurer}</td><td className={`${td} font-mono`}>{g.agentCode}</td>
              <td className={td}>{g.accounts.map((a) => <div key={a.accountId}>{a.advisorName ?? a.accountId} <span className="text-muted">· flagged {fmtDateTime(a.flaggedAt)}</span></div>)}</td></tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}

// ── SkyUp: KYC review queue (P-06 steps 3–5) ────────────────────────────────

function ReviewQueue() {
  const [q, setQ] = useState<{ targetWorkingDays: number; items: QueueItem[] } | null>(null);
  const [open, setOpen] = useState<ReviewItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setQ(await reviewApi.queue()); } catch (e) { setError(errorText(e)); } }, []);
  useEffect(() => { void load(); }, [load]);

  async function view(accountId: string) {
    setError(null); setMessage(null); setReason(''); setNote(''); setFields({});
    try { setOpen(await reviewApi.item(accountId)); } catch (e) { setError(errorText(e)); }
  }
  async function decide(decision: 'VERIFY' | 'REJECT') {
    if (!open) return;
    if (decision === 'VERIFY' && !window.confirm(`Verify the KYC of ${open.advisorName}?`)) return;
    setBusy(true); setError(null); setFields({});
    try {
      const r = await reviewApi.decide(open.accountId, { version: open.version, decision, ...(decision === 'REJECT' ? { reason, ...(note ? { note } : {}) } : {}) });
      setMessage(`${open.advisorName}: ${r.meta.message ?? r.data.status}`); setOpen(null); void load();
    } catch (e) { setFields(fieldErrors(e)); setError(errorText(e)); }
    finally { setBusy(false); }
  }

  if (open) {
    const doc = (label: string, f: FileInfo | null) => (
      <div className="grid gap-2">
        <span className="text-[0.8125rem] font-medium">{label}</span>
        {!f ? <span className="text-muted">Not uploaded</span> : f.type === 'PDF'
          ? <a className="underline" href={fileUrl(f.id)} target="_blank" rel="noreferrer">Open {f.name} (PDF)</a>
          : <a href={fileUrl(f.id)} target="_blank" rel="noreferrer"><img src={fileUrl(f.id)} alt={label} className="max-h-[260px] rounded border border-rule object-contain" /></a>}
      </div>
    );
    return (
      <section className="max-w-[900px]">
        <Button variant="link" onClick={() => { setOpen(null); setError(null); }}>← Back to the queue</Button>
        <h2 className="mt-2 mb-4 text-[1.2rem] font-semibold">{open.advisorName} <KycPill s={open.status} /></h2>
        <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
          <table className="w-full text-[0.875rem]"><tbody>
            {([['PAN', open.pan], ['Name as on PAN', open.nameOnPan], ['Advisor name', open.advisorName], ['Date of birth', fmtDate(open.dob)],
              ['Advisor type', open.licence.type], ['Licence number', open.licence.number], ['Licence valid until', fmtDate(open.licence.validUntil)], ['Submitted', fmtDateTime(open.submittedAt)]] as Array<[string, string | null]>)
              .map(([k, v]) => <tr key={k}><td className={`${td} w-[45%] text-muted`}>{k}</td><td className={td}>{v ?? '—'}</td></tr>)}
          </tbody></table>
          <div className="grid gap-4">{doc('PAN card image', open.panFile)}{doc('IRDAI licence or POSP certificate', open.licenceFile)}</div>
        </div>
        {open.status === 'PENDING_REVIEW' ? (
          <div className="mt-6 grid gap-3 rounded border border-rule bg-sheet p-4 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end">
            <Button variant="primary" disabled={busy} onClick={() => void decide('VERIFY')}>Verify</Button>
            <Field label="Reject reason" error={fields.reason}>
              <select className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Choose…</option>{open.rejectReasons.map((r) => <option key={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Note" error={fields.note} hint={reason === 'Other' ? 'Required for Other' : undefined}><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <Button variant="danger" disabled={busy} onClick={() => void decide('REJECT')}>Reject</Button>
          </div>
        ) : <div className="mt-6"><Notice tone="warn">This KYC is {open.status.replace(/_/g, ' ')}; there is nothing to decide.</Notice></div>}
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      </section>
    );
  }
  return (
    <section>
      {message && <div className="mb-4"><Notice>{message}</Notice></div>}
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-ink-soft">Pending KYC, oldest first. Review target: {q?.targetWorkingDays ?? '…'} working days (CFG-125).</p>
        <Button onClick={() => void load()}>Refresh</Button>
      </div>
      {!q ? <p className="text-muted">Loading…</p> : q.items.length === 0 ? <p className="text-muted">Nothing waiting for review.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-[0.875rem]">
          <thead><tr><th className={th}>Advisor</th><th className={th}>Submitted</th><th className={th}>Waiting</th><th className={th} /></tr></thead>
          <tbody>{q.items.map((i) => (
            <tr key={i.accountId}>
              <td className={td}><span className="font-medium">{i.advisorName}</span><div className="text-muted">{i.mobile}</div></td>
              <td className={td}>{fmtDateTime(i.submittedAt)}</td>
              <td className={td}>{i.workingDaysWaiting} working day{i.workingDaysWaiting === 1 ? '' : 's'}{i.overdue && <span className="ml-2 rounded-full bg-bad-tint px-2 py-0.5 text-[0.75rem] text-bad">Overdue</span>}</td>
              <td className={td}><Button onClick={() => void view(i.accountId)}>Open</Button></td>
            </tr>))}
          </tbody>
        </table></div>
      )}
    </section>
  );
}

// ── Module ─────────────────────────────────────────────────────────────────

type Tab = 'profile' | 'kyc' | 'insurers' | 'review' | 'flags' | 'checks';
export function ProfileModule() {
  const { can } = useAuth();
  const advisor = can('profile.manage');
  const reviewer = can('kyc.review');
  const flagReviewer = can('agentCodes.review');
  const [tab, setTab] = useState<Tab>(advisor ? 'profile' : reviewer ? 'review' : 'checks');
  const tabs: Array<[Tab, string]> = [
    ...(advisor ? [['profile', 'My profile'], ['kyc', 'KYC'], ['insurers', 'My insurers']] as Array<[Tab, string]> : []),
    ...(reviewer ? [['review', 'KYC review']] as Array<[Tab, string]> : []),
    ...(flagReviewer ? [['flags', 'Shared agent codes']] as Array<[Tab, string]> : []),
    ['checks', 'Backend checks'],
  ];
  return (
    <main className="overflow-y-auto px-[clamp(20px,4vw,56px)] pt-9 pb-16">
      <header className="mb-6 max-w-[68ch]">
        <h1 className="text-[1.9rem] leading-tight font-bold tracking-[-0.01em]">Advisor profile, KYC and insurers</h1>
        <p className="mt-2 text-ink-soft">P-05 to P-07. Each profile section saves on its own; KYC goes to SkyUp for review; each insurer is added once, with its own agent code.</p>
      </header>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'profile' && <MyProfile />}
      {tab === 'kyc' && <MyKyc />}
      {tab === 'insurers' && <MyInsurers />}
      {tab === 'review' && <ReviewQueue />}
      {tab === 'flags' && <SharedCodes />}
      {tab === 'checks' && <CheckList checks={PROFILE_CHECKS} intro="Each check uses a throwaway advisor account. The review checks need you signed in as the seeded SkyUp Admin (or SkyUp Staff). Insurer checks create test insurers with the dev tools." />}
      {!advisor && !reviewer && tab !== 'checks' && <Notice tone="warn">Only the advisor manages the profile and KYC (P-05, P-06).</Notice>}
    </main>
  );
}