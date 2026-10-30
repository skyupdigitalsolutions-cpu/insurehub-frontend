import { useCallback, useEffect, useState } from 'react';
import { errorText, fieldErrors } from '../../api/client';
import { customersApi, type CustomerSummary } from '../../api/customers';
import { fileUrl } from '../../api/profile';
import { quotationsApi, type Breakdown, type Choices, type QInputs, type QuotationView } from '../../api/quotations';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../ui/Button';
import { Field, fmtDateTime, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';
import { QuotationDetail } from './QuotationDetail';
import { ComparisonsTab } from './ComparisonsTab';
import { Tabs } from '../../ui/form';

const STEPS = ['Customer', 'Quotation type', 'Insurance type', 'Insurer', 'Product', 'Details', 'Riders', 'Premium', 'Discount', 'Review'];
const th = 'border-b border-rule py-2 pr-3 text-left text-[0.8125rem] font-semibold text-muted';
const td = 'border-b border-rule py-2 pr-3 align-top';
const rs = (n?: number | null) => (n === null || n === undefined ? '—' : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const dmy = (iso?: string) => (iso && /^\d{4}-/.test(iso) ? iso.split('-').reverse().join('-') : iso ?? '');

function BreakdownTable({ b }: { b: Breakdown }) {
  return (
    <table className="w-full max-w-[460px] text-[0.875rem]"><tbody>
      <tr><td className={td}>Base premium</td><td className={`${td} text-right`}>{rs(b.base)}</td></tr>
      {b.riders.map((r) => <tr key={r.name}><td className={td}>{r.name}</td><td className={`${td} text-right`}>{rs(r.amount)}</td></tr>)}
      {b.override !== null && <tr><td className={td}>Premium used (override; calculated {rs(b.calculated)})</td><td className={`${td} text-right`}>{rs(b.override)}</td></tr>}
      {b.discount > 0 && <tr><td className={td}>Discount</td><td className={`${td} text-right`}>− {rs(b.discount)}</td></tr>}
      <tr><td className={td}>Tax{b.taxPercent !== null ? ` (${b.taxPercent}%)` : ''}</td><td className={`${td} text-right`}>{rs(b.tax)}</td></tr>
      <tr><td className={`${td} font-bold`}>Total payable</td><td className={`${td} text-right font-bold`}>{rs(b.final)}</td></tr>
    </tbody></table>
  );
}

/** The P-27 wizard: each Next saves the draft; the server checks every earlier step. */
function Wizard({ start, onDone }: { start: QuotationView; onDone: (q: QuotationView, m?: string) => void }) {
  const { can } = useAuth();
  const pricing = can('quotations.pricing');
  const [q, setQ] = useState(start);
  const [i, setI] = useState<QInputs>(start.inputs ?? {});
  const [ch, setCh] = useState<Choices | null>(null);
  const [people, setPeople] = useState<Array<{ key: string; name: string; relationship: string }>>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { quotationsApi.choices(i.typeId, i.insurerId).then(setCh, (e) => setError(errorText(e))); }, [i.typeId, i.insurerId]);
  useEffect(() => {
    customersApi.get(q.customerId).then((cu) => setPeople([{ key: `C:${cu.id}`, name: cu.name, relationship: 'Self' }, ...cu.family.filter((f) => f.status === 'ACTIVE').map((f) => ({ key: `F:${f.id}`, name: f.name, relationship: f.relationship }))]), () => undefined);
  }, [q.customerId]);
  const product = ch?.products.find((p) => p.id === i.productId);
  const step = q.step;
  async function go(to: number) {
    setBusy(true); setErrors({}); setError(null); setNote(null);
    try {
      setQ(await quotationsApi.save(q.id, q.version, to, i));
    } catch (e) {
      setErrors(fieldErrors(e)); setError(errorText(e));
      try { setQ(await quotationsApi.get(q.id)); } catch { /* keep */ }
    } finally { setBusy(false); }
  }
  async function calc() {
    setBusy(true); setErrors({}); setError(null);
    try {
      const saved = await quotationsApi.save(q.id, q.version, 8, i);
      const r = await quotationsApi.calculate(saved.id);
      setQ(r.data);
      const w = (r.meta as { warnings?: Array<{ message: string }> }).warnings;
      setNote(w?.length ? w.map((x) => x.message).join(' ') : null);
    } catch (e) { setErrors(fieldErrors(e)); setError(errorText(e)); }
    finally { setBusy(false); }
  }
  async function generate() {
    setBusy(true); setError(null);
    try {
      const saved = await quotationsApi.save(q.id, q.version, 10, i);
      setQ(saved);
      const r = await quotationsApi.generate(saved.id);
      onDone(r.data, r.meta.message);
    } catch (e) {
      const d = (e as { details?: { old?: number | null; new?: number } }).details;
      setError(d?.new !== undefined ? `${errorText(e)} Before: ${rs(d.old)}, now: ${rs(d.new)}.` : errorText(e));
      try { setQ(await quotationsApi.get(q.id)); } catch { /* keep */ }
    } finally { setBusy(false); }
  }
  const set = (patch: Partial<QInputs>) => setI({ ...i, ...patch });
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(/[₹,\s]/g, '')));
  return (
    <section className="mb-6 rounded border border-rule bg-sheet p-4 text-[0.875rem]">
      <ol className="mb-4 flex flex-wrap gap-1">{STEPS.map((s, n) => <li key={s} className={`rounded px-2 py-1 text-[0.75rem] ${n + 1 === step ? 'bg-ink text-white' : n + 1 < step ? 'bg-ok-tint text-ok' : 'bg-rule text-muted'}`}>{n + 1} {s}</li>)}</ol>
      {step <= 2 && <><p className="mb-2">Single quotation for one product. Comparisons arrive in Stage 3.</p><Button variant="primary" disabled={busy} onClick={() => void go(3)}>Next</Button></>}
      {step === 3 && <><Field label="Insurance type" required error={errors.typeId}><select className={inputClass} value={i.typeId ?? ''} onChange={(e) => set({ typeId: e.target.value, productId: undefined })}><option value="">Choose…</option>{ch?.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        {ch && ch.types.length === 0 && <p className="mt-1 text-muted">No authorised categories yet: add them in your profile.</p>}</>}
      {step === 4 && <Field label="Insurer (with your active agent code)" required error={errors.insurerId}><select className={inputClass} value={i.insurerId ?? ''} onChange={(e) => set({ insurerId: e.target.value, productId: undefined })}><option value="">Choose…</option>{ch?.insurers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>}
      {step === 5 && <Field label="Product" required error={errors.productId}><select className={inputClass} value={i.productId ?? ''} onChange={(e) => set({ productId: e.target.value, riders: [] })}><option value="">Choose…</option>{ch?.products.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.pricingMode === 'RATE_TABLE' ? 'rate table' : 'manual entry'})</option>)}</select></Field>}
      {step === 6 && product && (
        <div className="grid gap-3">
          <fieldset><legend className="mb-1 font-medium">People to insure <span className="text-bad">*</span></legend>
            {people.map((p) => <label key={p.key} className="mr-4 inline-flex items-center gap-1.5"><input type="checkbox" checked={(i.people ?? []).includes(p.key)} onChange={(e) => set({ people: e.target.checked ? [...(i.people ?? []), p.key] : (i.people ?? []).filter((k) => k !== p.key) })} />{p.name} <span className="text-muted">({p.relationship})</span></label>)}
            {errors.people && <p className="text-bad">{errors.people}</p>}</fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Sum insured" required error={errors.sumInsured}>{product.sumInsured.options?.length
              ? <select className={inputClass} value={i.sumInsured ?? ''} onChange={(e) => set({ sumInsured: Number(e.target.value) })}><option value="">Choose…</option>{product.sumInsured.options.map((s) => <option key={s} value={s}>₹{s.toLocaleString('en-IN')}</option>)}</select>
              : <input className={inputClass} value={i.sumInsured ?? ''} onChange={(e) => set({ sumInsured: num(e.target.value) })} />}</Field>
            <Field label="Policy term" required error={errors.policyTerm}><select className={inputClass} value={i.policyTerm ?? ''} onChange={(e) => set({ policyTerm: Number(e.target.value) })}><option value="">Choose…</option>{product.policyTerms.map((t) => <option key={t} value={t}>{t} year{t === 1 ? '' : 's'}</option>)}</select></Field>
            <Field label="Planned start date" required error={errors.startDate} hint="DD-MM-YYYY"><input className={inputClass} value={dmy(i.startDate)} onChange={(e) => set({ startDate: e.target.value })} /></Field>
          </div>
          {product.questions.map((qn) => (
            <Field key={qn.key} label={qn.label} required={qn.required} error={errors[`answers.${qn.key}`]}>{qn.dataType === 'Yes/No'
              ? <select className={inputClass} value={i.answers?.[qn.key] === undefined ? '' : String(i.answers[qn.key])} onChange={(e) => set({ answers: { ...i.answers, [qn.key]: e.target.value === 'true' } })}><option value="">Choose…</option><option value="true">Yes</option><option value="false">No</option></select>
              : <input className={inputClass} value={String(i.answers?.[qn.key] ?? '')} onChange={(e) => set({ answers: { ...i.answers, [qn.key]: e.target.value } })} />}</Field>
          ))}
        </div>
      )}
      {step === 7 && product && (product.addOns.length === 0 ? <p className="text-muted">This product has no riders.</p> : product.addOns.map((a) => (
        <label key={a.name} className="mb-1 flex items-center gap-2"><input type="checkbox" checked={(i.riders ?? []).includes(a.name)} onChange={(e) => set({ riders: e.target.checked ? [...(i.riders ?? []), a.name] : (i.riders ?? []).filter((x) => x !== a.name) })} />{a.name} <span className="text-muted">({a.priceType === 'FIXED' ? `₹${a.value}` : `${a.value}% of base`})</span></label>
      )))}
      {step === 8 && product && (
        <div className="grid gap-3">
          {product.pricingMode === 'MANUAL_ENTRY' && <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Net premium from the insurer portal (₹)" required error={errors['manual.netPremium']}><input className={inputClass} value={i.manual?.netPremium ?? ''} onChange={(e) => set({ manual: { ...i.manual, netPremium: num(e.target.value) } })} /></Field>
            <Field label="Tax amount from the insurer portal (₹)" required error={errors['manual.taxAmount']}><input className={inputClass} value={i.manual?.taxAmount ?? ''} onChange={(e) => set({ manual: { ...i.manual, taxAmount: num(e.target.value) } })} /></Field>
          </div>}
          {pricing && product.pricingMode === 'RATE_TABLE' && <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Price override (₹, optional)" error={errors.override}><input className={inputClass} value={i.override?.amount ?? ''} onChange={(e) => set({ override: num(e.target.value) === undefined ? null : { amount: num(e.target.value)!, reason: i.override?.reason ?? '' } })} /></Field>
            {i.override && <Field label="Override reason" required error={errors['override.reason']}><input className={inputClass} value={i.override.reason} onChange={(e) => set({ override: { ...i.override!, reason: e.target.value } })} /></Field>}
          </div>}
          <div><Button disabled={busy} onClick={() => void calc()}>Calculate premium</Button></div>
          {errors.premium && <Notice tone="error">{errors.premium}</Notice>}
          {q.calc && <BreakdownTable b={q.calc.breakdown} />}
        </div>
      )}
      {step === 9 && (pricing ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Discount" error={errors.discount}><select className={inputClass} value={i.discount?.kind ?? ''} onChange={(e) => set({ discount: e.target.value ? { kind: e.target.value as 'AMOUNT' | 'PERCENT', value: i.discount?.value ?? 0, reference: i.discount?.reference ?? '' } : null })}><option value="">No discount</option><option value="AMOUNT">Amount (₹)</option><option value="PERCENT">Percent</option></select></Field>
          {i.discount && <><Field label="Value"><input className={inputClass} value={i.discount.value || ''} onChange={(e) => set({ discount: { ...i.discount!, value: Number(e.target.value || 0) } })} /></Field>
            <Field label="Reference" required><input className={inputClass} value={i.discount.reference} onChange={(e) => set({ discount: { ...i.discount!, reference: e.target.value } })} /></Field></>}
          <div className="sm:col-span-3"><Button disabled={busy} onClick={() => void calc().then(() => go(9))}>Recalculate</Button></div>
          {q.calc && <div className="sm:col-span-3"><BreakdownTable b={q.calc.breakdown} /></div>}
        </div>
      ) : <p className="text-muted">Discounts are set by the advisor.</p>)}
      {step === 10 && (
        <div>
          <p className="mb-2">Product: <strong>{product?.name}</strong> · Sum insured {rs(i.sumInsured)} · {i.policyTerm} year(s) · start {dmy(i.startDate)}</p>
          {q.calc ? <BreakdownTable b={q.calc.breakdown} /> : <Notice tone="warn">Calculate the premium first (step 8).</Notice>}
          <p className="mt-3 max-w-[70ch] text-[0.8125rem] text-muted">This quotation is based on the details you shared and the insurer's published rates on the calculation date. The insurer decides the final premium and whether to accept the proposal. Please read the policy wording before you buy.</p>
          <div className="mt-3"><Button variant="primary" disabled={busy || !q.calc} onClick={() => void generate()}>Generate</Button></div>
        </div>
      )}
      {note && <div className="mt-3"><Notice tone="warn">{note}</Notice></div>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      {step >= 3 && (
        <div className="mt-4 flex gap-2">
          <Button disabled={busy} onClick={() => setQ({ ...q, step: step - 1 })}>Back</Button>
          {step < 10 && step !== 8 && <Button variant="primary" disabled={busy} onClick={() => void go(step + 1)}>Next</Button>}
          {step === 8 && <Button variant="primary" disabled={busy || !q.calc} onClick={() => void go(9)}>Next</Button>}
        </div>
      )}
    </section>
  );
}

