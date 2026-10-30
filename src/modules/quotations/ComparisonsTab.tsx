import { useCallback, useEffect, useState } from 'react';
import { errorText, fieldErrors } from '../../api/client';
import { customersApi, type CustomerSummary } from '../../api/customers';
import { fileUrl } from '../../api/profile';
import { comparisonsApi, quotationsApi, type CmpTable, type ComparisonView, type QInputs } from '../../api/quotations';
import { Button } from '../../ui/Button';
import { Field, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';

const th = 'border-b border-rule py-2 pr-3 text-left text-[0.8125rem] font-semibold text-muted';
const td = 'border-b border-rule py-2 pr-3 align-top';
const rs = (n?: number | null) => (n === null || n === undefined ? '—' : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const show = (v: unknown) => (typeof v === 'number' ? rs(v) : String(v ?? '—'));

/** The side-by-side table (P-30 step 6), shared by the editor, the detail and the customer's page. */
export function ComparisonTable({ t, recommended, reason }: { t: CmpTable; recommended?: string | null; reason?: string | null }) {
  return (
    <div className="overflow-x-auto"><table className="w-full text-[0.875rem]">
      <thead><tr><th className={th} />{t.columns.map((c) => <th key={c.productId} className={th}>{c.name}{c.productId === recommended && <div className="font-semibold text-ok">Recommended</div>}<div className="font-normal">{c.insurer} · UIN {c.uin}</div></th>)}</tr></thead>
      <tbody>
        <tr><td className={td}>Agent code</td>{t.columns.map((c) => <td key={c.productId} className={td}>{c.agentCode ?? '—'}</td>)}</tr>
        <tr><td className={`${td} font-semibold`}>Annual premium</td>{t.columns.map((c) => <td key={c.productId} className={td}>{c.error ? <span className="text-bad">{c.error.message}</span> : <><span className="font-semibold">{rs(c.premium)}</span>{c.lowest && <span className="ml-2 rounded bg-ok-tint px-1.5 text-[0.75rem] text-ok">lowest</span>}<div className="text-[0.75rem] text-muted">base {rs(c.breakdown?.base)} + tax {rs(c.breakdown?.tax)}</div></>}</td>)}</tr>
        <tr><td className={td}>Members covered</td>{t.columns.map((c) => <td key={c.productId} className={td}>{c.coverage ? <span className="text-warn">{c.coverage.message}</span> : c.error ? '—' : `All ${c.of}`}</td>)}</tr>
        {t.rows.map((r) => <tr key={r.label}><td className={td}>{r.label}</td>{r.values.map((v, i) => <td key={i} className={td}>{show(v)}</td>)}</tr>)}
      </tbody>
    </table>
    {recommended && reason && <p className="mt-2 text-[0.875rem]"><strong>Why we recommend {t.columns.find((c) => c.productId === recommended)?.name}:</strong> {reason}</p>}</div>
  );
}

function Editor({ start, onDone }: { start: ComparisonView; onDone: (c: ComparisonView, m?: string) => void }) {
  const [c, setC] = useState(start);
  const [i, setI] = useState<QInputs>(start.inputs ?? {});
  const [picked, setPicked] = useState<string[]>(start.options.map((o) => o.productId));
  const [rec, setRec] = useState<string | null>(start.recommendedProductId);
  const [reason, setReason] = useState(start.recommendedReason ?? '');
  const [types, setTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; insurer: string; sumInsured: { options?: number[] }; policyTerms: number[] }>>([]);
  const [people, setPeople] = useState<Array<{ key: string; name: string; relationship: string }>>([]);
  const [table, setTable] = useState<CmpTable | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { quotationsApi.choices().then((ch) => setTypes(ch.types), () => undefined); customersApi.get(c.customerId).then((cu) => setPeople([{ key: `C:${cu.id}`, name: cu.name, relationship: 'Self' }, ...cu.family.filter((f) => f.status === 'ACTIVE').map((f) => ({ key: `F:${f.id}`, name: f.name, relationship: f.relationship }))]), () => undefined); }, [c.customerId]);
  useEffect(() => {
    if (!i.typeId) return;
    void (async () => {
      const ch = await quotationsApi.choices();
      const all = [];
      for (const ins of ch.insurers) all.push(...(await quotationsApi.choices(i.typeId, ins.id)).products.map((p) => ({ ...p, insurer: ins.name })));
      setProducts(all);
    })();
  }, [i.typeId]);
  const opts = products.find((p) => picked.includes(p.id)) ?? products[0];
  async function save() { const u = await comparisonsApi.save(c.id, { version: c.version, inputs: i, options: picked.map((productId) => ({ productId })), recommendedProductId: rec, recommendedReason: reason || null }); setC(u); return u; }
  async function run(fn: () => Promise<void>) { setErrors({}); setError(null); try { await fn(); } catch (e) { setErrors(fieldErrors(e)); setError(errorText(e)); } }
  return (
    <section className="mb-6 rounded border border-rule bg-sheet p-4 text-[0.875rem]">
      <h3 className="mb-3 font-semibold">New comparison: the same details for every product</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Insurance type" required><select className={inputClass} value={i.typeId ?? ''} onChange={(e) => { setI({ ...i, typeId: e.target.value }); setPicked([]); }}><option value="">Choose…</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="Sum insured" required><select className={inputClass} value={i.sumInsured ?? ''} onChange={(e) => setI({ ...i, sumInsured: Number(e.target.value) })}><option value="">Choose…</option>{[...new Set(products.flatMap((p) => p.sumInsured.options ?? []))].sort((a, b) => a - b).map((s) => <option key={s} value={s}>₹{s.toLocaleString('en-IN')}</option>)}</select></Field>
        <Field label="Policy term" required><select className={inputClass} value={i.policyTerm ?? ''} onChange={(e) => setI({ ...i, policyTerm: Number(e.target.value) })}><option value="">Choose…</option>{(opts?.policyTerms ?? []).map((t) => <option key={t} value={t}>{t} year(s)</option>)}</select></Field>
        <Field label="Planned start date" required hint="DD-MM-YYYY"><input className={inputClass} value={i.startDate ?? ''} onChange={(e) => setI({ ...i, startDate: e.target.value })} /></Field>
      </div>
      <fieldset className="mt-3"><legend className="mb-1 font-medium">People to cover</legend>{people.map((p) => <label key={p.key} className="mr-4 inline-flex items-center gap-1.5"><input type="checkbox" checked={(i.people ?? []).includes(p.key)} onChange={(e) => setI({ ...i, people: e.target.checked ? [...(i.people ?? []), p.key] : (i.people ?? []).filter((k) => k !== p.key) })} />{p.name} <span className="text-muted">({p.relationship})</span></label>)}</fieldset>
      <fieldset className="mt-3"><legend className="mb-1 font-medium">Products (2 to 3)</legend>{products.map((p) => <label key={p.id} className="mr-4 inline-flex items-center gap-1.5"><input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />{p.name} <span className="text-muted">({p.insurer})</span></label>)}{errors.options && <p className="text-bad">{errors.options}</p>}</fieldset>
      <div className="mt-3 flex gap-2"><Button onClick={() => void run(async () => { const u = await save(); setTable(await comparisonsApi.preview(u.id)); })}>Preview</Button></div>
      {table && <div className="mt-4"><ComparisonTable t={table} />
        <div className="mt-3 grid gap-3 sm:grid-cols-[260px_1fr]">
          <Field label="Recommended option (optional)"><select className={inputClass} value={rec ?? ''} onChange={(e) => setRec(e.target.value || null)}><option value="">None</option>{table.columns.map((x) => <option key={x.productId} value={x.productId}>{x.name}</option>)}</select></Field>
          {rec && <Field label="Reason (printed under the recommended column)" required error={errors.recommendedReason}><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
        </div>
        <div className="mt-3"><Button variant="primary" onClick={() => void run(async () => { const u = await save(); const r = await comparisonsApi.generate(u.id); onDone(r.data, r.meta.message); })}>Generate</Button></div></div>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}

function Detail({ start, onQuotation }: { start: ComparisonView; onQuotation: (m: string) => void }) {
  const [c, setC] = useState(start);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState('');
  async function run(fn: () => Promise<void>) { setError(null); try { await fn(); } catch (e) { setError(errorText(e)); } }
  return (
    <section className="mb-6 rounded border border-rule bg-sheet p-4 text-[0.875rem]">
      <div className="mb-3 flex flex-wrap items-baseline gap-3"><h3 className="font-mono font-semibold">{c.number}</h3><span className="font-medium">{c.status}</span>{c.validUntil && <span className="text-muted">valid until {c.validUntil.split('-').reverse().join('-')}</span>}{c.viewed > 0 && <span className="text-muted">viewed {c.viewed}×</span>}{c.pdfFileId && <a className="underline" href={fileUrl(c.pdfFileId)} target="_blank" rel="noreferrer">PDF</a>}</div>
      {c.snapshot && <ComparisonTable t={c.snapshot} recommended={c.recommendedProductId} reason={c.recommendedReason} />}
      {['READY', 'SHARED', 'PRODUCT_CHOSEN'].includes(c.status) && <div className="mt-3 flex flex-wrap gap-2"><span className="self-center font-medium">Share:</span>
        {(['EMAIL', 'WHATSAPP', 'LINK', 'DOWNLOAD'] as const).map((ch) => <Button key={ch} onClick={() => void run(async () => { const r = await comparisonsApi.share(c.id, ch); setC(r.comparison); if (ch === 'WHATSAPP' && r.whatsappUrl) window.open(r.whatsappUrl, '_blank'); if (ch === 'LINK') { await navigator.clipboard?.writeText(r.link).catch(() => undefined); setMessage(`Copied. ${r.link}`); } if (ch === 'DOWNLOAD' && r.pdfFileId) window.open(fileUrl(r.pdfFileId), '_blank'); })}>{ch === 'LINK' ? 'Copy link' : ch === 'DOWNLOAD' ? 'Download PDF' : ch === 'EMAIL' ? 'Email' : 'WhatsApp'}</Button>)}</div>}
      {['READY', 'SHARED', 'PRODUCT_CHOSEN'].includes(c.status) && <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className={`${inputClass} max-w-[260px]`} value={choice} onChange={(e) => setChoice(e.target.value)}><option value="">Customer chose…</option>{c.snapshot?.columns.map((x) => <option key={x.productId} value={x.productId}>{x.name}</option>)}</select>
        <Button disabled={!choice} onClick={() => void run(async () => { const r = await comparisonsApi.choose(c.id, c.version, choice); setC(r.data); setMessage(r.meta.message ?? null); })}>Customer chose this</Button>
        {c.status === 'PRODUCT_CHOSEN' && <Button variant="primary" onClick={() => void run(async () => { await comparisonsApi.createQuotation(c.id); onQuotation('Quotation draft created with the chosen product. Open it in the Quotations tab; the premium is calculated there.'); })}>Create quotation</Button>}
      </div>}
      {message && <div className="mt-3"><Notice>{message}</Notice></div>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}

/** Quotations → Comparisons (P-30). */
export function ComparisonsTab({ onQuotation }: { onQuotation: (m: string) => void }) {
  const [rows, setRows] = useState<ComparisonView[] | null>(null);
  const [open, setOpen] = useState<ComparisonView | null>(null);
  const [customers, setCustomers] = useState<CustomerSummary[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { comparisonsApi.list().then(setRows, (e) => setError(errorText(e))); }, []);
  useEffect(load, [load]);
  return (
    <>
      <div className="mb-4"><Button variant="primary" onClick={() => customersApi.list({ status: 'ACTIVE', limit: 100 }).then((r) => setCustomers(r.data), () => undefined)}>+ Comparison</Button></div>
      {customers && <div className="mb-4 max-w-[480px]"><Field label="Customer"><select className={inputClass} defaultValue="" onChange={(e) => e.target.value && comparisonsApi.start(e.target.value).then((c) => { setOpen(c); setCustomers(null); load(); }, (er) => setError(errorText(er)))}><option value="">Choose…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.number})</option>)}</select></Field></div>}
      {message && <div className="mb-4"><Notice>{message}</Notice></div>}
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {open && open.status === 'DRAFT' && <Editor key={open.id} start={open} onDone={(c, m) => { setOpen(c); setMessage(m ?? null); load(); }} />}
      {open && open.status !== 'DRAFT' && <Detail key={open.id} start={open} onQuotation={(m) => { setMessage(m); onQuotation(m); }} />}
      {!rows ? <p className="text-muted">Loading…</p> : rows.length === 0 ? <p className="text-muted">No comparisons yet.</p> : (
        <table className="w-full text-[0.875rem]"><thead><tr><th className={th}>Comparison</th><th className={th}>Status</th><th className={th}>Products</th><th className={th} /></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td className={td}>{r.number ? <span className="font-mono">{r.number}</span> : <span className="text-muted">Draft</span>}</td><td className={td}>{r.status}</td><td className={td}>{r.options.length}</td><td className={td}><Button onClick={() => setOpen(r)}>Open</Button></td></tr>)}</tbody></table>
      )}
    </>
  );
}