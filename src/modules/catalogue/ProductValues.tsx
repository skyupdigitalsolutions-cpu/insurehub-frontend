import { useState, type ReactNode } from 'react';
import type { AddOn, Feature, FeatureValue, ProductData } from '../../api/catalogue';
import { fileUrl } from '../../api/profile';
import { Button } from '../../ui/Button';
import { Field, fmtDate, inputClass } from '../../ui/form';

/**
 * P-22 product values: one editor for SkyUp's verified-product drafts and an advisor's own products, so both
 * follow the same field rules. The server is the judge of completeness (CAT-13) and of each field; this screen
 * only shapes what is typed into the API's format.
 */
const td = 'border-b border-rule py-1.5 pr-2 align-top';
const th = 'border-b border-rule py-2 pr-2 text-left text-[0.8125rem] font-semibold text-muted';
const cell = `${inputClass} py-1 text-[0.8125rem]`;
const h4 = 'mt-5 mb-2 font-semibold';

const NUMERIC = new Set(['Number', 'Amount in ₹', 'Percentage', 'Days', 'Months', 'Years']);
const UNIT: Record<string, string> = { 'Amount in ₹': '₹', Percentage: '%', Days: 'days', Months: 'months', Years: 'years' };
const rupee = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);
const blank = (v: unknown) => v === undefined || v === null || v === '';

/** Server dates are YYYY-MM-DD; people type DD-MM-YYYY (the API accepts both). */
const typedDate = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? fmtDate(v) : v ?? '');

/** Values loaded from the API → what the form edits (dates as typed). */
export function toForm(d: ProductData | undefined): ProductData {
  const x = { ...(d ?? {}) };
  return { ...x, launchDate: typedDate(x.launchDate), sourceCheckedOn: typedDate(x.sourceCheckedOn) };
}

/**
 * What the form holds → the request body. Blank fields are left out (never sent as ""), numeric feature values
 * become numbers, Yes/No stays boolean, and only features of the template being used are sent.
 */
export function toPayload(d: ProductData, features: Feature[]): ProductData {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) if (!blank(v) && !['features', 'addOns', 'sumInsured', 'policyTerms'].includes(k)) out[k] = v;
  const si = d.sumInsured ?? {};
  const sumInsured = { ...(si.options?.length ? { options: si.options } : {}), ...(!blank(si.min) ? { min: si.min } : {}), ...(!blank(si.max) ? { max: si.max } : {}) };
  if (Object.keys(sumInsured).length) out.sumInsured = sumInsured;
  if (d.policyTerms?.length) out.policyTerms = d.policyTerms;
  if (d.addOns?.length) out.addOns = d.addOns.map((a) => ({ name: a.name, priceType: a.priceType, value: Number(a.value), ...(a.description ? { description: a.description } : {}) }));
  const feats: Record<string, FeatureValue> = {};
  for (const f of features) {
    const v = d.features?.[f.key ?? ''];
    if (!v || !f.key) continue;
    const page = blank(v.page) ? undefined : Number(v.page);
    if (v.notStated) { feats[f.key] = { notStated: true, ...(page ? { page } : {}) }; continue; }
    if (blank(v.value)) continue;
    const value = NUMERIC.has(f.dataType) && typeof v.value === 'string' && /^\d+(\.\d+)?$/.test(v.value.trim()) ? Number(v.value) : v.value;
    feats[f.key] = { value, ...(page ? { page } : {}) };
  }
  if (Object.keys(feats).length) out.features = feats;
  return out as ProductData;
}

/** Server field paths come as "uin" (submit checks) or "data.uin" (field validation): one key for the form. */
export const productFieldErrors = (e: Record<string, string>) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k.replace(/^data\./, ''), v]));

