import { useEffect, useState } from 'react';
import { errorText, fieldErrors } from '../../api/client';
import { PRIORITY_LABEL, bestFitApi, type Ranking } from '../../api/bestfit';
import { productsApi } from '../../api/catalogue';
import { Button } from '../../ui/Button';
import { Field, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';

const th = 'border-b border-rule py-2 pr-3 text-left text-[0.8125rem] font-semibold text-muted';
const td = 'border-b border-rule py-2 pr-3 align-top';
const PARTS: Array<[keyof Ranking['results'][number]['parts'], string]> = [['budget', 'Budget fit'], ['roomRent', 'Room rent'], ['coPay', 'Co-pay'], ['waiting', 'Waiting period'], ['claimRatio', 'Claim ratio']];

/** Customer → Best fit (P-26): three questions, a ranked list, every score with its reason. */
export function BestFitTab({ customerId }: { customerId: string }) {
  const [types, setTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [typeId, setTypeId] = useState('');
  const [opts, setOpts] = useState<Awaited<ReturnType<typeof bestFitApi.options>> | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  const [q, setQ] = useState({ budget: '', priority: 'LOWEST_PREMIUM', sumInsured: '' });
  const [res, setRes] = useState<Ranking | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    productsApi.list({ quotable: true }).then((ps) => setTypes([...new Map(ps.map((p) => [p.typeId, { id: p.typeId, name: p.type ?? '' }])).values()]), (e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    setOpts(null); setRes(null);
    if (!typeId) return;
    bestFitApi.options(customerId, typeId).then((o) => { setOpts(o); setPeople(o.people.slice(0, 1).map((p) => p.key)); }, (e) => setError(errorText(e)));
  }, [customerId, typeId]);
  async function rank() {
    setErrors({}); setError(null); setChosen(null);
    try { setRes(await bestFitApi.rank(customerId, { typeId, people, budget: q.budget, priority: q.priority, sumInsured: Number(q.sumInsured) })); }
    catch (e) { setErrors(fieldErrors(e)); setError(errorText(e)); }
  }
  return (
    <div className="mt-2 text-[0.875rem]">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Insurance type" required error={errors.typeId}>
          <select className={inputClass} value={typeId} onChange={(e) => setTypeId(e.target.value)}><option value="">Choose…</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </Field>
        {types.length === 0 && <p className="self-end text-muted">No products you can quote yet. Add your insurers' agent codes and authorised categories in your profile.</p>}
      </div>
      {opts && (
        <>
          <fieldset className="mt-3"><legend className="mb-1 font-medium">People to cover <span className="text-bad">*</span></legend>
            {opts.people.map((p) => (
              <label key={p.key} className="mr-4 inline-flex items-center gap-1.5">
                <input type="checkbox" checked={people.includes(p.key)} onChange={(e) => setPeople(e.target.checked ? [...people, p.key] : people.filter((k) => k !== p.key))} />
                {p.name} <span className="text-muted">({p.relationship}{p.hasDob ? '' : ', no date of birth'})</span>
              </label>
            ))}
            {errors.people && <p className="text-bad">{errors.people}</p>}
          </fieldset>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Yearly budget (₹)" required error={errors.budget}><input className={inputClass} value={q.budget} onChange={(e) => setQ({ ...q, budget: e.target.value })} /></Field>
            <Field label="What matters most" required error={errors.priority}>
              <select className={inputClass} value={q.priority} onChange={(e) => setQ({ ...q, priority: e.target.value })}>{opts.priorities.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select>
            </Field>
            <Field label="Sum insured" required error={errors.sumInsured}>
              <select className={inputClass} value={q.sumInsured} onChange={(e) => setQ({ ...q, sumInsured: e.target.value })}><option value="">Choose…</option>{opts.sumInsuredOptions.map((s) => <option key={s} value={s}>₹{s.toLocaleString('en-IN')}</option>)}</select>
            </Field>
          </div>
          <div className="mt-3"><Button variant="primary" onClick={() => void rank()}>Rank products</Button></div>
        </>
      )}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      {res && (
        <div className="mt-4">
          <Notice tone={res.results.length ? 'ok' : 'warn'}>{res.message}</Notice>
          {res.summary && <p className="mt-2 text-muted">{res.summary.text ?? res.summary.message}</p>}
          {chosen && <div className="mt-2"><Notice>Chosen. Creating the quotation from it arrives with Module 10.</Notice></div>}
          {res.results.length > 0 && (
            <div className="mt-3 overflow-x-auto"><table className="w-full">
              <thead><tr><th className={th}>#</th><th className={th}>Product</th><th className={th}>Premium</th><th className={th}>Total</th>{PARTS.map(([, l]) => <th key={l} className={th}>{l}</th>)}<th className={th} /></tr></thead>
              <tbody>{res.results.map((r, i) => (
                <tr key={r.productId}>
                  <td className={td}>{i + 1}</td>
                  <td className={td}><div className="font-medium">{r.name}</div><div className="text-muted">{r.insurer}</div>{r.coverage && <div className="text-[0.8125rem] text-warn">{r.coverage.message}</div>}</td>
                  <td className={td}>{r.premium === null ? <span className="text-muted">at quotation</span> : `₹${r.premium.toLocaleString('en-IN')}`}</td>
                  <td className={`${td} text-[1.05rem] font-bold`}>{r.total}</td>
                  {PARTS.map(([k]) => <td key={k} className={td}><div className="font-medium">{r.parts[k].score}</div><div className="text-[0.75rem] text-muted">{r.parts[k].reason}</div></td>)}
                  <td className={td}><Button onClick={() => void bestFitApi.choose(customerId, res.rankingId, r.productId).then(() => setChosen(r.productId), (e) => setError(errorText(e)))}>{chosen === r.productId ? 'Chosen' : 'Choose'}</Button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}
    </div>
  );
}