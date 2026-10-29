import { useEffect, useRef, useState } from 'react';
import { errorText } from '../api/client';
import { bellApi, searchApi, type BellItem, type Count, type SearchResult } from '../api/workday';
import { fmtDateTime } from '../ui/form';
import { openRecord, type Target } from './nav';

const GROUP_LABEL: Record<string, string> = { LEADS: 'Leads', CUSTOMERS: 'Customers', FAMILY_MEMBERS: 'Family members', QUOTATIONS: 'Quotations', POLICIES: 'Policies' };
const MIN = 3; // CFG-24
const PAUSE = 300; // CFG-131 milliseconds

/** P-09: the search box. "/" focuses it; results appear after CFG-24 characters and a CFG-131 pause. */
function Search() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); box.current?.focus(); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    const text = q.trim();
    setError(null);
    if (text.length < MIN) { setRes(null); return; } // AC-P09-1: no search is sent
    const t = setTimeout(() => {
      searchApi.search(text).then((r) => { setRes(r); setOpen(true); }, (e) => { setError(errorText(e)); setOpen(true); }); // typing again retries
    }, PAUSE);
    return () => clearTimeout(t);
  }, [q]);
  const go = (t: Target) => { setOpen(false); setQ(''); openRecord(t); };
  const text = q.trim();
  return (
    <div className="relative w-full max-w-[520px]">
      <input ref={box} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder="Search leads, customers, family members ( / )" aria-label="Search"
        className="w-full rounded border border-rule bg-sheet px-3 py-1.5 text-[0.875rem] outline-none focus:border-ink-soft" />
      {open && text.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-30 mt-1 max-h-[70vh] overflow-y-auto rounded border border-rule bg-sheet p-2 text-[0.875rem] shadow-lg">
          {text.length < MIN ? <p className="px-2 py-1 text-muted">Type at least {MIN} characters to search.</p>
            : error ? <p className="px-2 py-1 text-bad">{error}</p>
            : !res ? <p className="px-2 py-1 text-muted">Searching…</p>
            : res.count === 0 ? <p className="px-2 py-1 text-muted">{res.message}</p>
            : res.groups.filter((g) => g.items.length).map((g) => (
              <div key={g.group} className="mb-2">
                <div className="px-2 py-1 text-[0.75rem] font-semibold tracking-wide text-muted uppercase">{GROUP_LABEL[g.group] ?? g.group}</div>
                {g.items.map((i) => (
                  <button key={`${i.type}-${i.id}`} type="button" className="flex w-full items-baseline justify-between gap-3 rounded px-2 py-1.5 text-left hover:bg-rule/40"
                    onClick={() => go(i.open.type === 'CUSTOMER' ? { type: 'CUSTOMER', id: i.open.id, ...(i.open.tab ? { tab: i.open.tab as 'family' } : {}) } : { type: 'LEAD', id: i.open.id })}>
                    <span><span className="font-medium">{i.title}</span> <span className="text-muted">{i.subtitle}</span></span>
                    {!/^(ACTIVE|NEW|CONTACTED|QUALIFIED|FOLLOW_UP)$/.test(i.status) && <span className="text-[0.75rem] text-muted">{i.status}</span>}
                  </button>
                ))}
                {g.more && <button type="button" className="px-2 py-1 text-[0.8125rem] underline" onClick={() => go({ type: 'LIST', list: g.group === 'LEADS' ? 'LEADS' : 'CUSTOMERS', filter: { search: text } })}>See all</button>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/** P-10: the bell. Count of UNREAD items (CFG-149 "99+"); select an item to mark it read and open its record. */
function Bell() {
  const [count, setCount] = useState<Count>({ unread: 0, shown: '0' });
  const [items, setItems] = useState<BellItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = () => bellApi.count().then(setCount, () => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  async function show() {
    setOpen(!open); setError(null);
    if (!open) try { const r = await bellApi.list(); setItems(r.items); setCount({ unread: r.unread, shown: r.shown }); } catch (e) { setError(errorText(e)); }
  }
  async function select(i: BellItem) {
    setError(null);
    try {
      const r = await bellApi.open(i.id);
      setCount({ unread: r.unread, shown: r.shown });
      setItems((xs) => xs?.map((x) => (x.id === i.id ? { ...x, read: true } : x)) ?? null);
      if (r.link) { setOpen(false); openRecord(r.link.type === 'TASK' ? { type: 'TASK', id: r.link.id } : r.link.type === 'LEAD' ? { type: 'LEAD', id: r.link.id } : r.link.type === 'CUSTOMER' ? { type: 'CUSTOMER', id: r.link.id } : r.link.type === 'KYC_REVIEW' ? { type: 'KYC_REVIEW', id: r.link.id } : { type: 'PROFILE', id: r.link.id }); }
    } catch (e) {
      setItems((xs) => xs?.map((x) => (x.id === i.id ? { ...x, read: true } : x)) ?? null); // AC-P10-4: read, with GEN-11
      setError(errorText(e)); bellApi.count().then(setCount, () => undefined);
    }
  }
  async function readAll() {
    try { const r = await bellApi.readAll(); setCount({ unread: r.unread, shown: r.shown }); setItems((xs) => xs?.map((x) => ({ ...x, read: true })) ?? null); } catch (e) { setError(errorText(e)); }
  }
  return (
    <div className="relative">
      <button type="button" onClick={() => void show()} aria-label={`Notifications, ${count.unread} unread`} className="relative rounded border border-rule bg-sheet px-3 py-1.5 text-[0.875rem]">
        Bell{count.unread > 0 && <span className="ml-2 rounded-full bg-bad px-1.5 py-0.5 text-[0.7rem] font-semibold text-white">{count.shown}</span>}
      </button>
      {open && (
        <div className="absolute top-full right-0 z-30 mt-1 w-[380px] max-w-[90vw] rounded border border-rule bg-sheet p-2 text-[0.875rem] shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="font-semibold">Notifications</span>
            {count.unread > 0 && <button type="button" className="text-[0.8125rem] underline" onClick={() => void readAll()}>Mark all as read</button>}
          </div>
          {error && <p className="px-2 py-1 text-bad">{error}</p>}
          {!items ? <p className="px-2 py-1 text-muted">Loading…</p> : items.length === 0 ? <p className="px-2 py-1 text-muted">No notifications.</p> : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {items.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => void select(i)} className={`w-full rounded px-2 py-2 text-left hover:bg-rule/40 ${i.read ? 'text-muted' : 'font-medium'}`}>
                    {!i.read && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-bad align-middle" aria-label="unread" />}
                    {i.message}
                    <div className="text-[0.75rem] font-normal text-muted">{fmtDateTime(i.createdAt)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-rule px-[clamp(20px,4vw,56px)] py-2.5">
      <Search />
      <Bell />
    </div>
  );
}