/** A short list typed one value at a time (sum insured options, policy terms). */
function Chips({ values, onChange, format, placeholder, disabled }: { values: Array<number | string>; onChange: (v: Array<number | string>) => void; format: (v: number | string) => string; placeholder: string; disabled?: boolean }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim().replace(/,/g, '');
    if (!v) return;
    onChange([...values, /^\d+$/.test(v) ? Number(v) : v]);
    setDraft('');
  };
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {values.length === 0 && <span className="text-[0.8125rem] text-muted">None yet</span>}
        {values.map((v, i) => (
          <span key={`${v}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-rule bg-paper px-2 py-0.5 text-[0.8125rem]">
            {format(v)}
            {!disabled && <button type="button" aria-label={`Remove ${format(v)}`} className="cursor-pointer text-muted hover:text-bad" onClick={() => onChange(values.filter((_, j) => j !== i))}>×</button>}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <input className={`${inputClass} max-w-[200px]`} inputMode="numeric" placeholder={placeholder} value={draft}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <Button type="button" onClick={add} disabled={!draft.trim()}>Add</Button>
        </div>
      )}
    </div>
  );
}

function FeatureInput({ f, v, onChange, disabled }: { f: Feature; v: FeatureValue; onChange: (v: FeatureValue) => void; disabled?: boolean }) {
  const off = disabled || v.notStated;
  if (f.dataType === 'Yes/No') {
    const shown = v.notStated ? '' : v.value === true ? 'yes' : v.value === false ? 'no' : '';
    return (
      <select className={cell} disabled={off} value={shown} onChange={(e) => onChange({ ...v, value: e.target.value === '' ? null : e.target.value === 'yes' })}>
        <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
      </select>
    );
  }
  const unit = UNIT[f.dataType];
  return (
    <div className="flex items-center gap-1.5">
      {unit === '₹' && <span className="text-muted">₹</span>}
      <input className={cell} disabled={off} inputMode={NUMERIC.has(f.dataType) ? 'decimal' : undefined} value={v.notStated ? '' : String(v.value ?? '')}
        onChange={(e) => onChange({ ...v, value: e.target.value })} />
      {unit && unit !== '₹' && <span className="whitespace-nowrap text-[0.8125rem] text-muted">{unit}</span>}
    </div>
  );
}

export function ProductValues({ kind, features, value: d, onChange, errors, disabled, onBrochure }: {
  kind: 'VERIFIED' | 'OWN'; features: Feature[]; value: ProductData; onChange: (d: ProductData) => void; errors: Record<string, string>;
  disabled?: boolean; onBrochure?: (file: File) => Promise<void>;
}) {
  const set = (patch: Partial<ProductData>) => onChange({ ...d, ...patch });
  const text = (k: 'name' | 'description' | 'uin' | 'launchDate' | 'sourceLink' | 'sourceCheckedOn' | 'adultMin' | 'adultMax' | 'childMin' | 'childMax' | 'taxPercent' | 'maxNominees' | 'gracePeriodDays', label: string, opts: { required?: boolean; hint?: string; numeric?: boolean } = {}) => (
    <Field label={label} required={opts.required} error={errors[k]} hint={opts.hint}>
      <input className={inputClass} disabled={disabled} inputMode={opts.numeric ? 'decimal' : undefined} value={String(d[k] ?? '')} onChange={(e) => set({ [k]: e.target.value })} />
    </Field>
  );
  const feature = (key: string) => d.features?.[key] ?? {};
  const setFeature = (key: string, v: FeatureValue) => set({ features: { ...(d.features ?? {}), [key]: v } });
  const groups = [...new Set(features.map((f) => f.group))];
  const addOns = d.addOns ?? [];
  const setAddOn = (i: number, patch: Partial<AddOn>) => set({ addOns: addOns.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const [uploading, setUploading] = useState(false);

  return (
    <div>
      <h4 className="mb-2 font-semibold">Product</h4>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        {text('name', 'Product name', { required: true })}
        {text('uin', 'IRDAI product UIN', { required: true, hint: 'Capital letters and digits, no spaces' })}
        {text('description', 'Short description')}
        {text('launchDate', 'Launch date', { required: true, hint: 'DD-MM-YYYY. A later date publishes as Upcoming.' })}
      </div>

      <h4 className={h4}>Who can buy it</h4>
      <div className="grid items-start gap-3 sm:grid-cols-4">
        {text('adultMin', 'Adult minimum entry age', { required: true, numeric: true })}
        {text('adultMax', 'Adult maximum entry age', { required: true, numeric: true })}
        <label className="flex items-center gap-2 self-end pb-2 text-[0.875rem] sm:col-span-2">
          <input type="checkbox" disabled={disabled} checked={!!d.coversChildren} onChange={(e) => set({ coversChildren: e.target.checked })} /> Covers dependent children
        </label>
        {d.coversChildren && <>
          {text('childMin', 'Child minimum entry age', { numeric: true, hint: 'Blank uses the standard band' })}
          {text('childMax', 'Child maximum entry age', { numeric: true, hint: 'Not above the adult maximum' })}
        </>}
      </div>

      <h4 className={h4}>Cover</h4>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Field label="Sum insured options" error={errors['sumInsured.options'] ?? errors.sumInsured} hint="Or give a range instead">
          <Chips values={d.sumInsured?.options ?? []} disabled={disabled} format={rupee} placeholder="500000"
            onChange={(options) => set({ sumInsured: { ...(d.sumInsured ?? {}), options } })} />
        </Field>
        <div className="grid grid-cols-2 items-start gap-3">
          <Field label="Range from (₹)" error={errors['sumInsured.min']}>
            <input className={inputClass} disabled={disabled} inputMode="numeric" value={String(d.sumInsured?.min ?? '')} onChange={(e) => set({ sumInsured: { ...(d.sumInsured ?? {}), min: e.target.value } })} />
          </Field>
          <Field label="Range to (₹)" error={errors['sumInsured.max']}>
            <input className={inputClass} disabled={disabled} inputMode="numeric" value={String(d.sumInsured?.max ?? '')} onChange={(e) => set({ sumInsured: { ...(d.sumInsured ?? {}), max: e.target.value } })} />
          </Field>
        </div>
        <Field label="Policy terms (years)" required error={errors.policyTerms}>
          <Chips values={d.policyTerms ?? []} disabled={disabled} format={(v) => `${v} yr`} placeholder="1" onChange={(policyTerms) => set({ policyTerms })} />
        </Field>
      </div>

      <h4 className={h4}>Features</h4>
      {features.length === 0 ? <p className="text-muted">This insurance type's template has no features.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-[0.875rem]">
          <thead><tr><th className={th}>Feature</th><th className={th}>Value</th><th className={th}>Not stated by insurer</th><th className={th}>Brochure page</th></tr></thead>
          {groups.map((g) => (
            <tbody key={g}>
              <tr><td colSpan={4} className="pt-3 pb-1 text-[0.8125rem] font-semibold text-ink-soft">{g}</td></tr>
              {features.filter((f) => f.group === g).map((f) => {
                const key = f.key ?? '';
                const v = feature(key);
                const err = errors[`features.${key}`] ?? errors[`features.${key}.value`] ?? errors[`features.${key}.page`];
                return (
                  <tr key={key}>
                    <td className={`${td} w-[38%]`}>
                      {f.name}{f.requiredToPublish && <span className="text-bad" aria-hidden> *</span>}
                      {f.help && <span className="block text-[0.75rem] text-muted">{f.help}</span>}
                      {err && <span role="alert" className="block text-[0.75rem] text-bad">⚠ {err}</span>}
                    </td>
                    <td className={td}><FeatureInput f={f} v={v} disabled={disabled} onChange={(x) => setFeature(key, x)} /></td>
                    <td className={td}><input type="checkbox" aria-label={`${f.name}: not stated by insurer`} disabled={disabled} checked={!!v.notStated} onChange={(e) => setFeature(key, { ...v, notStated: e.target.checked })} /></td>
                    <td className={`${td} w-[110px]`}><input className={cell} aria-label={`${f.name}: brochure page`} disabled={disabled} inputMode="numeric" value={String(v.page ?? '')} onChange={(e) => setFeature(key, { ...v, page: e.target.value === '' ? null : (e.target.value as unknown as number) })} /></td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table></div>
      )}

      <h4 className={h4}>Add-ons</h4>
      {errors.addOns && <p role="alert" className="mb-1 text-[0.8125rem] text-bad">⚠ {errors.addOns}</p>}
      {addOns.length > 0 && (
        <div className="overflow-x-auto"><table className="w-full text-[0.875rem]">
          <thead><tr><th className={th}>Add-on</th><th className={th}>Description</th><th className={th}>Priced as</th><th className={th}>Price</th><th className={th} /></tr></thead>
          <tbody>{addOns.map((a, i) => (
            <tr key={i}>
              <td className={td}><input className={cell} disabled={disabled} value={a.name} onChange={(e) => setAddOn(i, { name: e.target.value })} />{errors[`addOns.${i}.name`] && <span className="text-[0.75rem] text-bad">⚠ {errors[`addOns.${i}.name`]}</span>}</td>
              <td className={td}><input className={cell} disabled={disabled} value={a.description ?? ''} onChange={(e) => setAddOn(i, { description: e.target.value })} /></td>
              <td className={td}><select className={cell} disabled={disabled} value={a.priceType} onChange={(e) => setAddOn(i, { priceType: e.target.value as AddOn['priceType'] })}><option value="FIXED">Fixed ₹</option><option value="PERCENT">% of premium</option></select></td>
              <td className={`${td} w-[130px]`}><input className={cell} disabled={disabled} inputMode="decimal" value={String(a.value)} onChange={(e) => setAddOn(i, { value: e.target.value })} />{errors[`addOns.${i}.value`] && <span className="text-[0.75rem] text-bad">⚠ {errors[`addOns.${i}.value`]}</span>}</td>
              <td className={td}>{!disabled && <button type="button" className="px-1 text-bad" onClick={() => set({ addOns: addOns.filter((_, j) => j !== i) })}>Remove</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {!disabled && <Button type="button" onClick={() => set({ addOns: [...addOns, { name: '', priceType: 'FIXED', value: '' }] })}>+ Add-on</Button>}

      <h4 className={h4}>Pricing and policy</h4>
      <div className="grid items-start gap-3 sm:grid-cols-3">
        <Field label="Pricing mode" required error={errors.pricingMode} hint={kind === 'VERIFIED' && d.pricingMode === 'RATE_TABLE' ? 'Needs a SkyUp price version (P-24), not built yet' : undefined}>
          <select className={inputClass} disabled={disabled} value={d.pricingMode ?? ''} onChange={(e) => set({ pricingMode: (e.target.value || null) as ProductData['pricingMode'] })}>
            <option value="">Choose…</option><option value="MANUAL_ENTRY">Entered per quote</option><option value="RATE_TABLE">Rate table</option>
          </select>
        </Field>
        {text('taxPercent', 'Tax %', { required: true, numeric: true })}
        {text('gracePeriodDays', 'Grace period (days)', { numeric: true })}
        <label className="flex items-center gap-2 self-end pb-2 text-[0.875rem]">
          <input type="checkbox" disabled={disabled} checked={!!d.nomineeRequired} onChange={(e) => set({ nomineeRequired: e.target.checked })} /> Nominee required
        </label>
        {text('maxNominees', 'Most nominees', { numeric: true })}
      </div>

      <h4 className={h4}>Source</h4>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        {text('sourceLink', 'Insurer page link', { required: kind === 'VERIFIED' && !d.brochureFileId, hint: 'https://…' })}
        {text('sourceCheckedOn', 'Date checked', { required: kind === 'VERIFIED' && !d.brochureFileId, hint: 'DD-MM-YYYY' })}
        {kind === 'OWN' && onBrochure && (
          <Field label="Brochure (PDF or image)" error={errors.brochureFileId}>
            <div className="flex flex-wrap items-center gap-2">
              {d.brochureFileId && <a className="text-[0.8125rem] text-focus underline" href={fileUrl(d.brochureFileId)} target="_blank" rel="noreferrer">Open the attached brochure</a>}
              {!disabled && <input type="file" accept="application/pdf,image/jpeg,image/png" disabled={uploading} className="text-[0.8125rem]"
                onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setUploading(true); try { await onBrochure(f); } finally { setUploading(false); e.target.value = ''; } }} />}
              {d.brochureFileId && !disabled && <Button type="button" variant="link" onClick={() => set({ brochureFileId: null })}>Remove</Button>}
            </div>
          </Field>
        )}
      </div>
    </div>
  );
}

/** Read-only view of a version's values, as an advisor or approver reads them. */
export function ProductSummary({ data: d, features }: { data: ProductData; features: Feature[] }) {
  const row = (label: string, value: ReactNode) => <tr key={label}><td className={`${td} w-[38%] text-muted`}>{label}</td><td className={td}>{value}</td></tr>;
  const featureText = (f: Feature) => {
    const v = d.features?.[f.key ?? ''];
    if (!v) return <span className="text-muted">—</span>;
    if (v.notStated || v.value === 'Not stated by insurer') return <span className="text-muted italic">Not stated by insurer</span>;
    const raw = v.value;
    const shown = raw === true ? 'Yes' : raw === false ? 'No' : f.dataType === 'Amount in ₹' ? rupee(raw) : `${raw ?? '—'}${UNIT[f.dataType] && UNIT[f.dataType] !== '₹' ? ` ${UNIT[f.dataType]}` : ''}`;
    return <>{shown}{v.page ? <span className="ml-2 text-[0.75rem] text-muted">p. {v.page}</span> : null}</>;
  };
  const groups = [...new Set(features.map((f) => f.group))];
  const si = d.sumInsured ?? {};
  return (
    <div className="grid gap-4">
      <table className="w-full text-[0.875rem]"><tbody>
        {row('UIN', <span className="font-mono">{d.uin ?? '—'}</span>)}
        {d.description ? row('Description', d.description) : null}
        {row('Launch date', fmtDate(d.launchDate ?? null))}
        {row('Adult entry age', `${d.adultMin ?? '—'} to ${d.adultMax ?? '—'} years`)}
        {row('Dependent children', d.coversChildren ? `Covered${!blank(d.childMin) || !blank(d.childMax) ? `, ${d.childMin ?? 0} to ${d.childMax ?? '—'} years` : ' (standard band)'}` : 'Not covered')}
        {row('Sum insured', [si.options?.length ? si.options.map(rupee).join(', ') : null, !blank(si.min) || !blank(si.max) ? `${rupee(si.min)} to ${rupee(si.max)}` : null].filter(Boolean).join('; ') || '—')}
        {row('Policy terms', d.policyTerms?.length ? d.policyTerms.map((t) => `${t} yr`).join(', ') : '—')}
        {row('Pricing', `${d.pricingMode === 'RATE_TABLE' ? 'Rate table' : d.pricingMode === 'MANUAL_ENTRY' ? 'Premium entered per quote' : '—'}; tax ${d.taxPercent ?? '—'}%`)}
        {row('Nominees', `${d.nomineeRequired ? 'Required' : 'Optional'}${d.maxNominees ? `, up to ${d.maxNominees}` : ''}`)}
        {row('Grace period', blank(d.gracePeriodDays) ? '—' : `${d.gracePeriodDays} days`)}
        {row('Source', <>{d.sourceLink ? <a className="text-focus underline" href={d.sourceLink} target="_blank" rel="noreferrer">{d.sourceLink}</a> : '—'}{d.sourceCheckedOn ? ` (checked ${fmtDate(d.sourceCheckedOn)})` : ''}{d.brochureFileId ? <> · <a className="text-focus underline" href={fileUrl(d.brochureFileId)} target="_blank" rel="noreferrer">brochure</a></> : null}</>)}
      </tbody></table>
      {features.length > 0 && (
        <table className="w-full text-[0.875rem]">
          <thead><tr><th className={th}>Feature</th><th className={th}>Value</th></tr></thead>
          {groups.map((g) => (
            <tbody key={g}>
              <tr><td colSpan={2} className="pt-3 pb-1 text-[0.8125rem] font-semibold text-ink-soft">{g}</td></tr>
              {features.filter((f) => f.group === g).map((f) => <tr key={f.key}><td className={`${td} w-[38%]`}>{f.name}</td><td className={td}>{featureText(f)}</td></tr>)}
            </tbody>
          ))}
        </table>
      )}
      {(d.addOns?.length ?? 0) > 0 && (
        <table className="w-full text-[0.875rem]">
          <thead><tr><th className={th}>Add-on</th><th className={th}>Price</th></tr></thead>
          <tbody>{d.addOns!.map((a, i) => <tr key={i}><td className={td}>{a.name}{a.description && <span className="block text-[0.75rem] text-muted">{a.description}</span>}</td><td className={td}>{a.priceType === 'PERCENT' ? `${a.value}% of premium` : rupee(a.value)}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}