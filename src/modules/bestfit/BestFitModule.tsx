import { openRecord } from '../../shell/nav';
import { Button } from '../../ui/Button';

/** Menu item 9: best fit runs for one customer, so it opens from the customer (P-26 step 1). */
export function BestFitModule() {
  return (
    <main className="overflow-y-auto px-[clamp(20px,4vw,56px)] pt-7 pb-16">
      <header className="mb-5 max-w-[68ch]">
        <h1 className="text-[1.9rem] leading-tight font-bold tracking-[-0.01em]">Best-fit ranking</h1>
        <p className="mt-2 text-ink-soft">P-26. Open a customer and choose the <strong>Best fit</strong> tab: pick the insurance type and the people to cover, answer three questions, and every product you can quote is ranked with the reason for each score.</p>
        <p className="mt-2 text-ink-soft">Only products you can actually quote appear: ACTIVE, with your agent code for the insurer, in your authorised categories, with a current price (or manual entry) and the chosen sum insured.</p>
      </header>
      <Button variant="primary" onClick={() => openRecord({ type: 'LIST', list: 'CUSTOMERS' })}>Go to customers</Button>
    </main>
  );
}