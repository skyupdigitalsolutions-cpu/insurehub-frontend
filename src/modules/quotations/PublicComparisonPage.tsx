import { useEffect, useState } from 'react';
import { publicComparison } from '../../api/quotations';
import { ComparisonTable } from './ComparisonsTab';

const loaded = new Map<string, ReturnType<typeof publicComparison>>();

/** The customer's comparison page (no sign-in, never a payment link). */
export function PublicComparisonPage({ token }: { token: string }) {
  const [c, setC] = useState<Awaited<ReturnType<typeof publicComparison>> | null>(null);
  useEffect(() => {
    const meta = document.createElement('meta'); meta.name = 'robots'; meta.content = 'noindex, nofollow'; document.head.appendChild(meta);
    if (!loaded.has(token)) loaded.set(token, publicComparison(token));
    void loaded.get(token)!.then(setC);
  }, [token]);
  if (!c) return <main className="p-8">Loading…</main>;
  if (!c.valid) return <main className="mx-auto max-w-[640px] p-8"><p className="rounded border border-rule bg-sheet p-4">{c.message}</p></main>;
  return (
    <main className="mx-auto max-w-[1000px] p-6">
      <h1 className="text-[1.5rem] font-bold">{c.advisor.businessName}</h1>
      <p className="mt-1 text-ink-soft">Comparison {c.number} for {c.customer.name} · valid until {c.validUntil}</p>
      <div className="mt-5"><ComparisonTable t={c} recommended={c.recommendedProductId} reason={c.recommendedReason} /></div>
      <p className="mt-4">Your advisor: <strong>{c.advisor.name}</strong>{c.advisorMobile ? ` · ${c.advisorMobile}` : ''}</p>
      <p className="mt-4 text-[0.8125rem] text-muted">{c.disclaimer}</p>
    </main>
  );
}