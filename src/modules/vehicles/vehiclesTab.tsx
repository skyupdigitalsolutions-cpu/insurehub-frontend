import { useCallback, useEffect, useState } from 'react';
import { errorText, fieldErrors } from '../../api/client';
import { fileUrl, upload, type FileInfo } from '../../api/profile';
import { vehiclesApi, type VehicleRules, type VehicleView } from '../../api/vehicles';
import { Button } from '../../ui/Button';
import { Field, fmtDateTime, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';

/** One file picker that uploads at once; a failed upload shows Retry and does not count (P-54). */
function Picker({ label, accept, camera, disabled, onUploaded }: { label: string; accept: string; camera?: boolean; disabled?: boolean; onUploaded: (f: FileInfo) => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<{ file: File; message: string } | null>(null);
  async function send(file: File) {
    setBusy(true); setFailed(null);
    try { await onUploaded(await upload(file, 'CUSTOMER_DOCUMENT')); }
    catch (e) { setFailed({ file, message: fieldErrors(e).file ?? errorText(e) }); }
    finally { setBusy(false); }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label className={`inline-flex items-center rounded border px-2.5 py-1 text-[0.8125rem] ${disabled || busy ? 'cursor-not-allowed border-rule text-muted' : 'cursor-pointer border-ink-soft'}`}>
        {busy ? 'Uploading…' : label}
        <input type="file" className="hidden" disabled={disabled || busy} accept={accept} {...(camera ? { capture: 'environment' as const } : {})}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f); e.target.value = ''; }} />
      </label>
      {failed && <><span className="text-[0.8125rem] text-bad">{failed.message}</span><Button onClick={() => void send(failed.file)}>Retry</Button></>}
    </span>
  );
}

const Thumb = ({ f, alt }: { f: FileInfo | null | undefined; alt: string }) => !f ? null : f.type === 'PDF'
  ? <a className="underline" href={fileUrl(f.id)} target="_blank" rel="noreferrer">{f.name} (PDF)</a>
  : <a href={fileUrl(f.id)} target="_blank" rel="noreferrer"><img src={fileUrl(f.id)} alt={alt} className="h-16 w-24 rounded border border-rule object-cover" /></a>;

// ── + Vehicle (P-54 steps 1–3): everything is saved together or not at all ──

