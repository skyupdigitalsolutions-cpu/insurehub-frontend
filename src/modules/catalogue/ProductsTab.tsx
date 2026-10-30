import { useCallback, useEffect, useState } from 'react';
import { errorText, fieldErrors } from '../../api/client';
import { productsApi, type CatalogueProduct, type LiveFeatures, type OwnType, type ProductDetail } from '../../api/catalogue';
import { documentsApi, type CatalogueInsurer } from '../../api/documents';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../ui/Button';
import { Field, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';
import { ProductForm, toData, toForm, type FormState } from './ProductForm';
import { Pill } from './ProductsAdminTab';
import { PricesPanel } from './PricesPanel';
import { SuggestCorrection } from './StageFourB';

const th = 'border-b border-rule py-2 pr-3 text-left font-semibold text-muted';
const td = 'border-b border-rule py-2 pr-3 align-top';
const shown = (v: unknown) => (v === true ? 'Yes' : v === false ? 'No' : v === null || v === undefined || v === '' ? '—' : String(v));

/** My commercials (P-22 step 3): private to the advisor; assistants never see this (AC-P22-6). */
function Commercials({ productId }: { productId: string }) {
  const [c, setC] = useState({ commissionPercent: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { productsApi.commercials(productId).then((x) => setC({ commissionPercent: x.commissionPercent === null ? '' : String(x.commissionPercent), notes: x.notes ?? '' }), () => undefined); }, [productId]);
  async function save() {
    setErrors({}); setMessage(null);
    try { const r = await productsApi.saveCommercials(productId, { commissionPercent: c.commissionPercent.trim() || null, notes: c.notes.trim() || null }); setMessage(r.meta.message ?? 'Saved.'); }
    catch (e) { setErrors(fieldErrors(e)); }
  }
  return (
    <div className="mt-4 rounded border border-rule p-3">
      <h4 className="mb-2 font-semibold">My commercials <span className="text-[0.8125rem] font-normal text-muted">(only you can see these)</span></h4>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
        <Field label="Commission %" error={errors.commissionPercent}><input className={inputClass} value={c.commissionPercent} onChange={(e) => setC({ ...c, commissionPercent: e.target.value })} /></Field>
        <Field label="Notes" error={errors.notes}><input className={inputClass} value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} /></Field>
        <Button variant="primary" onClick={() => void save()}>Save</Button>
      </div>
      {message && <div className="mt-2"><Notice>{message}</Notice></div>}
    </div>
  );
}

/** + My product, or editing one: the same form, published at once in this account (P-22 step 2). */
function OwnProductForm({ start, onDone, onCancel }: { start?: ProductDetail; onDone: (m: string, id: string) => void; onCancel: () => void }) {
  const [types, setTypes] = useState<OwnType[]>([]);
  const [insurers, setInsurers] = useState<CatalogueInsurer[]>([]);
  const [head, setHead] = useState({ insurerId: '', typeId: '', code: '' });
  const [live, setLive] = useState<LiveFeatures | null>(null);
  // Edit from `entered` (the values as typed), never from `data`, where "not stated" is already display text.
  const [f, setF] = useState<FormState>(toForm(start?.publishedVersion?.entered));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!start) {
      productsApi.ownTypes().then(setTypes, (e) => setError(errorText(e)));
      documentsApi.insurers().then((x) => setInsurers(x.filter((i) => i.status === 'ACTIVE')), () => undefined);
    }
  }, [start]);
  // The live template's features for the chosen type (or the product's type when editing; saving uses the live one).
  const typeId = start?.typeId ?? head.typeId;
  useEffect(() => {
    setLive(null);
    if (typeId) productsApi.liveFeatures(typeId).then(setLive, (e) => setError(errorText(e)));
  }, [typeId]);
  const type = live;
  async function save() {
    setErrors({}); setError(null);
    try {
      const data = toData(f, type?.features ?? []);
      const r = start ? await productsApi.editOwn(start.id, start.version, data) : await productsApi.createOwn({ ...head, data });
      onDone(r.meta.message ?? 'Product saved.', r.data.id);
    } catch (e) { setErrors(fieldErrors(e)); setError(errorText(e)); }
  }
  return (
    <section className="mb-6 rounded border border-rule bg-sheet p-4">
      <h3 className="mb-3 text-[1.05rem] font-semibold">{start ? `Edit ${start.publishedVersion?.data.name ?? start.code}` : 'New product (only you will see it)'}</h3>
      {!start && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Field label="Insurer" required error={errors.insurerId}><select className={inputClass} value={head.insurerId} onChange={(e) => setHead({ ...head, insurerId: e.target.value })}><option value="">Choose…</option>{insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
          <Field label="Insurance type" required error={errors.typeId}><select className={inputClass} value={head.typeId} onChange={(e) => setHead({ ...head, typeId: e.target.value })}><option value="">Choose…</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name} (template v{t.template.number})</option>)}</select></Field>
          <Field label="Product code" required error={errors.code}><input className={inputClass} value={head.code} onChange={(e) => setHead({ ...head, code: e.target.value })} /></Field>
        </div>
      )}
      {type ? <ProductForm f={f} set={setF} features={type.features} kind="OWN" errors={errors} /> : !start && <p className="text-[0.875rem] text-muted">Choose the insurance type to see its features.</p>}
      <div className="mt-5 flex gap-2"><Button variant="primary" disabled={!type} onClick={() => void save()}>Save and publish</Button><Button variant="link" onClick={onCancel}>Cancel</Button></div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}

