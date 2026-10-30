import { useEffect, useState } from 'react';
import { publicQuotation, type PublicQuotation } from '../../api/quotations';

/** One fetch per page load (React's development mode runs effects twice; each fetch records a view). */
const loaded = new Map<string, Promise<PublicQuotation>>();

const rs = (n?: number | null) => (n === null || n === undefined ? '—' : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** The customer's view link (P-28): no sign-in; QT-20 once it is no longer valid. */
export function PublicQuotationPage({ token }: { token: string }) {
  const [q, setQ] = useState<PublicQuotation | null>(null);
  useEffect(() => {
    const meta = document.createElement('meta'); meta.name = 'robots'; meta.content = 'noindex, nofollow'; document.head.appendChild(meta);
    if (!loaded.has(token)) loaded.set(token, publicQuotation(token));
    void loaded.get(token)!.then(setQ);
  }, [token]);
  if (!q) return <main className="p-8">Loading…</main>;
  if (!q.valid) return <main className="mx-auto max-w-[640px] p-8"><p className="rounded border border-rule bg-sheet p-4">{q.message}</p></main>;
  const b = q.breakdown!;
  return (
    <main className="mx-auto max-w-[680px] p-6 text-[0.95rem]">
      <h1 className="text-[1.5rem] font-bold">{q.advisor?.businessName}</h1>
      <p className="mt-1 text-ink-soft">Quotation {q.number} R{q.revision} · valid until {q.validUntil}</p>
      <section className="mt-5 rounded border border-rule bg-sheet p-4">
        <p><strong>{q.product?.name}</strong> by {q.insurer?.name} (UIN {q.product?.uin})</p>
        <p className="mt-1">For {q.people?.map((p) => `${p.name} (${p.age})`).join(', ')}</p>
        <p className="mt-1">Sum insured {rs(q.sumInsured)} · {q.policyTerm} year(s) · starts {q.startDate}</p>
        <table className="mt-4 w-full"><tbody>
          <tr><td className="py-1">Base premium</td><td className="py-1 text-right">{rs(b.base)}</td></tr>
          {b.riders.map((r) => <tr key={r.name}><td className="py-1">{r.name}</td><td className="py-1 text-right">{rs(r.amount)}</td></tr>)}
          {b.discount > 0 && <tr><td className="py-1">Discount</td><td className="py-1 text-right">− {rs(b.discount)}</td></tr>}
          <tr><td className="py-1">Tax{b.taxPercent !== null ? ` (${b.taxPercent}%)` : ''}</td><td className="py-1 text-right">{rs(b.tax)}</td></tr>
          <tr className="font-bold"><td className="border-t border-rule py-2">Total payable</td><td className="border-t border-rule py-2 text-right">{rs(b.final)}</td></tr>
        </tbody></table>
      </section>
      {q.payment?.link && <p className="mt-4"><a className="inline-block rounded bg-ink px-4 py-2 font-semibold text-white" href={q.payment.link} target="_blank" rel="noreferrer noopener">Pay on {q.payment.payOn} website</a> <span className="ml-2 text-muted">{q.payment.domain}</span></p>}
      {q.payment?.message && <p className="mt-4 font-medium">{q.payment.message}</p>}
      <p className="mt-4">Your advisor: <strong>{q.advisor?.name}</strong>{q.advisor?.mobile ? ` · ${q.advisor.mobile}` : ''}</p>
      <p className="mt-4 text-[0.8125rem] text-muted">{q.disclaimer}</p>
    </main>
  );
}