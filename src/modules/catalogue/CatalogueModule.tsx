import { useCallback, useEffect, useState } from 'react';
import { errorText, fieldErrors, warningsOf } from '../../api/client';
import { catalogueApi, productsApi, type Approval, type CatInsurer, type InsurerValues } from '../../api/catalogue';
import { ProductsAdminTab } from './ProductsAdminTab';
import { ProductsTab } from './ProductsTab';
import { CorrectionsQueue } from './StageFourB';
import { useAuth } from '../../auth/AuthProvider';
import { useStepUp } from '../../auth/StepUp';
import { Button } from '../../ui/Button';
import { CheckList } from '../../ui/CheckList';
import { Field, Tabs, fmtDateTime, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';
import { CATALOGUE_CHECKS } from './checks';
import { TypesTab } from './TypesTab';

const th = 'border-b border-rule py-2 pr-3 text-left font-semibold text-muted';
const td = 'border-b border-rule py-2.5 pr-3 align-top';
const TONE: Record<string, string> = { ACTIVE: 'bg-ok-tint text-ok', DRAFT: 'bg-rule text-ink-soft', PENDING_APPROVAL: 'bg-warn-tint text-warn', INACTIVE: 'bg-rule text-ink-soft' };
const Pill = ({ s }: { s: string }) => <span className={`rounded-full px-2 py-0.5 text-[0.75rem] ${TONE[s] ?? ''}`}>{s.replace('_', ' ')}</span>;
const LABEL: Record<keyof InsurerValues, string> = {
  name: 'Insurer name', shortCode: 'Short code', category: 'Category', irdaiRegNo: 'IRDAI registration number', website: 'Website',
  paymentDomains: 'Payment link domains', careNumber: 'Customer care number', careEmail: 'Customer care email',
};
const show = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v ? String(v) : '—');

// ── Insurer form (P-20 step 2): Save draft or Submit for approval ──────────

