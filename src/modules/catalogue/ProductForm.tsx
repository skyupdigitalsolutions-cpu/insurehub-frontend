import type { ProductData, TplFeature } from '../../api/catalogue';
import { Button } from '../../ui/Button';
import { Field, inputClass } from '../../ui/form';

/** Screen state of a product version's values: everything as typed text until saved. */
export interface FormState {
  name: string; description: string; uin: string; launchDate: string; adultMin: string; adultMax: string; coversChildren: boolean;
  childMin: string; childMax: string; siOptions: string; siMin: string; siMax: string; policyTerms: string; pricingMode: string; taxPercent: string;
  nomineeRequired: boolean; maxNominees: string; gracePeriodDays: string; sourceLink: string; sourceCheckedOn: string;
  features: Record<string, { value: string; page: string; notStated: boolean }>;
  addOns: Array<{ name: string; description: string; priceType: 'FIXED' | 'PERCENT'; value: string }>;
}

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const dmy = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : s(iso));
const nums = (t: string) => t.split(',').map((x) => x.replace(/[₹\s,]/g, '').trim()).filter(Boolean).map(Number);
const opt = (t: string) => (t.trim() === '' ? undefined : t.trim());
const optNum = (t: string) => (t.trim() === '' ? undefined : Number(t.replace(/[₹,\s]/g, '')));

export function toForm(d: ProductData = {}): FormState {
  return {
    name: s(d.name), description: s(d.description), uin: s(d.uin), launchDate: dmy(d.launchDate), adultMin: s(d.adultMin), adultMax: s(d.adultMax),
    coversChildren: !!d.coversChildren, childMin: s(d.childMin), childMax: s(d.childMax),
    siOptions: (d.sumInsured?.options ?? []).join(', '), siMin: s(d.sumInsured?.min), siMax: s(d.sumInsured?.max), policyTerms: (d.policyTerms ?? []).join(', '),
    pricingMode: s(d.pricingMode), taxPercent: s(d.taxPercent), nomineeRequired: d.nomineeRequired ?? true, maxNominees: s(d.maxNominees), gracePeriodDays: s(d.gracePeriodDays),
    sourceLink: s(d.sourceLink), sourceCheckedOn: dmy(d.sourceCheckedOn),
    features: Object.fromEntries(Object.entries(d.features ?? {}).map(([k, v]) => [k, { value: v.value === undefined || v.value === null ? '' : String(v.value), page: s(v.page), notStated: !!v.notStated }])),
    addOns: (d.addOns ?? []).map((a) => ({ name: a.name, description: s(a.description), priceType: a.priceType, value: s(a.value) })),
  };
}

/** Typed values for the API: numbers as numbers, Yes/No as true/false, empty fields left out. */
export function toData(f: FormState, features: TplFeature[]): ProductData {
  const typeOf = new Map(features.map((x) => [x.key, x.dataType]));
  return {
    name: opt(f.name), description: opt(f.description) ?? null, uin: opt(f.uin), launchDate: opt(f.launchDate),
    adultMin: optNum(f.adultMin), adultMax: optNum(f.adultMax), coversChildren: f.coversChildren,
    childMin: f.coversChildren ? optNum(f.childMin) ?? null : null, childMax: f.coversChildren ? optNum(f.childMax) ?? null : null,
    sumInsured: { options: nums(f.siOptions), min: optNum(f.siMin) ?? null, max: optNum(f.siMax) ?? null },
    policyTerms: nums(f.policyTerms),
    pricingMode: (opt(f.pricingMode) as ProductData['pricingMode']) ?? undefined, taxPercent: optNum(f.taxPercent),
    nomineeRequired: f.nomineeRequired, maxNominees: optNum(f.maxNominees), gracePeriodDays: optNum(f.gracePeriodDays) ?? null,
    sourceLink: opt(f.sourceLink) ?? null, sourceCheckedOn: opt(f.sourceCheckedOn) ?? null,
    features: Object.fromEntries(Object.entries(f.features).filter(([, v]) => v.notStated || v.value.trim() !== '').map(([k, v]) => {
      const t = typeOf.get(k) ?? 'Text';
      const value = v.notStated ? null : t === 'Yes/No' ? v.value === 'Yes' : t === 'Text' ? v.value : Number(v.value.replace(/[₹,\s]/g, ''));
      return [k, { value, page: optNum(v.page) ?? null, ...(v.notStated ? { notStated: true } : {}) }];
    })),
    addOns: f.addOns.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), description: opt(a.description) ?? null, priceType: a.priceType, value: Number(a.value || 0) })),
  };
}