function AddVehicle({ customerId, rules, tooFew, onSaved, onCancel }: { customerId: string; rules: VehicleRules; tooFew: string; onSaved: (m: string) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ registration: '', vehicleType: '', make: '', model: '', year: '', fuel: '' });
  const [rc, setRc] = useState<FileInfo | null>(null);
  const [photos, setPhotos] = useState<Record<string, FileInfo>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const count = Object.keys(photos).length;
  const ready = !!rc && count >= rules.minPhotos;
  async function save() {
    setBusy(true); setErrors({}); setError(null);
    try {
      const r = await vehiclesApi.create(customerId, { ...form, rcFileId: rc?.id ?? '', photos: Object.entries(photos).map(([slot, f]) => ({ slot, fileId: f.id })) });
      onSaved(r.meta.message ?? 'Vehicle saved.');
    } catch (e) { setErrors(fieldErrors(e)); setError(errorText(e)); }
    finally { setBusy(false); }
  }
  const text = (k: keyof typeof form, label: string, hint?: string) => (
    <Field label={label} required error={errors[k]} hint={hint}><input className={inputClass} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>
  );
  const choice = (k: keyof typeof form, label: string, options: string[]) => (
    <Field label={label} required error={errors[k]}>
      <select className={inputClass} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}><option value="">Choose…</option>{options.map((o) => <option key={o}>{o}</option>)}</select>
    </Field>
  );
  return (
    <section className="mb-6 rounded border border-rule bg-sheet p-4">
      <h3 className="mb-3 text-[1.05rem] font-semibold">New vehicle</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {text('registration', 'Registration number', 'As on the RC, for example KA01AB1234')}
        {choice('vehicleType', 'Vehicle type', rules.vehicleTypes)}
        {choice('fuel', 'Fuel', rules.fuels)}
        {text('make', 'Make')}{text('model', 'Model')}
        {text('year', 'Year of manufacture', `${rules.earliestYear} to ${new Date().getFullYear()}`)}
      </div>
      <div className="mt-4 grid gap-2">
        <span className="text-[0.8125rem] font-medium">RC (registration certificate) <span className="text-bad">*</span></span>
        <div className="flex flex-wrap items-center gap-3"><Thumb f={rc} alt="RC" /><Picker label={rc ? 'Replace RC' : 'Choose file'} accept="image/png,image/jpeg,application/pdf" onUploaded={setRc} /></div>
        {errors.rcFileId && <p className="text-[0.8125rem] text-bad">{errors.rcFileId}</p>}
      </div>
      <div className="mt-4">
        <span className="text-[0.8125rem] font-medium">Photos <span className="text-bad">*</span> <span className="font-normal text-muted">({count} of at least {rules.minPhotos})</span></span>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {rules.slots.map((slot) => (
            <div key={slot} className="grid gap-1.5 rounded border border-rule p-2">
              <span className="text-[0.8125rem]">{slot}</span>
              <Thumb f={photos[slot]} alt={slot} />
              <span className="flex flex-wrap gap-2">
                <Picker label={photos[slot] ? 'Replace' : 'Choose file'} accept="image/png,image/jpeg" onUploaded={(f) => setPhotos((p) => ({ ...p, [slot]: f }))} />
                <Picker label="Use camera" accept="image/*" camera onUploaded={(f) => setPhotos((p) => ({ ...p, [slot]: f }))} />
              </span>
            </div>
          ))}
        </div>
        {errors.photos && <p className="mt-1 text-[0.8125rem] text-bad">{errors.photos}</p>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!ready || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save vehicle'}</Button>
        <Button variant="link" onClick={onCancel}>Cancel</Button>
        {!ready && <span className="text-[0.8125rem] text-muted">{!rc ? 'Upload the RC. ' : ''}{count < rules.minPhotos ? tooFew : ''}</span>}
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}

// ── One vehicle: photos by slot, new versions, mark sold / active again ──

function VehicleCard({ v, onChanged }: { v: VehicleView; onChanged: (m: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const act = async (fn: () => Promise<{ meta: { message?: string } }>) => {
    setError(null);
    try { const r = await fn(); onChanged(r.meta.message ?? 'Saved.'); } catch (e) { setError(errorText(e)); }
  };
  const latestRc = v.rc[0];
  return (
    <section className={`mb-5 rounded border p-4 ${v.status === 'ACTIVE' ? 'border-rule bg-sheet' : 'border-rule bg-rule/30'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[1.05rem] font-semibold"><span className="font-mono">{v.registration}</span> <span className="font-normal text-muted">· {v.make} {v.model}, {v.year}, {v.fuel}, {v.vehicleType}</span></h3>
        <span className={`rounded-full px-2 py-0.5 text-[0.75rem] ${v.status === 'ACTIVE' ? 'bg-ok-tint text-ok' : 'bg-rule text-ink-soft'}`}>{v.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE (sold)'}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[0.875rem]">
        <span className="font-medium">RC</span>
        {latestRc && <><Thumb f={latestRc.file} alt="RC" /><span className="text-muted">v{latestRc.version}</span></>}
        <Picker label="New RC version" accept="image/png,image/jpeg,application/pdf" onUploaded={(f) => act(() => vehiclesApi.addFile(v.id, { kind: 'RC', fileId: f.id }))} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {v.photos.map((s) => (
          <div key={s.slot} className="grid gap-1.5 rounded border border-rule p-2 text-[0.8125rem]">
            <span>{s.slot} {s.versions[0] && <span className="text-muted">v{s.versions[0].version}</span>}</span>
            {s.versions[0] ? <Thumb f={s.versions[0].file} alt={s.slot} /> : <span className="text-muted">No photo</span>}
            {showVersions && s.versions.slice(1).map((x) => <span key={x.documentId} className="text-muted">v{x.version}: {fmtDateTime(x.uploadedAt)} <a className="underline" href={x.file ? fileUrl(x.file.id) : '#'} target="_blank" rel="noreferrer">open</a></span>)}
            <Picker label={s.versions[0] ? 'Replace' : 'Add photo'} accept="image/png,image/jpeg" onUploaded={(f) => act(() => vehiclesApi.addFile(v.id, { kind: 'PHOTO', slot: s.slot, fileId: f.id }))} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="link" onClick={() => setShowVersions(!showVersions)}>{showVersions ? 'Hide older versions' : 'Show older versions'}</Button>
        {v.status === 'ACTIVE'
          ? <Button onClick={() => void act(() => vehiclesApi.setStatus(v.id, v.version, 'INACTIVE'))}>Mark as sold</Button>
          : <Button onClick={() => void act(() => vehiclesApi.setStatus(v.id, v.version, 'ACTIVE'))}>Mark active again</Button>}
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}

/** Customer → Vehicles (P-54). */
export function VehiclesTab({ customerId, customerActive }: { customerId: string; customerActive: boolean }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof vehiclesApi.forCustomer>> | null>(null);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setData(await vehiclesApi.forCustomer(customerId)); } catch (e) { setError(errorText(e)); } }, [customerId]);
  useEffect(() => { void load(); }, [load]);
  if (error && !data) return <Notice tone="error">{error}</Notice>;
  if (!data) return <p className="text-muted">Loading vehicles…</p>;
  const active = data.vehicles.filter((v) => v.status === 'ACTIVE').length;
  return (
    <div className="mt-2">
      {message && <div className="mb-4"><Notice>{message}</Notice></div>}
      {adding
        ? <AddVehicle customerId={customerId} rules={data.rules} tooFew={data.tooFewPhotosMessage} onCancel={() => setAdding(false)} onSaved={(m) => { setAdding(false); setMessage(m); void load(); }} />
        : customerActive && <div className="mb-4"><Button variant="primary" disabled={active >= data.rules.maxVehicles} onClick={() => { setAdding(true); setMessage(null); }}>+ Vehicle</Button>
          {active >= data.rules.maxVehicles && <span className="ml-3 text-[0.8125rem] text-muted">A client can have up to {data.rules.maxVehicles} vehicles.</span>}</div>}
      {data.vehicles.length === 0 ? <p className="text-muted">No vehicles recorded yet.</p> : data.vehicles.map((v) => <VehicleCard key={`${v.id}-${v.version}-${v.rc.length}-${v.photos.reduce((n, s) => n + s.versions.length, 0)}`} v={v} onChanged={(m) => { setMessage(m); void load(); }} />)}
      <p className="mt-4 text-[0.8125rem] text-muted">Nothing is deleted: newer photos and RC copies add versions, and a sold vehicle keeps all of them.</p>
    </div>
  );
}