function InsurerForm({ start, onDone, onCancel }: { start?: CatInsurer; onDone: (m: string, i: CatInsurer) => void; onCancel: () => void }) {
  const base = start?.pendingChange?.status === 'REJECTED' ? start.pendingChange.values : start;
  const [f, setF] = useState({
    name: base?.name ?? '', shortCode: base?.shortCode ?? '', category: base?.category ?? '', irdaiRegNo: base?.irdaiRegNo ?? '',
    website: base?.website ?? '', paymentDomains: (base?.paymentDomains ?? []).join(', '), careNumber: base?.careNumber ?? '', careEmail: base?.careEmail ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const live = start && (start.status === 'ACTIVE' || start.status === 'INACTIVE');
  async function save(submit: boolean) {
    setErrors({}); setError(null);
    const body = {
      ...f, paymentDomains: f.paymentDomains.split(',').map((s) => s.trim()).filter(Boolean),
      website: f.website || null, careNumber: f.careNumber || null, careEmail: f.careEmail || null,
    };
    try {
      const r = start ? await catalogueApi.edit(start.id, { version: start.version, ...body, submit }) : await catalogueApi.create({ ...body, submit });
      onDone(r.meta.message ?? 'Saved.', r.data);
    } catch (e) {
      const fe = fieldErrors(e);
      setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k.replace(/\.\d+$/, ''), v])));
      setError(errorText(e));
    }
  }
  const input = (k: keyof typeof f, hint?: string) => (
    <Field label={LABEL[k]} required={['name', 'shortCode', 'irdaiRegNo', 'paymentDomains'].includes(k)} error={errors[k]} hint={hint}>
      <input className={inputClass} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </Field>
  );
  return (
    <section className="mb-6 rounded border border-rule bg-sheet p-4">
      <h3 className="mb-3 text-[1.05rem] font-semibold">{start ? (live ? `Propose a change to ${start.name}` : `Edit ${start.name}`) : 'New insurer'}</h3>
      {live && <div className="mb-3"><Notice>Advisors keep seeing the current values until another admin approves this change.</Notice></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {input('name')}{input('shortCode', 'Capital letters, digits, hyphens')}
        <Field label="Category" required error={errors.category}>
          <select className={inputClass} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">Choose…</option><option>Life</option><option>General</option><option>Standalone Health</option>
          </select>
        </Field>
        {input('irdaiRegNo')}{input('website', 'https://…')}
        {input('paymentDomains', 'Bare domains, comma-separated: insurer.com')}
        {input('careNumber', '1800 123 4567')}{input('careEmail')}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {!live && <Button onClick={() => void save(false)}>Save draft</Button>}
        <Button variant="primary" onClick={() => void save(true)}>Submit for approval</Button>
        <Button variant="link" onClick={onCancel}>Cancel</Button>
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}

// ── Insurers list and details (P-20) ─────────────────────────────────────

function Insurers({ admin }: { admin: boolean }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<CatInsurer[] | null>(null);
  const [open, setOpen] = useState<CatInsurer | null>(null);
  const [form, setForm] = useState<'new' | 'edit' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setRows(await catalogueApi.insurers(q || undefined, status || undefined)); } catch (e) { setError(errorText(e)); } }, [q, status]);
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t); }, [load]);
  const done = (m: string, i?: CatInsurer) => { setForm(null); setMessage(m); if (i) setOpen(i); void load(); };
  async function act(fn: () => Promise<{ data: CatInsurer; meta: { message?: string } }>) {
    setError(null);
    try { const r = await fn(); done(r.meta.message ?? 'Saved.', r.data); } catch (e) { setError(errorText(e)); }
  }
  async function deactivate(i: CatInsurer) {
    setError(null);
    try { await catalogueApi.deactivate(i.id, i.version); }
    catch (e) {
      const w = warningsOf(e)[0];
      if (w?.messageId === 'CAT-09') { if (window.confirm(w.message)) await act(() => catalogueApi.deactivate(i.id, i.version, ['CAT-09'])); return; }
      setError(errorText(e));
    }
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className={`${inputClass} max-w-[320px]`} placeholder="Search name or code" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${inputClass} max-w-[200px]`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option><option value="DRAFT">Draft</option><option value="PENDING_APPROVAL">Pending approval</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
        </select>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => { setForm('new'); setOpen(null); setMessage(null); }}>+ Insurer</Button>
      </div>
      {message && <div className="mb-4"><Notice>{message}</Notice></div>}
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {form === 'new' && <InsurerForm onDone={done} onCancel={() => setForm(null)} />}
      {open && form === 'edit' && <InsurerForm start={open} onDone={done} onCancel={() => setForm(null)} />}
      {open && form !== 'edit' && (
        <section className="mb-6 rounded border border-rule bg-sheet p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3"><h3 className="text-[1.1rem] font-semibold">{open.name}</h3><Pill s={open.status} /><span className="font-mono text-muted">{open.shortCode}</span></div>
          {open.rejectReason && open.status === 'DRAFT' && <div className="mb-3"><Notice tone="error">Rejected: {open.rejectReason}</Notice></div>}
          <table className="w-full text-[0.875rem]"><tbody>
            {(Object.keys(LABEL) as Array<keyof InsurerValues>).map((k) => {
              const proposed = open.pendingChange?.values[k];
              const changed = open.pendingChange && show(proposed) !== show(open[k]);
              return <tr key={k}><td className={`${td} w-[38%] text-muted`}>{LABEL[k]}</td><td className={td}>{show(open[k])}{changed && <div className="text-warn">→ {show(proposed)} ({open.pendingChange!.status === 'PENDING' ? 'waiting for approval' : 'change rejected'})</div>}</td></tr>;
            })}
          </tbody></table>
          {open.pendingChange?.status === 'REJECTED' && <div className="mt-3"><Notice tone="error">Change rejected: {open.pendingChange.reason}</Notice></div>}
          <div className="mt-4 flex flex-wrap gap-2">
            {open.status !== 'PENDING_APPROVAL' && open.pendingChange?.status !== 'PENDING' && <Button onClick={() => setForm('edit')}>{open.status === 'DRAFT' ? 'Edit' : 'Propose a change'}</Button>}
            {(open.status === 'DRAFT' || open.pendingChange?.status === 'REJECTED') && <Button variant="primary" onClick={() => void act(() => catalogueApi.submit(open.id, open.version))}>Submit for approval</Button>}
            {admin && open.status === 'ACTIVE' && <Button variant="danger" onClick={() => void deactivate(open)}>Deactivate</Button>}
            {admin && open.status === 'INACTIVE' && <Button onClick={() => void act(() => catalogueApi.activate(open.id, open.version))}>Activate</Button>}
            <Button variant="link" onClick={() => setOpen(null)}>Close</Button>
          </div>
        </section>
      )}
      {!rows ? <p className="text-muted">Loading…</p> : rows.length === 0 ? <p className="text-muted">No insurers.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-[0.875rem]">
          <thead><tr><th className={th}>Insurer</th><th className={th}>Code</th><th className={th}>Category</th><th className={th}>Status</th></tr></thead>
          <tbody>{rows.map((i) => (
            <tr key={i.id} className="cursor-pointer hover:bg-sheet" onClick={() => { setOpen(i); setForm(null); setMessage(null); }}>
              <td className={td}><span className="font-medium">{i.name}</span>{i.pendingChange?.status === 'PENDING' && <span className="ml-2 text-[0.75rem] text-warn">change waiting</span>}</td>
              <td className={`${td} font-mono`}>{i.shortCode}</td><td className={td}>{i.category}</td><td className={td}><Pill s={i.status} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}

// ── Approvals (Section 9): a different ADM decides, after the OTP ──────────

function Approvals({ admin }: { admin: boolean }) {
  const requestStepUp = useStepUp();
  const [rows, setRows] = useState<Approval[] | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setRows(await catalogueApi.approvals()); } catch (e) { setError(errorText(e)); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function decide(a: Approval, approve: boolean) {
    setError(null); setMessage(null);
    if (!approve && !(reason[a.id] ?? '').trim()) { setError('Enter a reason for rejecting.'); return; }
    try {
      const token = await requestStepUp();
      const why = (reason[a.id] ?? '').trim();
      const r = a.kind === 'PRODUCT'
        ? (approve ? await productsApi.approve(a.id, a.version, token) : await productsApi.reject(a.id, a.version, why, token))
        : a.kind === 'TEMPLATE'
        ? (approve ? await catalogueApi.approveTemplate(a.id, a.version, token) : await catalogueApi.rejectTemplate(a.id, a.version, why, token))
        : (approve ? await catalogueApi.approve(a.id, a.version, token) : await catalogueApi.reject(a.id, a.version, why, token));
      setMessage(r.meta.message ?? 'Done.'); void load();
    } catch (e) { setError(errorText(e)); void load(); }
  }
  return (
    <>
      {message && <div className="mb-4"><Notice>{message}</Notice></div>}
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      {!admin && <div className="mb-4"><Notice>Only a SkyUp Admin can approve or reject. Staff can see what is waiting.</Notice></div>}
      {!rows ? <p className="text-muted">Loading…</p> : rows.length === 0 ? <p className="text-muted">Nothing waiting for approval.</p> : rows.map((a) => (
        <section key={`${a.id}-${a.version}`} className="mb-4 rounded border border-rule bg-sheet p-4 text-[0.875rem]">
          <div className="mb-2 flex flex-wrap items-baseline gap-2"><span className="font-semibold">{a.kind === 'PRODUCT' ? (a.what === 'NEW' ? 'New product' : 'Product change') : a.kind === 'TEMPLATE' ? 'Feature template' : a.what === 'NEW' ? 'New insurer' : 'Change to insurer'}: {a.name}</span><span className="text-muted">submitted {fmtDateTime(a.at)}{a.mine ? ' by you' : ''}</span></div>
          {a.kind === 'PRODUCT' && a.what === 'CHANGE' && (a.changes ?? []).length > 0 && (
            <table className="mb-3 w-full"><tbody>
              {(a.changes ?? []).map((c) => (
                <tr key={c.field}><td className={`${td} w-[30%] text-muted`}>{c.field}</td><td className={td}><span className="line-through">{JSON.stringify(c.before)}</span> → {JSON.stringify(c.after)}</td></tr>
              ))}
            </tbody></table>
          )}
          {a.what === 'CHANGE' && a.current && a.proposed && (
            <table className="mb-3 w-full"><tbody>
              {(Object.keys(LABEL) as Array<keyof InsurerValues>).filter((k) => show(a.current![k]) !== show(a.proposed![k])).map((k) => (
                <tr key={k}><td className={`${td} w-[30%] text-muted`}>{LABEL[k]}</td><td className={td}><span className="line-through">{show(a.current![k])}</span> → {show(a.proposed![k])}</td></tr>
              ))}
            </tbody></table>
          )}
          {admin && (a.mine ? <p className="text-muted">You made this change, so another admin must approve it.</p> : (
            <div className="flex flex-wrap items-end gap-2">
              <Button variant="primary" onClick={() => void decide(a, true)}>Approve</Button>
              <input className={`${inputClass} max-w-[320px]`} placeholder="Reason (to reject)" value={reason[a.id] ?? ''} onChange={(e) => setReason({ ...reason, [a.id]: e.target.value })} />
              <Button variant="danger" onClick={() => void decide(a, false)}>Reject</Button>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

export function CatalogueModule() {
  const { can } = useAuth();
  const maker = can('catalogue.make');
  const admin = can('catalogue.approve');
  const seller = can('products.view');
  const [tab, setTab] = useState<'insurers' | 'types' | 'products' | 'approvals' | 'checks'>(maker ? 'insurers' : seller ? 'products' : 'checks');
  return (
    <main className="overflow-y-auto px-[clamp(20px,4vw,56px)] pt-7 pb-16">
      <header className="mb-5 max-w-[68ch]">
        <h1 className="text-[1.9rem] leading-tight font-bold tracking-[-0.01em]">Insurance catalogue</h1>
        <p className="mt-2 text-ink-soft">Section 9, P-20 to P-22 and P-25. SkyUp makes verified products and a different Admin approves them with an OTP; advisors see the published ones and can add their own.</p>
      </header>
      <Tabs tabs={[...(maker ? [['insurers', 'Insurers'], ['types', 'Insurance types'], ['products', 'Products'], ['approvals', 'Approvals']] as Array<['insurers' | 'types' | 'products' | 'approvals', string]> : []), ...(seller ? [['products', 'Products']] as Array<['products', string]> : []), ['checks', 'Backend checks']]} active={tab} onChange={setTab} />
      {!maker && !seller && tab !== 'checks' && <Notice>The catalogue is managed by SkyUp Staff and Admins.</Notice>}
      {tab === 'insurers' && <Insurers admin={admin} />}
      {tab === 'types' && <TypesTab admin={admin} />}
      {tab === 'products' && (maker ? <ProductsAdminTab admin={admin} /> : <ProductsTab />)}
      {tab === 'approvals' && <><CorrectionsQueue /><Approvals admin={admin} /></>}
      {tab === 'checks' && <CheckList checks={CATALOGUE_CHECKS} intro="Run these signed in as the seeded SkyUp Admin. Each check adds a throwaway SkyUp Staff member as the maker (with your OTP from the dev inbox) and approves as you." />}
    </main>
  );
}