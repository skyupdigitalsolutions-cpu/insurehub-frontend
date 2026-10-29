import { useCallback, useEffect, useState } from 'react';
import { errorText } from '../../api/client';
import { STAGES, STATUS_LABEL, leadsApi, type LeadSummary, type Pipeline } from '../../api/leads';
import { PRIORITY_LABEL } from '../../api/reference';
import { useAuth } from '../../auth/AuthProvider';
import { useOpenRecord } from '../../shell/nav';
import { Button } from '../../ui/Button';
import { CheckList } from '../../ui/CheckList';
import { Tabs, fmtDateTime, inputClass, labelClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';
import { LeadDetail } from './LeadDetail';
import { LeadForm } from './LeadForm';
import { LEAD_CHECKS } from './checks';

/** Section 7: one board per pipeline (CFG-169), one column per stage (CFG-170). */
function Board() {
  const { user } = useAuth();
  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null);
  const [pipelineId, setPipelineId] = useState('');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [rows, setRows] = useState<LeadSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  useOpenRecord((t) => t.type === 'LEAD' || (t.type === 'LIST' && t.list === 'LEADS'), (t) => {
    if (t.type === 'LEAD') { setSelected(t.id); return; }
    if (t.type !== 'LIST') return;
    const fl = t.filter ?? {};
    if (typeof fl.search === 'string') setSearch(fl.search);
    if (fl.create) setCreating(true);
  });
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPipelines = useCallback(async () => {
    const p = await leadsApi.pipelines();
    setPipelines(p);
    setPipelineId((cur) => cur || p[0]?.id || '');
  }, []);
  const load = useCallback(async () => {
    if (!pipelineId) return;
    try { setRows((await leadsApi.list({ pipelineId, search: search || undefined, priority: priority || undefined, limit: 100 })).data); setError(null); }
    catch (e) { setError(errorText(e)); }
  }, [pipelineId, search, priority]);
  useEffect(() => { loadPipelines().catch((e) => setError(errorText(e))); }, [loadPipelines]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const refresh = async (m?: string) => { if (m) setMessage(m); await Promise.all([load(), loadPipelines()]); };

  if (!pipelines) return error ? <Notice tone="error">{error}</Notice> : <p className="text-muted">Loading pipelines…</p>;
  return (
    <div>
      {message && <Notice>{message}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <Tabs tabs={pipelines.map((p) => [p.id, `${p.name} (${Object.values(p.counts).reduce((a, b) => a + b, 0)})`] as [string, string])} active={pipelineId} onChange={(id) => { setPipelineId(id); setSelected(null); }} />
      {creating ? (
        <div className="mb-6"><LeadForm pipelines={pipelines} defaultPipelineId={pipelineId} onCancel={() => setCreating(false)} onSaved={async (l, m) => { setCreating(false); setSelected(l.id); setPipelineId(l.pipelineId); await refresh(m); }} /></div>
      ) : (
        <div className="mb-4 flex flex-wrap items-end gap-2.5">
          <label className={`${labelClass} min-w-56 grow`}>Search<input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, number, mobile or email" /></label>
          <label className={labelClass}>Priority<select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">All</option>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {!user?.readOnly && <Button variant="primary" onClick={() => { setCreating(true); setMessage(null); }}>+ Lead</Button>}
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="grid min-w-[1080px] grid-cols-6 gap-2.5">
          {STAGES.map((s) => (
            <div key={s} className="rounded bg-tray p-2">
              <div className="mb-2 flex justify-between text-[0.8125rem] font-semibold"><span>{STATUS_LABEL[s]}</span><span className="text-muted">{rows.filter((r) => r.status === s).length}</span></div>
              <ol className="m-0 grid list-none gap-1.5 p-0">
                {rows.filter((r) => r.status === s).map((l) => (
                  <li key={l.id}>
                    <button onClick={() => { setSelected(l.id); setMessage(null); }} className={`w-full cursor-pointer rounded border bg-sheet p-2 text-left text-[0.8125rem] ${selected === l.id ? 'border-ink' : 'border-rule hover:border-ink-soft'}`}>
                      <div className="font-medium">{l.name}</div>
                      <div className="font-mono text-[0.72rem] text-muted">{l.number}</div>
                      {l.nextFollowUpAt && <div className="text-[0.72rem] text-focus">Follow up {fmtDateTime(l.nextFollowUpAt)}</div>}
                      {l.priority === 'HIGH' && <div className="text-[0.72rem] text-bad">High priority</div>}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
      {selected && <LeadDetail key={selected} id={selected} pipelines={pipelines} onChanged={refresh} />}
    </div>
  );
}

export function LeadsModule() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'leads' | 'checks'>('leads');
  return (
    <main className="overflow-y-auto px-[clamp(20px,4vw,56px)] pt-9 pb-16">
      <header className="mb-6 max-w-[68ch]">
        <h1 className="text-[1.9rem] leading-tight font-bold tracking-[-0.01em]">Leads</h1>
        <p className="mt-2 text-ink-soft">P-12 to P-14. A lead is converted to a customer before any quotation. No lead assignment: one account has one advisor.</p>
      </header>
      <Tabs tabs={[['leads', 'Pipelines'], ['checks', 'Backend checks']]} active={tab} onChange={setTab} />
      {tab === 'checks' ? <CheckList checks={LEAD_CHECKS} intro="Each check uses a throwaway advisor account, so it never touches your own leads." />
        : can('leads.work') ? <Board /> : <Notice tone="error">You need a support grant from this advisor to open client details.</Notice>}
    </main>
  );
}