export function QuotationsModule() {
  const [rows, setRows] = useState<QuotationView[] | null>(null);
  const [open, setOpen] = useState<QuotationView | null>(null);
  const [picking, setPicking] = useState(false);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'quotations' | 'comparisons'>('quotations');
  const load = useCallback(() => { quotationsApi.list().then(setRows, (e) => setError(errorText(e))); }, []);
  useEffect(load, [load]);
  async function begin(customerId: string) {
    setError(null);
    try { setOpen(await quotationsApi.start(customerId)); setPicking(false); load(); } catch (e) { setError(errorText(e)); }
  }
  return (
    <main className="overflow-y-auto px-[clamp(20px,4vw,56px)] pt-7 pb-16">
      <header className="mb-5 max-w-[68ch]">
        <h1 className="text-[1.9rem] leading-tight font-bold tracking-[-0.01em]">Quotations and comparisons</h1>
        <p className="mt-2 text-ink-soft">P-27. Ten steps; each Next saves the draft. The server prices it (base → riders → override → discount → GST, rounded once) and checks everything again on Generate.</p>
      </header>
      <Tabs tabs={[['quotations', 'Quotations'], ['comparisons', 'Comparisons']]} active={tab} onChange={setTab} />
      {tab === 'comparisons' && <ComparisonsTab onQuotation={() => load()} />}
      {tab === 'quotations' && <>
      <div className="mb-4 flex gap-2"><Button variant="primary" onClick={() => { setPicking(true); customersApi.list({ status: 'ACTIVE', limit: 100 }).then((r) => setCustomers(r.data), () => undefined); }}>+ Quotation</Button></div>
      {picking && (
        <div className="mb-4 max-w-[480px]"><Field label="Customer (step 1)"><select className={inputClass} defaultValue="" onChange={(e) => e.target.value && void begin(e.target.value)}><option value="">Choose…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.number})</option>)}</select></Field></div>
      )}
      {message && <div className="mb-4"><Notice>{message}</Notice></div>}
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {open && open.status === 'DRAFT' && <Wizard key={`${open.id}-${open.version}`} start={open} onDone={(q, m) => { setOpen(q); setMessage(m ?? null); load(); }} />}
      {open && open.status !== 'DRAFT' && <QuotationDetail key={open.id} q={open} onChanged={(q) => { if (q?.status === 'DRAFT') setOpen(q); load(); }} />}
      {!rows ? <p className="text-muted">Loading…</p> : rows.length === 0 ? <p className="text-muted">No quotations yet.</p> : (
        <table className="w-full text-[0.875rem]">
          <thead><tr><th className={th}>Quotation</th><th className={th}>Status</th><th className={th}>Total</th><th className={th}>Updated</th><th className={th} /></tr></thead>
          <tbody>{rows.map((r) => {
            const last = r.revisions[r.revisions.length - 1];
            return (
              <tr key={r.id}>
                <td className={td}>{r.number ? <span className="font-mono">{r.number} R{last?.revision}</span> : <span className="text-muted">Draft (step {r.step})</span>}</td>
                <td className={td}>{r.status}</td><td className={td}>{rs(last?.final)}</td><td className={td}>{fmtDateTime(r.updatedAt)}</td>
                <td className={td}>{r.status === 'DRAFT' ? <Button onClick={() => setOpen(r)}>Continue</Button> : <><Button onClick={() => setOpen(r)}>Open</Button>{last?.pdfFileId && <a className="ml-2 underline" href={fileUrl(last.pdfFileId)} target="_blank" rel="noreferrer">PDF</a>}</>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
      </>}
    </main>
  );
}