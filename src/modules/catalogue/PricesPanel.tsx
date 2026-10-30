import { useCallback, useEffect, useState } from 'react';
import { errorText, fieldErrors } from '../../api/client';
import { pricesApi, type PriceCheck, type PriceRow, type PriceTemplate, type PriceVersionView } from '../../api/catalogue';
import { Button } from '../../ui/Button';
import { Field, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';
import { Pill } from './ProductsAdminTab';

const th = 'border-b border-rule py-1.5 pr-2 text-left text-[0.8125rem] font-semibold text-muted';
const td = 'border-b border-rule py-1.5 pr-2 align-top';
const dmy = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');

/** Save text as a file the browser downloads (template, error report). */
function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

/**
 * P-24 price versions. base '/products' = My prices (advisor, private); '/admin/products' = SkyUp's reference price.
 * No approval: a price from today is CURRENT at once, a later one SCHEDULED; the open one closes the day before.
 */
export function PricesPanel({ productId, base, title }: { productId: string; base: '/products' | '/admin/products'; title: string }) {
  const [rows, setRows] = useState<PriceVersionView[] | null>(null);
  const [tpl, setTpl] = useState<PriceTemplate | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ effectiveFrom: '', taxPercent: '18', sourceNote: '' });
  const [grid, setGrid] = useState<Array<Record<string, string>>>([]);
  const [csv, setCsv] = useState<string | null>(null);
  const [checked, setChecked] = useState<PriceCheck | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Array<{ row: number; problems: string[] }>>([]);
  const load = useCallback(async () => {
    try { setRows(await pricesApi.list(base, productId)); } catch (e) { setError(errorText(e)); setRows([]); }
  }, [base, productId]);
  useEffect(() => { void load(); }, [load]);
  async function start() {
    setAdding(true); setMessage(null); setWarn(null); setError(null); setChecked(null); setCsv(null); setReport([]);
    try {
      const t = await pricesApi.template(base, productId);
      setTpl(t);
      // one grid row per combination of the factors' bands and values
      let combos: Array<Record<string, string>> = [{}];
      for (const fa of t.factors) combos = combos.flatMap((c) => fa.choices.map((ch) => ({ ...c, [fa.key]: ch })));
      setGrid(combos.slice(0, 500).map((c) => ({ ...c, base_premium: '' })));
    } catch (e) { setError(errorText(e)); setAdding(false); }
  }
  const body = (): { rows?: PriceRow[]; csv?: string } => csv !== null ? { csv }
    : { rows: grid.filter((g) => (g.base_premium ?? '').trim() !== '').map((g) => ({ factors: Object.fromEntries(Object.entries(g).filter(([k]) => k !== 'base_premium')), basePremium: g.base_premium! })) };
  async function check() {
    setError(null); setReport([]);
    try { const r = await pricesApi.check(base, productId, body()); setChecked(r); setReport(r.errors); } catch (e) { setError(errorText(e)); }
  }
  async function copyReference() {
    setError(null);
    try {
      const ref = await pricesApi.reference(productId);
      if (!ref?.rows) { setError('SkyUp has no reference price for this product.'); return; }
      const byKey = new Map(ref.rows.map((r) => [JSON.stringify(r.factors), String(r.basePremium)]));
      setGrid(grid.map((g) => { const { base_premium: _b, ...fac } = g; return { ...g, base_premium: byKey.get(JSON.stringify(fac)) ?? g.base_premium ?? '' }; }));
      setF({ ...f, taxPercent: String(ref.taxPercent) }); setCsv(null);
    } catch (e) { setError(errorText(e)); }
  }
  async function save() {
    setErrors({}); setError(null); setReport([]);
    try {
      const r = await pricesApi.save(base, productId, { ...f, sourceNote: f.sourceNote || null, ...body() });
      setAdding(false); setMessage(r.meta.message ?? 'Price saved.');
      const w = (r.meta as { warnings?: Array<{ message: string }> }).warnings;
      setWarn(w?.length ? w.map((x) => x.message).join(' ') : null);
      void load();
    } catch (e) {
      setErrors(fieldErrors(e)); setError(errorText(e));
      const details = (e as { details?: { errors?: Array<{ row: number; problems: string[] }> } }).details;
      if (details?.errors) setReport(details.errors);
    }
  }
  async function cancel(p: PriceVersionView) {
    if (!window.confirm(`Cancel price ${p.name}, starting ${dmy(p.effectiveFrom)}?`)) return;
    try { const r = await pricesApi.cancel(base, productId, p.id); setMessage(r.meta.message ?? 'Cancelled.'); void load(); } catch (e) { setError(errorText(e)); }
  }
  return (
    <div className="mt-4 rounded border border-rule p-3 text-[0.875rem]">
      <div className="mb-2 flex flex-wrap items-center gap-3"><h4 className="font-semibold">{title}</h4><span className="flex-1" />{!adding && <Button onClick={() => void start()}>+ New price</Button>}</div>
      {message && <div className="mb-2"><Notice>{message}</Notice></div>}
      {warn && <div className="mb-2"><Notice tone="warn">{warn}</Notice></div>}
      {!rows ? <p className="text-muted">Loading…</p> : rows.length === 0 ? <p className="text-muted">No price yet.</p> : (
        <table className="mb-2 w-full"><thead><tr><th className={th}>Version</th><th className={th}>From</th><th className={th}>Until</th><th className={th}>Status</th><th className={th}>Rows</th><th className={th} /></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}><td className={td}>{p.name}</td><td className={td}>{dmy(p.effectiveFrom)}</td><td className={td}>{p.effectiveTo ? dmy(p.effectiveTo) : '—'}</td>
              <td className={td}><Pill s={p.status} /></td><td className={td}>{p.rowCount}</td>
              <td className={td}>{p.status === 'SCHEDULED' && <Button variant="link" onClick={() => void cancel(p)}>Cancel</Button>}</td></tr>
          ))}</tbody></table>
      )}
      {adding && tpl && (
        <div className="mt-3 rounded border border-rule bg-sheet p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Effective from" required error={errors.effectiveFrom} hint="DD-MM-YYYY, today or later"><input className={inputClass} value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} /></Field>
            <Field label="Tax %" required error={errors.taxPercent}><input className={inputClass} value={f.taxPercent} onChange={(e) => setF({ ...f, taxPercent: e.target.value })} /></Field>
            <Field label="Source note" error={errors.sourceNote} hint="For example: insurer rate card dated 01-10-2026"><input className={inputClass} value={f.sourceNote} onChange={(e) => setF({ ...f, sourceNote: e.target.value })} /></Field>
          </div>
          <div className="my-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => download('price-template.csv', tpl.csv)}>Download template</Button>
            <label className="inline-flex cursor-pointer items-center rounded border border-ink-soft px-2.5 py-1 text-[0.8125rem]">Upload CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) file.text().then((t) => { setCsv(t); setChecked(null); }); e.target.value = ''; }} /></label>
            {base === '/products' && <Button onClick={() => void copyReference()}>Copy SkyUp reference price</Button>}
            {csv !== null && <span className="text-muted">CSV loaded ({csv.split(/\r?\n/).filter((l) => l.trim()).length - 1} rows). <button type="button" className="underline" onClick={() => setCsv(null)}>Use the grid instead</button></span>}
          </div>
          {csv === null && (
            <div className="max-h-[360px] overflow-auto"><table className="w-full">
              <thead><tr>{tpl.factors.map((fa) => <th key={fa.key} className={th}>{fa.name}</th>)}<th className={th}>Base premium (₹)</th></tr></thead>
              <tbody>{grid.map((g, i) => (
                <tr key={i}>{tpl.factors.map((fa) => <td key={fa.key} className={td}>{g[fa.key]}</td>)}
                  <td className={td}><input className={`${inputClass} py-1`} value={g.base_premium ?? ''} onChange={(e) => setGrid(grid.map((x, j) => (j === i ? { ...x, base_premium: e.target.value } : x)))} /></td></tr>
              ))}</tbody>
            </table></div>
          )}
          {checked && <div className="mt-2"><Notice tone={checked.errors.length || checked.repeatedRows.length ? 'error' : checked.missing.length ? 'warn' : 'ok'}>
            {checked.accepted} rows accepted. {checked.messages.map((m) => m.message).join(' ')}</Notice></div>}
          {report.length > 0 && <Button variant="link" onClick={() => download('price-errors.csv', `row,problems\n${report.map((r) => `${r.row},"${r.problems.join('; ').replace(/"/g, '""')}"`).join('\n')}\n`)}>Download the error report</Button>}
          <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => void check()}>Check</Button><Button variant="primary" onClick={() => void save()}>Save price</Button><Button variant="link" onClick={() => setAdding(false)}>Cancel</Button></div>
          {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
        </div>
      )}
      {!adding && error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
    </div>
  );
}