import { useCallback, useEffect, useState } from 'react';
import { errorText, fieldErrors } from '../../api/client';
import { catalogueApi, productsApi, type AdminProduct, type AdminProductRow, type CatInsurer, type InsType, type PVersion, type TplFeature } from '../../api/catalogue';
import { Button } from '../../ui/Button';
import { Field, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';
import { ProductForm, toData, toForm, type FormState } from './ProductForm';
import { PricesPanel } from './PricesPanel';
import { BrochureOcr } from './StageFourB';

const th = 'border-b border-rule py-2 pr-3 text-left font-semibold text-muted';
const td = 'border-b border-rule py-2.5 pr-3 align-top';
const TONE: Record<string, string> = { ACTIVE: 'bg-ok-tint text-ok', UPCOMING: 'bg-warn-tint text-warn', WITHDRAWN: 'bg-rule text-ink-soft', NOT_PUBLISHED: 'bg-rule text-ink-soft', DRAFT: 'bg-rule text-ink-soft', PENDING_APPROVAL: 'bg-warn-tint text-warn', PUBLISHED: 'bg-ok-tint text-ok', SUPERSEDED: 'bg-rule text-muted', CURRENT: 'bg-ok-tint text-ok', SCHEDULED: 'bg-warn-tint text-warn', CLOSED: 'bg-rule text-muted', CANCELLED: 'bg-rule text-muted' };
export const Pill = ({ s }: { s: string }) => <span className={`rounded-full px-2 py-0.5 text-[0.75rem] ${TONE[s] ?? ''}`}>{s.replace('_', ' ')}</span>;

/** The open DRAFT (or PENDING) version, edited with the product form (P-22 step 1). */
function VersionEditor({ product, v, onChanged }: { product: AdminProduct; v: PVersion; onChanged: (m?: string) => void }) {
  const [features, setFeatures] = useState<TplFeature[] | null>(null);
  const [f, setF] = useState<FormState>(toForm(v.data));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { catalogueApi.template(v.templateId).then((t) => setFeatures(t.features as TplFeature[]), (e) => setError(errorText(e))); }, [v.templateId]);
  const editable = v.status === 'DRAFT';
  const oldTemplate = product.currentTemplateId && v.templateId !== product.currentTemplateId;
  async function run(fn: () => Promise<{ meta: { message?: string } }>) {
    setErrors({}); setError(null);
    try { const r = await fn(); onChanged(r.meta.message); } catch (e) { setErrors(fieldErrors(e)); setError(errorText(e)); }
  }
  async function save(andSubmit: boolean) {
    await run(async () => {
      const saved = await productsApi.saveDraft(v.id, v.rev, toData(f, features ?? []));
      return andSubmit ? productsApi.submit(v.id, saved.data.rev) : { meta: { message: 'Draft saved.' } };
    });
  }
  if (!features) return error ? <Notice tone="error">{error}</Notice> : <p className="text-muted">Loading the template…</p>;
  return (
    <section className="mt-4 rounded border border-rule bg-sheet p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3"><h4 className="font-semibold">Version {v.number}</h4><Pill s={v.status} /></div>
      {v.rejectReason && editable && <div className="mb-3"><Notice tone="error">Rejected: {v.rejectReason}</Notice></div>}
      {v.status === 'PENDING_APPROVAL' && <div className="mb-3"><Notice>Waiting for another admin to approve. Advisors still see the published version.</Notice></div>}
      {oldTemplate && editable && (
        <div className="mb-3"><Notice tone="warn">This product uses an older feature template. Update it to the current template before its next publish.{' '}
          <Button onClick={() => void run(() => productsApi.useCurrentTemplate(v.id, v.rev))}>Use current template</Button></Notice></div>
      )}
      {editable && <BrochureOcr versionId={v.id} onApplied={() => onChanged()} />}
      <ProductForm f={f} set={setF} features={features} kind="VERIFIED" errors={errors} disabled={!editable} />
      {editable && <div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => void save(false)}>Save draft</Button><Button variant="primary" onClick={() => void save(true)}>Submit for approval</Button></div>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}

function ProductDetail({ id, admin, onClose, onListChanged }: { id: string; admin: boolean; onClose: () => void; onListChanged: () => void }) {
  const [p, setP] = useState<AdminProduct | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const load = useCallback(async () => { try { setP(await productsApi.adminGet(id)); } catch (e) { setError(errorText(e)); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (!p) return error ? <Notice tone="error">{error}</Notice> : <p className="text-muted">Loading…</p>;
  const open = p.versions.find((v) => v.status === 'DRAFT' || v.status === 'PENDING_APPROVAL');
  const published = p.versions.find((v) => v.status === 'PUBLISHED');
  const changed = (m?: string) => { if (m) setMessage(m); void load(); onListChanged(); };
  async function act(fn: () => Promise<{ meta: { message?: string } }>) {
    setError(null); setMessage(null);
    try { const r = await fn(); changed(r.meta.message); } catch (e) { setError(errorText(e)); }
  }
  return (
    <section className="mb-6 rounded border border-rule bg-sheet p-4">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h3 className="text-[1.1rem] font-semibold">{published?.data?.name ?? open?.data?.name ?? p.code}</h3><Pill s={p.status} />
        <span className="font-mono text-muted">{p.code}</span><span className="text-muted">{p.insurer.name} · {p.type.name}</span>
      </div>
      {p.withdrawnReason && p.status === 'WITHDRAWN' && <p className="mb-2 text-[0.875rem] text-muted">Withdrawn: {p.withdrawnReason}</p>}
      <table className="mb-3 w-full text-[0.875rem]"><thead><tr><th className={th}>Version</th><th className={th}>Status</th><th className={th}>Name</th></tr></thead>
        <tbody>{p.versions.map((v) => <tr key={v.id}><td className={td}>{v.number}</td><td className={td}><Pill s={v.status} /></td><td className={td}>{v.data?.name ?? '—'}</td></tr>)}</tbody></table>
      <div className="flex flex-wrap items-center gap-2">
        {!open && <Button onClick={() => void act(() => productsApi.startEdit(p.id))}>Edit (new version)</Button>}
        {admin && p.status !== 'NOT_PUBLISHED' && (p.status === 'WITHDRAWN'
          ? <Button onClick={() => void act(() => productsApi.makeAvailable(p.id, p.version))}>Make available</Button>
          : <><input className={`${inputClass} max-w-[280px]`} placeholder="Reason for withdrawing" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button variant="danger" disabled={!reason.trim()} onClick={() => void act(() => productsApi.withdraw(p.id, p.version, reason.trim()))}>Withdraw</Button></>)}
        <Button variant="link" onClick={onClose}>Close</Button>
      </div>
      {message && <div className="mt-3"><Notice>{message}</Notice></div>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      {(open ?? published)?.data?.pricingMode === 'RATE_TABLE' && <PricesPanel productId={p.id} base="/admin/products" title="SkyUp reference price (needed to submit a rate-table product)" />}
      {open && <VersionEditor key={`${open.id}-${open.rev}`} product={p} v={open} onChanged={changed} />}
    </section>
  );
}

/** Admin → Catalogue → Products (P-22 verified products, P-25). */
export function ProductsAdminTab({ admin }: { admin: boolean }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<AdminProductRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [insurers, setInsurers] = useState<CatInsurer[]>([]);
  const [types, setTypes] = useState<InsType[]>([]);
  const [nf, setNf] = useState({ insurerId: '', typeId: '', code: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setRows(await productsApi.adminList(q || undefined)); } catch (e) { setError(errorText(e)); } }, [q]);
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t); }, [load]);
  async function startAdd() {
    setAdding(true); setError(null);
    try { setInsurers(await catalogueApi.insurers(undefined, 'ACTIVE')); setTypes((await catalogueApi.types()).filter((t) => t.status === 'ACTIVE' && t.activeTemplate)); } catch (e) { setError(errorText(e)); }
  }
  async function create() {
    setErrors({}); setError(null);
    try { const r = await productsApi.adminCreate(nf); setAdding(false); setNf({ insurerId: '', typeId: '', code: '' }); setOpenId(r.productId); void load(); }
    catch (e) { setErrors(fieldErrors(e)); setError(errorText(e)); }
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className={`${inputClass} max-w-[320px]`} placeholder="Search name or code" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="flex-1" />
        <Button variant="primary" onClick={() => void startAdd()}>+ Product</Button>
      </div>
      {adding && (
        <section className="mb-6 rounded border border-rule bg-sheet p-4">
          <h3 className="mb-3 font-semibold">New verified product</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Insurer" required error={errors.insurerId}><select className={inputClass} value={nf.insurerId} onChange={(e) => setNf({ ...nf, insurerId: e.target.value })}><option value="">Choose…</option>{insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
            <Field label="Insurance type" required error={errors.typeId} hint="Only types with a live template"><select className={inputClass} value={nf.typeId} onChange={(e) => setNf({ ...nf, typeId: e.target.value })}><option value="">Choose…</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            <Field label="Product code" required error={errors.code}><input className={inputClass} value={nf.code} onChange={(e) => setNf({ ...nf, code: e.target.value })} /></Field>
          </div>
          <div className="mt-3 flex gap-2"><Button variant="primary" onClick={() => void create()}>Create draft</Button><Button variant="link" onClick={() => setAdding(false)}>Cancel</Button></div>
        </section>
      )}
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {openId && <ProductDetail key={openId} id={openId} admin={admin} onClose={() => setOpenId(null)} onListChanged={() => void load()} />}
      {!rows ? <p className="text-muted">Loading…</p> : rows.length === 0 ? <p className="text-muted">No verified products yet.</p> : (
        <table className="w-full text-[0.875rem]">
          <thead><tr><th className={th}>Product</th><th className={th}>Insurer</th><th className={th}>Type</th><th className={th}>Status</th><th className={th}>Being changed</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="cursor-pointer hover:bg-sheet" onClick={() => setOpenId(r.id)}>
              <td className={td}><span className="font-medium">{r.name ?? '(no name yet)'}</span> <span className="font-mono text-muted">{r.code}</span></td>
              <td className={td}>{r.insurer}</td><td className={td}>{r.type}</td><td className={td}><Pill s={r.status} /></td>
              <td className={td}>{r.openVersion ? `Version ${r.openVersion.number}: ${r.openVersion.status.replace('_', ' ').toLowerCase()}` : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </>
  );
}