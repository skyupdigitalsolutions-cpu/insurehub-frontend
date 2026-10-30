import { useCallback, useEffect, useState } from 'react';
import { errorText, fieldErrors } from '../../api/client';
import { MODES, NEEDS_REFERENCE, paymentsApi, proposalsApi, type PaymentView } from '../../api/payments';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../ui/Button';
import { Field, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';

const th = 'border-b border-rule py-2 pr-3 text-left text-[0.8125rem] font-semibold text-muted';
const td = 'border-b border-rule py-2 pr-3 align-top';
const rs = (n?: number | null) => (n === null || n === undefined ? '—' : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const dmy = (iso?: string | null) => (iso ? iso.split('-').reverse().join('-') : '—');
const money = (v: string) => Number(v.replace(/[₹,\s]/g, ''));

/** On a quotation: payment links (P-31), recorded payments (P-32) and Start proposal (P-55). */
export function PaymentPanel({ quotationId, status, final }: { quotationId: string; status: string; final: number | null }) {
  const { can } = useAuth();
  const [rows, setRows] = useState<PaymentView[]>([]);
  const [form, setForm] = useState<'link' | 'pay' | null>(null);
  const [l, setL] = useState({ method: 'Insurer payment link', link: '', portalAmount: final ? String(final) : '', note: '' });
  const [p, setP] = useState({ mode: 'UPI', amount: final ? String(final) : '', paymentDate: '', reference: '', chequeNumber: '', bank: '', chequeDate: '', differenceReason: '', declaration: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { if (can('payments.record')) paymentsApi.list(quotationId).then(setRows, () => undefined); }, [quotationId, can]);
  useEffect(load, [load]);
  async function run(fn: () => Promise<unknown>) {
    setErrors({}); setError(null); setMessage(null);
    try { const r = (await fn()) as { meta?: { message?: string; warnings?: Array<{ message: string }> } }; setMessage([r?.meta?.message, ...(r?.meta?.warnings ?? []).map((w) => w.message)].filter(Boolean).join(' ')); setForm(null); load(); }
    catch (e) { setErrors(fieldErrors(e)); setError(errorText(e)); }
  }
  const awaiting = rows.find((r) => r.status === 'AWAITING_PAYMENT');
  const paid = rows.find((r) => r.status === 'PAID');
  return (
    <div className="mt-4 rounded border border-rule p-3 text-[0.875rem]">
      <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">Payment</h4><span className="text-muted">Bimayantra records payments; it never moves money.</span><span className="flex-1" />
        {can('payments.record') && !paid && ['READY', 'SHARED', 'ACCEPTED'].includes(status) && <Button onClick={() => setForm('link')}>{awaiting ? 'Replace link' : 'Add payment link'}</Button>}
        {can('payments.record') && !paid && ['SHARED', 'ACCEPTED'].includes(status) && <Button variant="primary" onClick={() => setForm('pay')}>Record payment</Button>}
        {can('proposals.prepare') && ['SHARED', 'ACCEPTED'].includes(status) && <Button onClick={() => void run(() => proposalsApi.start(quotationId))}>Start proposal</Button>}
      </div>
      {form === 'link' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Payment method" required error={errors.method}><select className={inputClass} value={l.method} onChange={(e) => setL({ ...l, method: e.target.value })}>{['Insurer payment link', 'Paid at insurer branch or by cheque', 'Other insurer channel'].map((m) => <option key={m}>{m}</option>)}</select></Field>
          {l.method === 'Insurer payment link' && <Field label="Payment link" required error={errors.link} hint="https://… from the insurer's portal"><input className={inputClass} value={l.link} onChange={(e) => setL({ ...l, link: e.target.value })} /></Field>}
          <Field label="Amount shown on the insurer portal (₹)" required error={errors.portalAmount}><input className={inputClass} value={l.portalAmount} onChange={(e) => setL({ ...l, portalAmount: e.target.value })} /></Field>
          <Field label="Note" error={errors.note}><input className={inputClass} value={l.note} onChange={(e) => setL({ ...l, note: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Button variant="primary" onClick={() => void run(() => paymentsApi.addLink(quotationId, { method: l.method, ...(l.link ? { link: l.link } : {}), portalAmount: money(l.portalAmount), ...(l.note ? { note: l.note } : {}) }, !!awaiting))}>Save</Button></div>
        </div>
      )}
      {form === 'pay' && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Mode" required error={errors.mode}><select className={inputClass} value={p.mode} onChange={(e) => setP({ ...p, mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Amount (₹)" required error={errors.amount}><input className={inputClass} value={p.amount} onChange={(e) => setP({ ...p, amount: e.target.value })} /></Field>
          <Field label="Payment date" required error={errors.paymentDate} hint="DD-MM-YYYY"><input className={inputClass} value={p.paymentDate} onChange={(e) => setP({ ...p, paymentDate: e.target.value })} /></Field>
          {NEEDS_REFERENCE.includes(p.mode) && <Field label="Reference number" required error={errors.reference} hint="Transaction or UTR number"><input className={inputClass} value={p.reference} onChange={(e) => setP({ ...p, reference: e.target.value })} /></Field>}
          {p.mode === 'Cheque' && <><Field label="Cheque number" required error={errors['cheque.number']}><input className={inputClass} value={p.chequeNumber} onChange={(e) => setP({ ...p, chequeNumber: e.target.value })} /></Field>
            <Field label="Bank" required><input className={inputClass} value={p.bank} onChange={(e) => setP({ ...p, bank: e.target.value })} /></Field>
            <Field label="Cheque date" required hint="DD-MM-YYYY"><input className={inputClass} value={p.chequeDate} onChange={(e) => setP({ ...p, chequeDate: e.target.value })} /></Field></>}
          {final !== null && p.amount && money(p.amount) !== final && <Field label="Reason for difference" required error={errors.differenceReason}><select className={inputClass} value={p.differenceReason} onChange={(e) => setP({ ...p, differenceReason: e.target.value })}><option value="">Choose…</option>{['Insurer changed premium after review', 'Customer changed riders on the portal', 'Other'].map((x) => <option key={x}>{x}</option>)}</select></Field>}
          <label className="flex items-center gap-2 sm:col-span-3"><input type="checkbox" checked={p.declaration} onChange={(e) => setP({ ...p, declaration: e.target.checked })} /> I have checked this payment.</label>
          {errors.declaration && <p className="text-bad sm:col-span-3">{errors.declaration}</p>}
          <div className="sm:col-span-3"><Button variant="primary" onClick={() => void run(() => paymentsApi.record(quotationId, {
            mode: p.mode, amount: money(p.amount), paymentDate: p.paymentDate, ...(p.reference ? { reference: p.reference } : {}),
            ...(p.mode === 'Cheque' ? { cheque: { number: p.chequeNumber, bank: p.bank, date: p.chequeDate } } : {}), ...(p.differenceReason ? { differenceReason: p.differenceReason } : {}), declaration: p.declaration,
          }))}>Save payment</Button></div>
        </div>
      )}
      {rows.length > 0 && (
        <table className="mt-3 w-full"><thead><tr><th className={th}>Status</th><th className={th}>Method / mode</th><th className={th}>Amount</th><th className={th}>Date</th><th className={th}>Reference</th><th className={th} /></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td className={td}>{r.status.replace('_', ' ')}<div className="text-[0.75rem] text-muted">{r.statusLabel}</div>{r.reason && <div className="text-muted">{r.reason}</div>}</td>
              <td className={td}>{r.mode ?? r.method}{r.link && <div><a className="underline" href={r.link} target="_blank" rel="noreferrer noopener">{new URL(r.link).hostname}</a></div>}</td>
              <td className={td}>{rs(r.amount ?? r.portalAmount)}</td><td className={td}>{dmy(r.paymentDate)}</td><td className={td}>{r.reference ?? '—'}</td>
              <td className={td}>{r.status === 'AWAITING_PAYMENT' && <><Button onClick={() => void run(() => paymentsApi.expire(r.id))}>Link expired</Button> <Button onClick={() => { const why = window.prompt('Why did the payment fail?'); if (why) void run(() => paymentsApi.fail(r.id, why)); }}>Mark failed</Button></>}
                {r.status === 'PAID' && <select className={`${inputClass} py-1`} defaultValue="" onChange={(e) => { if (e.target.value && window.confirm(`Undo this payment (${e.target.value})?`)) void run(() => paymentsApi.undo(r.id, e.target.value)); e.target.value = ''; }}><option value="">Undo payment…</option>{['Recorded by mistake', 'Cheque returned', 'Refunded by insurer'].map((x) => <option key={x}>{x}</option>)}</select>}</td>
            </tr>
          ))}</tbody></table>
      )}
      {message && <div className="mt-3"><Notice>{message}</Notice></div>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </div>
  );
}