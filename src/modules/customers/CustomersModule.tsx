import { useCallback, useEffect, useState } from 'react';
import { errorText, type Meta } from '../../api/client';
import { customersApi, type CustomerSummary } from '../../api/customers';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../ui/Button';
import { CheckList } from '../../ui/CheckList';
import { Tabs, fmtDate, inputClass, labelClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';
import { CustomerDetail } from './CustomerDetail';
import { useOpenRecord } from '../../shell/nav';
import { CustomerForm } from './CustomerForm';
import { CUSTOMER_CHECKS } from './checks';

const th = 'border-b border-rule py-2 pr-3 text-left font-semibold text-muted';
const td = 'border-b border-rule py-2.5 pr-3 align-top';

function CustomersTab() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CustomerSummary[] | null>(null);
  const [meta, setMeta] = useState<Meta>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [openTab, setOpenTab] = useState<'family' | 'documents' | 'vehicles' | undefined>(undefined);
  useOpenRecord((t) => t.type === 'CUSTOMER' || (t.type === 'LIST' && t.list === 'CUSTOMERS'), (t) => {
    if (t.type === 'CUSTOMER') { setSelected(t.id); setOpenTab(t.tab); return; }
    if (t.type !== 'LIST') return;
    const fl = t.filter ?? {};
    if (Array.isArray(fl.status)) setStatus(String(fl.status[0] ?? ''));
    if (typeof fl.search === 'string') setSearch(fl.search);
    if (fl.create) setCreating(true);
  });
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await customersApi.list({ search: search || undefined, status: status || undefined, page }); setRows(r.data); setMeta(r.meta); setError(null); }
    catch (e) { setError(errorText(e)); }
  }, [search, status, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const changed = useCallback((m?: string) => { if (m) setMessage(m); void load(); }, [load]);

  return (
    <div>
      {message && <Notice>{message}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {creating ? (
        <div className="mb-6"><CustomerForm onCancel={() => setCreating(false)} onSaved={(c, m) => { setCreating(false); setSelected(c.id); changed(m); }} /></div>
      ) : (
        <div className="mb-4 flex flex-wrap items-end gap-2.5">
          <label className={`${labelClass} min-w-56 grow`}>Search<input className={inputClass} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Name, CU number, mobile or email" /></label>
          <label className={labelClass}>Status<select className={inputClass} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
          {!user?.readOnly && <Button variant="primary" onClick={() => { setCreating(true); setMessage(null); }}>+ Customer</Button>}
        </div>
      )}
      {rows === null ? <p className="text-muted">Loading customers…</p> : rows.length === 0 ? <p className="text-muted">{search || status ? 'No customers match these filters.' : 'No customers yet. Create one, or convert a lead.'}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[0.8125rem]">
            <thead><tr><th className={th}>Customer</th><th className={th}>Mobile</th><th className={th}>City</th><th className={th}>Source</th><th className={th}>Status</th><th className={th}>Created</th></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id} onClick={() => { setSelected(c.id); setMessage(null); }} className={`cursor-pointer hover:bg-sheet ${selected === c.id ? 'bg-sheet' : ''}`}>
                <td className={td}><span className="font-medium">{c.name}</span><div className="font-mono text-muted">{c.number}</div></td>
                <td className={td}>{c.mobile}</td><td className={td}>{c.city ?? '—'}</td><td className={td}>{c.source}</td><td className={td}>{c.status}</td><td className={td}>{fmtDate(c.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {(meta.pages ?? 1) > 1 && (
        <div className="mt-3 flex items-center gap-3 text-[0.8125rem]">
          <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-muted">Page {meta.page} of {meta.pages}, {meta.total} customers</span>
          <Button disabled={page >= (meta.pages ?? 1)} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
      {selected && <CustomerDetail key={`${selected}-${openTab ?? ''}`} id={selected} initialTab={openTab} onChanged={changed} />}
    </div>
  );
}

export function CustomersModule() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'customers' | 'checks'>('customers');
  return (
    <main className="overflow-y-auto px-[clamp(20px,4vw,56px)] pt-9 pb-16">
      <header className="mb-6 max-w-[68ch]">
        <h1 className="text-[1.9rem] leading-tight font-bold tracking-[-0.01em]">Customers, family and consent</h1>
        <p className="mt-2 text-ink-soft">P-15 to P-17 and P-19. Each customer's documents (P-18) and vehicles (P-54) are on their own tabs.</p>
      </header>
      <Tabs tabs={[['customers', 'Customers'], ['checks', 'Backend checks']]} active={tab} onChange={setTab} />
      {tab === 'checks' ? <CheckList checks={CUSTOMER_CHECKS} intro="Each check uses a throwaway advisor account." />
        : can('customers.work') ? <CustomersTab /> : <Notice tone="error">You need a support grant from this advisor to open client details.</Notice>}
    </main>
  );
}