function Detail({ id, advisor, onEdit, onChanged }: { id: string; advisor: boolean; onEdit: (p: ProductDetail) => void; onChanged: () => void }) {
  const [p, setP] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => productsApi.get(id).then(setP, (e) => setError(errorText(e))), [id]);
  useEffect(() => { void load(); }, [load]);
  if (!p) return error ? <Notice tone="error">{error}</Notice> : <p className="text-muted">Loading…</p>;
  const d = p.publishedVersion?.data ?? {};
  const fv = (k: string) => d.features?.[k];
  return (
    <section className="mb-6 rounded border border-rule bg-sheet p-4 text-[0.875rem]">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-[1.1rem] font-semibold">{d.name ?? p.code}</h3><Pill s={p.status} />
        <span className="text-muted">{p.insurer} · {p.type} · {p.kind === 'OWN' ? 'My product' : 'Verified by SkyUp'}</span>
      </div>
      {p.status === 'WITHDRAWN' && <div className="mb-3"><Notice>Withdrawn: it cannot be chosen for new quotations, but existing policies can be renewed.</Notice></div>}
      <table className="w-full"><tbody>
        <tr><td className={`${td} w-[38%] text-muted`}>UIN</td><td className={`${td} font-mono`}>{d.uin}</td></tr>
        <tr><td className={`${td} text-muted`}>Adult entry age</td><td className={td}>{d.adultMin} to {d.adultMax}{d.coversChildren ? `; children ${d.childMin ?? 0} to ${d.childMax ?? 25}` : ''}</td></tr>
        <tr><td className={`${td} text-muted`}>Sum insured</td><td className={td}>{d.sumInsured?.options?.length ? d.sumInsured.options.map((n) => `₹${n.toLocaleString('en-IN')}`).join(', ') : `₹${d.sumInsured?.min?.toLocaleString('en-IN')} to ₹${d.sumInsured?.max?.toLocaleString('en-IN')}`}</td></tr>
        <tr><td className={`${td} text-muted`}>Policy terms</td><td className={td}>{(d.policyTerms ?? []).join(', ')} {(d.policyTerms ?? []).length === 1 && d.policyTerms![0] === 1 ? 'year' : 'years'}</td></tr>
        {p.features.map((x) => <tr key={x.key}><td className={`${td} text-muted`}>{x.name}</td><td className={td}>{shown(fv(x.key)?.value)}{fv(x.key)?.page ? <span className="text-muted"> (page {fv(x.key)!.page})</span> : null}</td></tr>)}
        {(d.addOns ?? []).map((a) => <tr key={a.name}><td className={`${td} text-muted`}>Add-on: {a.name}</td><td className={td}>{a.priceType === 'FIXED' ? `₹${a.value}` : `${a.value}% of base premium`}</td></tr>)}
      </tbody></table>
      {advisor && p.kind === 'OWN' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => onEdit(p)}>Edit</Button>
          <select className={`${inputClass} max-w-[200px]`} value={p.status} onChange={(e) => productsApi.ownStatus(p.id, p.version, e.target.value as 'UPCOMING' | 'ACTIVE' | 'WITHDRAWN').then(() => { void load(); onChanged(); }, (er) => setError(errorText(er)))}>
            <option value="UPCOMING">Upcoming</option><option value="ACTIVE">Active</option><option value="WITHDRAWN">Withdrawn</option>
          </select>
        </div>
      )}
      {advisor && d.pricingMode === 'RATE_TABLE' && <PricesPanel productId={p.id} base="/products" title="My prices (only you can see these)" />}
      {advisor && <Commercials productId={p.id} />}
      {advisor && p.kind === 'VERIFIED' && <SuggestCorrection productId={p.id} />}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}

/** Products for advisors and assistants: the catalogue they can quote (verified + own). */
export function ProductsTab() {
  const { can } = useAuth();
  const advisor = can('commercials.manage');
  const [rows, setRows] = useState<CatalogueProduct[] | null>(null);
  const [quotable, setQuotable] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ start?: ProductDetail } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setRows(await productsApi.list({ quotable })); } catch (e) { setError(errorText(e)); } }, [quotable]);
  useEffect(() => { void load(); }, [load]);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[0.875rem]"><input type="checkbox" checked={quotable} onChange={(e) => setQuotable(e.target.checked)} /> Only products I can quote now</label>
        <span className="flex-1" />
        {can('products.own') && <Button variant="primary" onClick={() => { setForm({}); setOpenId(null); setMessage(null); }}>+ My product</Button>}
      </div>
      {form && <OwnProductForm key={form.start?.id ?? 'new'} start={form.start} onCancel={() => setForm(null)} onDone={(m, id) => { setForm(null); setMessage(m); setOpenId(id); void load(); }} />}
      {message && <div className="mb-4"><Notice>{message}</Notice></div>}
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {openId && !form && <Detail key={openId} id={openId} advisor={advisor} onEdit={(p) => setForm({ start: p })} onChanged={() => void load()} />}
      {!rows ? <p className="text-muted">Loading…</p> : rows.length === 0 ? <p className="text-muted">No products yet.</p> : (
        <table className="w-full text-[0.875rem]">
          <thead><tr><th className={th}>Product</th><th className={th}>Insurer</th><th className={th}>Type</th><th className={th}>Source</th><th className={th}>Status</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="cursor-pointer hover:bg-sheet" onClick={() => { setOpenId(r.id); setForm(null); setMessage(null); }}>
              <td className={td}><span className="font-medium">{r.name}</span> <span className="font-mono text-muted">{r.code}</span></td>
              <td className={td}>{r.insurer}</td><td className={td}>{r.type}</td><td className={td}>{r.kind === 'OWN' ? 'My product' : 'Verified'}</td>
              <td className={td}><Pill s={r.status} />{r.renewalOnly && <span className="ml-2 text-[0.75rem] text-muted">renewals only</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </>
  );
}