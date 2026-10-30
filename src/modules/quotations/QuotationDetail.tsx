import { useState } from 'react';
import { errorText } from '../../api/client';
import { fileUrl } from '../../api/profile';
import { quotationActionsApi, quotationsApi, type QuotationView } from '../../api/quotations';
import { Button } from '../../ui/Button';
import { fmtDateTime, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';
import { PaymentPanel } from '../payments/PaymentPanel';

const th = 'border-b border-rule py-2 pr-3 text-left text-[0.8125rem] font-semibold text-muted';
const td = 'border-b border-rule py-2 pr-3 align-top';
const rs = (n?: number | null) => (n === null || n === undefined ? '—' : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const dmy = (iso?: string | null) => (iso ? iso.split('-').reverse().join('-') : '—');
const REJECT = ['Premium too high', 'Chose another insurer', 'Not interested now', 'Other'];

/** A generated quotation: revisions, Share (P-28) and the P-29 actions its status allows. */
export function QuotationDetail({ q: start, onChanged }: { q: QuotationView; onChanged: (q: QuotationView | null, m?: string) => void }) {
  const [q, setQ] = useState(start);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const done = (u: QuotationView | null, m?: string) => { if (u) setQ(u); setMessage(m ?? null); setError(null); onChanged(u, m); };
  async function act(fn: () => Promise<{ data: QuotationView; meta: { message?: string } } | QuotationView>) {
    setError(null);
    try { const r = await fn(); if ('meta' in r) done(r.data, r.meta.message); else done(r); } catch (e) { setError(errorText(e)); setQ(await quotationsApi.get(q.id).catch(() => q)); }
  }
  async function share(channel: 'EMAIL' | 'WHATSAPP' | 'LINK' | 'DOWNLOAD') {
    setError(null);
    try {
      const r = await quotationActionsApi.share(q.id, channel);
      if (channel === 'WHATSAPP' && r.data.whatsappUrl) window.open(r.data.whatsappUrl, '_blank', 'noopener');
      if (channel === 'LINK') await navigator.clipboard?.writeText(r.data.link).catch(() => undefined);
      if (channel === 'DOWNLOAD' && r.data.pdfFileId) window.open(fileUrl(r.data.pdfFileId), '_blank', 'noopener');
      done(r.data.quotation, channel === 'LINK' ? `${r.meta.message} ${r.data.link}` : r.meta.message);
    } catch (e) { setError(errorText(e)); }
  }
  const s = q.status;
  return (
    <section className="mb-6 rounded border border-rule bg-sheet p-4 text-[0.875rem]">
      <div className="mb-3 flex flex-wrap items-baseline gap-3"><h3 className="font-mono text-[1.05rem] font-semibold">{q.number ?? 'Draft'}</h3><span className="font-medium">{s}</span></div>
      <table className="mb-3 w-full"><thead><tr><th className={th}>Revision</th><th className={th}>Status</th><th className={th}>Total</th><th className={th}>Shared</th><th className={th}>Valid until</th><th className={th}>Viewed</th><th className={th}>PDF</th></tr></thead>
        <tbody>{q.revisions.map((r) => (
          <tr key={r.revision}><td className={td}>R{r.revision}</td><td className={td}>{r.status}{r.reason ? <div className="text-muted">{r.reason}</div> : null}</td><td className={td}>{rs(r.final)}</td>
            <td className={td}>{r.sharedAt ? fmtDateTime(r.sharedAt) : '—'}</td><td className={td}>{dmy(r.validUntil)}</td><td className={td}>{r.viewed ? `${r.viewed}×` : '—'}</td>
            <td className={td}>{r.pdfFileId && <a className="underline" href={fileUrl(r.pdfFileId)} target="_blank" rel="noreferrer">Open</a>}</td></tr>
        ))}</tbody></table>
      {['READY', 'SHARED', 'ACCEPTED'].includes(s) && (
        <div className="mb-3 flex flex-wrap gap-2"><span className="self-center font-medium">Share:</span>
          <Button onClick={() => void share('EMAIL')}>Email</Button><Button onClick={() => void share('WHATSAPP')}>WhatsApp</Button>
          <Button onClick={() => void share('LINK')}>Copy link</Button><Button onClick={() => void share('DOWNLOAD')}>Download PDF</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {s === 'READY' && <Button onClick={() => void act(() => quotationActionsApi.edit(q.id, q.version))}>Edit</Button>}
        {['SHARED', 'EXPIRED', 'REJECTED'].includes(s) && <Button onClick={() => void act(() => quotationActionsApi.revise(q.id, q.version))}>Revise</Button>}
        {s === 'SHARED' && <Button variant="primary" onClick={() => void act(() => quotationActionsApi.accept(q.id, q.version))}>Mark accepted</Button>}
        {s === 'SHARED' && <>
          <select className={`${inputClass} max-w-[220px]`} value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Reason…</option>{REJECT.map((x) => <option key={x}>{x}</option>)}</select>
          {reason === 'Other' && <input className={`${inputClass} max-w-[220px]`} placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />}
          <Button disabled={!reason} onClick={() => void act(() => quotationActionsApi.reject(q.id, q.version, reason, note))}>Mark rejected</Button></>}
        {['READY', 'SHARED', 'ACCEPTED'].includes(s) && <>
          <input className={`${inputClass} max-w-[240px]`} placeholder="Reason to cancel" value={s === 'SHARED' ? note : reason} onChange={(e) => (s === 'SHARED' ? setNote(e.target.value) : setReason(e.target.value))} />
          <Button variant="danger" onClick={() => { const why = s === 'SHARED' ? note : reason; if (window.confirm('Cancel this quotation? The customer\u2019s link stops working.')) void act(() => quotationActionsApi.cancel(q.id, q.version, why)); }}>Cancel quotation</Button></>}
      </div>
      {message && <div className="mt-3"><Notice>{message}</Notice></div>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      {q.number && <PaymentPanel quotationId={q.id} status={s} final={q.revisions[q.revisions.length - 1]?.final ?? null} />}
    </section>
  );
}