const td = 'border-b border-rule py-1.5 pr-2 align-top';

/** The P-22 product form. Feature rows come from the type's template; required-to-publish ones are marked. */
export function ProductForm({ f, set, features, kind, errors, disabled }: {
  f: FormState; set: (f: FormState) => void; features: TplFeature[]; kind: 'VERIFIED' | 'OWN'; errors: Record<string, string>; disabled?: boolean;
}) {
  const text = (k: keyof FormState, label: string, hint?: string, req?: boolean) => (
    <Field label={label} required={req} error={errors[k as string]} hint={hint}><input className={inputClass} disabled={disabled} value={f[k] as string} onChange={(e) => set({ ...f, [k]: e.target.value })} /></Field>
  );
  const feat = (k: string) => f.features[k] ?? { value: '', page: '', notStated: false };
  const setFeat = (k: string, v: Partial<{ value: string; page: string; notStated: boolean }>) => set({ ...f, features: { ...f.features, [k]: { ...feat(k), ...v } } });
  const groups = [...new Set(features.map((x) => x.group))];
  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-1 font-semibold">Identity and lifecycle</legend>
        {text('name', 'Product name', undefined, true)}{text('description', 'Short description')}
        {text('uin', 'IRDAI product UIN', 'Exactly as printed on the brochure', true)}{text('launchDate', 'Launch date', 'DD-MM-YYYY', true)}
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-4"><legend className="mb-1 font-semibold">Eligibility</legend>
        {text('adultMin', 'Adult entry age from', undefined, true)}{text('adultMax', 'Adult entry age to', undefined, true)}
        <label className="flex items-center gap-2 self-end pb-2 text-[0.875rem]"><input type="checkbox" disabled={disabled} checked={f.coversChildren} onChange={(e) => set({ ...f, coversChildren: e.target.checked })} /> Covers children</label>
        <span />
        {f.coversChildren && <>{text('childMin', 'Child entry age from', 'Blank = 0')}{text('childMax', 'Child entry age to', 'Blank = 25')}</>}
        <div className="sm:col-span-2">{text('siOptions', 'Sum insured options (₹)', '500000, 1000000 — or use a range')}</div>
        {text('siMin', 'Or range from (₹)')}{text('siMax', 'Range to (₹)')}
        <div className="sm:col-span-2">{text('policyTerms', 'Policy terms (years)', '1, 2, 3', true)}</div>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-4"><legend className="mb-1 font-semibold">Pricing, nominees, renewal</legend>
        <Field label="Pricing mode" required error={errors.pricingMode}>
          <select className={inputClass} disabled={disabled} value={f.pricingMode} onChange={(e) => set({ ...f, pricingMode: e.target.value })}>
            <option value="">Choose…</option><option value="MANUAL_ENTRY">Manual entry (insurer portal)</option><option value="RATE_TABLE">Rate table</option>
          </select>
        </Field>
        {text('taxPercent', 'Tax %', undefined, true)}{text('maxNominees', 'Most nominees')}{text('gracePeriodDays', 'Grace period (days)', 'Blank = 30')}
        <label className="flex items-center gap-2 text-[0.875rem]"><input type="checkbox" disabled={disabled} checked={f.nomineeRequired} onChange={(e) => set({ ...f, nomineeRequired: e.target.checked })} /> Nominee required</label>
      </fieldset>
      {kind === 'VERIFIED' && (
        <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-1 font-semibold">Source</legend>
          {text('sourceLink', 'Insurer page link', 'https://…', true)}{text('sourceCheckedOn', 'Date checked', 'DD-MM-YYYY', true)}
        </fieldset>
      )}
      <fieldset><legend className="mb-1 font-semibold">Features</legend>
        {features.length === 0 && <p className="text-[0.875rem] text-muted">This type's template has no features.</p>}
        {groups.map((g) => (
          <div key={g} className="mb-3">
            <div className="mb-1 text-[0.75rem] font-semibold tracking-wide text-muted uppercase">{g}</div>
            <table className="w-full text-[0.875rem]"><tbody>
              {features.filter((x) => x.group === g).sort((a, b) => a.order - b.order).map((x) => {
                const v = feat(x.key);
                return (
                  <tr key={x.key}>
                    <td className={`${td} w-[38%]`}>{x.name}{x.requiredToPublish && <span className="text-bad"> *</span>}<div className="text-[0.75rem] text-muted">{x.dataType}{x.help ? ` · ${x.help}` : ''}</div></td>
                    <td className={td}>
                      {x.dataType === 'Yes/No'
                        ? <select className={inputClass} disabled={disabled || v.notStated} value={v.value} onChange={(e) => setFeat(x.key, { value: e.target.value })}><option value="">—</option><option>Yes</option><option>No</option></select>
                        : <input className={inputClass} disabled={disabled || v.notStated} value={v.value} onChange={(e) => setFeat(x.key, { value: e.target.value })} />}
                    </td>
                    <td className={`${td} w-[90px]`}><input className={inputClass} disabled={disabled} placeholder="Page" value={v.page} onChange={(e) => setFeat(x.key, { page: e.target.value })} /></td>
                    <td className={`${td} w-[170px] text-[0.8125rem]`}><label className="flex items-center gap-1.5"><input type="checkbox" disabled={disabled} checked={v.notStated} onChange={(e) => setFeat(x.key, { notStated: e.target.checked, ...(e.target.checked ? { value: '' } : {}) })} /> Not stated in source</label></td>
                  </tr>
                );
              })}
            </tbody></table>
          </div>
        ))}
      </fieldset>
      <fieldset><legend className="mb-1 font-semibold">Riders and add-ons</legend>
        {errors.addOns && <p className="mb-1 text-[0.8125rem] text-bad">{errors.addOns}</p>}
        {f.addOns.map((a, i) => (
          <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[2fr_2fr_1fr_1fr_auto]">
            <input className={inputClass} disabled={disabled} placeholder="Name" value={a.name} onChange={(e) => set({ ...f, addOns: f.addOns.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            <input className={inputClass} disabled={disabled} placeholder="Description" value={a.description} onChange={(e) => set({ ...f, addOns: f.addOns.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
            <select className={inputClass} disabled={disabled} value={a.priceType} onChange={(e) => set({ ...f, addOns: f.addOns.map((x, j) => (j === i ? { ...x, priceType: e.target.value as 'FIXED' | 'PERCENT' } : x)) })}><option value="FIXED">Fixed ₹</option><option value="PERCENT">% of base</option></select>
            <input className={inputClass} disabled={disabled} placeholder="Value" value={a.value} onChange={(e) => set({ ...f, addOns: f.addOns.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
            {!disabled && <Button variant="link" onClick={() => set({ ...f, addOns: f.addOns.filter((_, j) => j !== i) })}>Remove</Button>}
          </div>
        ))}
        {!disabled && <Button onClick={() => set({ ...f, addOns: [...f.addOns, { name: '', description: '', priceType: 'FIXED', value: '' }] })}>+ Add-on</Button>}
      </fieldset>
    </div>
  );
}