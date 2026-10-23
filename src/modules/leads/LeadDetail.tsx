import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, errorText, fieldErrors, newKey, warningsOf } from '../../api/client';
import { customersApi } from '../../api/customers';
import { STATUS_LABEL, leadsApi, type Lead, type LeadStatus, type Pipeline } from '../../api/leads';
import { PRIORITY_LABEL } from '../../api/reference';
import { useReference } from '../../api/useReference';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../ui/Button';
import { Field, Warnings, fmtDateTime, fromIstInput, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';
import { LeadForm } from './LeadForm';
import { StatusPill } from './StatusPill';

/** P-14: exact duplicate → only "Link"; same mobile, other name → Link or Create new (CU-03). */
function ConvertPanel({ lead, onDone, onCancel }: { lead: Lead; onDone: (msg?: string) => void; onCancel: () => void }) {
  const ref = useReference();
  const [matches, setMatches] = useState<{ exact: { id: string; number: string; name: string } | null; sameMobile: Array<{ id: string; number: string; name: string }> } | null>(null);
  const [choice, setChoice] = useState('CREATE');
  const [extra, setExtra] = useState({ email: lead.email ?? '', dob: '', gender: '', city: '', state: '', pin: '', occupation: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Array<{ messageId: string; message: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());

  useEffect(() => {
    customersApi.duplicates(lead.mobile, lead.name).then((m) => { setMatches(m); if (m.exact) setChoice(`LINK:${m.exact.id}`); }).catch(() => setMatches({ exact: null, sameMobile: [] }));
  }, [lead.mobile, lead.name]);

  async function submit(confirm: string[] = []) {
    setBusy(true); setError(null); setFields({});
    const link = choice.startsWith('LINK:');
    const customer = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== ''));
    try {
      const r = await leadsApi.convert(lead.id, { version: lead.version, mode: link ? 'LINK' : 'CREATE', ...(link ? { customerId: choice.slice(5) } : { customer }), confirm }, key.current);
      onDone(r.meta.message);
    } catch (err) {
      const w = warningsOf(err);
      if (w.length) setWarnings(w); else { setFields(fieldErrors(err)); setError(errorText(err)); }
    } finally { setBusy(false); }
  }

  if (!matches || !ref) return <p className="text-muted">Checking for existing customers…</p>;
  const set = (k: keyof typeof extra) => (e: { target: { value: string } }) => setExtra({ ...extra, [k]: e.target.value });
  return (
    <div className="grid gap-3 rounded border border-ok bg-ok-tint/40 p-4">
      <h4 className="font-semibold">Convert {lead.number} to a customer</h4>
      {matches.exact ? <p className="text-[0.875rem]">{matches.exact.name} ({matches.exact.number}) already has this name and mobile, so the only choice is to link.</p> : (
        <div className="grid gap-1.5 text-[0.875rem]">
          <label className="flex gap-2"><input type="radio" checked={choice === 'CREATE'} onChange={() => setChoice('CREATE')} />Create new customer from this lead</label>
          {matches.sameMobile.map((m) => <label key={m.id} className="flex gap-2"><input type="radio" checked={choice === `LINK:${m.id}`} onChange={() => setChoice(`LINK:${m.id}`)} />Link to {m.name} ({m.number}) — same mobile</label>)}
        </div>
      )}
      {matches.exact && <label className="flex gap-2 text-[0.875rem]"><input type="radio" checked readOnly />Link to {matches.exact.name}</label>}
      {choice === 'CREATE' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Email" error={fields['customer.email']}><input className={inputClass} value={extra.email} onChange={set('email')} /></Field>
          <Field label="Date of birth" error={fields['customer.dob']}><input className={inputClass} type="date" value={extra.dob} onChange={set('dob')} /></Field>
          <Field label="Gender"><select className={inputClass} value={extra.gender} onChange={set('gender')}><option value="">—</option>{ref.genders.map((g) => <option key={g} value={g}>{g.replace(/_/g, ' ').toLowerCase()}</option>)}</select></Field>
          <Field label="City" error={fields['customer.city']}><input className={inputClass} value={extra.city} onChange={set('city')} /></Field>
          <Field label="State"><select className={inputClass} value={extra.state} onChange={set('state')}><option value="">—</option>{ref.states.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="PIN code" error={fields['customer.pin']}><input className={inputClass} value={extra.pin} onChange={set('pin')} /></Field>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <Warnings items={warnings} busy={busy} onCancel={() => setWarnings([])} onConfirm={() => submit(warnings.map((w) => w.messageId))} />
      <div className="flex gap-2.5"><Button variant="primary" disabled={busy} onClick={() => submit()}>{busy ? 'Saving…' : 'Save customer'}</Button><Button onClick={onCancel}>Cancel</Button></div>
    </div>
  );
}

export function LeadDetail({ id, pipelines, onChanged }: { id: string; pipelines: Pipeline[]; onChanged: (message?: string) => void }) {
  const ref = useReference();
  const { user } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [mode, setMode] = useState<'view' | 'edit' | 'convert'>('view');
  const [move, setMove] = useState<LeadStatus | ''>('');
  const [extra, setExtra] = useState({ nextFollowUpAt: '', lostReason: '', note: '' });
  const [contact, setContact] = useState({ outcome: 'SPOKE_TO_CUSTOMER', note: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const moveKey = useRef(newKey());
  const contactKey = useRef(newKey());

  const load = useCallback(async () => { setLead(await leadsApi.get(id)); setStale(false); }, [id]);
  useEffect(() => { load().catch((e) => setError(errorText(e))); }, [load]);

  async function act(fn: () => Promise<{ meta: { message?: string } }>, after: () => void) {
    setBusy(true); setError(null); setFields({});
    try { const r = await fn(); after(); await load(); onChanged(r.meta.message); }
    catch (e) {
      setFields(fieldErrors(e));
      setError(errorText(e));
      if (e instanceof ApiError && (e.code === 'VERSION_CONFLICT' || e.code === 'INVALID_STATE')) setStale(true); // GR-11 / GR-19
    } finally { setBusy(false); }
  }

  if (!lead || !ref) return error ? <Notice tone="error">{error}</Notice> : <p className="mt-6 text-muted">Loading lead…</p>;
  if (mode === 'edit') return <div className="mt-6"><LeadForm lead={lead} pipelines={pipelines} onCancel={() => setMode('view')} onSaved={async (_l, m) => { setMode('view'); await load(); onChanged(m); }} /></div>;
  const closed = lead.status === 'CONVERTED';
  const readOnly = user?.readOnly;

  return (
    <section className="mt-6 grid gap-5 rounded border border-rule bg-sheet p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">{lead.name} <span className="font-mono text-[0.85rem] text-muted">{lead.number}</span></h3>
        <span className="flex gap-2"><StatusPill status={lead.status} /><span className="text-[0.8125rem] text-muted">{PRIORITY_LABEL[lead.priority]} priority</span></span>
      </div>
      {error && <Notice tone="error">{error}{stale && <> <Button variant="link" onClick={() => load()}>Reload latest</Button></>}</Notice>}

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-[0.875rem]">
        <dt className="text-muted">Pipeline</dt><dd>{lead.pipelineName}</dd>
        <dt className="text-muted">Mobile</dt><dd>{lead.mobile}{lead.altMobile && <span className="text-muted"> · alt {lead.altMobile}</span>}</dd>
        <dt className="text-muted">Email</dt><dd>{lead.email ?? '—'}</dd>
        <dt className="text-muted">Source</dt><dd>{lead.source}{lead.campaign && ` · ${lead.campaign}`}{lead.referredBy && ` · by ${lead.referredBy.name} (${lead.referredBy.number})`}{lead.referrer && ` · ${lead.referrer.name}`}</dd>
        <dt className="text-muted">Interests</dt><dd>{lead.interests.join(', ') || '—'}</dd>
        <dt className="text-muted">Next follow-up</dt><dd>{fmtDateTime(lead.nextFollowUpAt)}{lead.followUpTask && <span className="text-muted"> · task open</span>}</dd>
        <dt className="text-muted">Notes</dt><dd className="whitespace-pre-wrap">{lead.notes ?? '—'}</dd>
        {lead.lostReason && (<><dt className="text-muted">Lost because</dt><dd>{lead.lostReason}{lead.lostNote && ` — ${lead.lostNote}`}</dd></>)}
        {lead.customer && (<><dt className="text-muted">Customer</dt><dd>{lead.customer.name} ({lead.customer.number})</dd></>)}
      </dl>

      {closed && <p className="text-[0.875rem] text-muted">This lead has been converted. Open customer {lead.customer?.number} instead.</p>}
      {!closed && !readOnly && mode === 'convert' && <ConvertPanel lead={lead} onCancel={() => setMode('view')} onDone={async (m) => { setMode('view'); await load(); onChanged(m); }} />}

      {!closed && !readOnly && mode === 'view' && (
        <div className="grid gap-3 border-t border-rule pt-4">
          <div className="flex flex-wrap items-end gap-2.5">
            <Field label="Change status">
              <select className={inputClass} value={move} onChange={(e) => { setMove(e.target.value as LeadStatus); setFields({}); }}>
                <option value="">Choose…</option>
                {lead.allowedMoves.map((s) => <option key={s} value={s}>{lead.status === 'LOST' ? 'Reopen (Contacted)' : STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
            {lead.canConvert && <Button variant="primary" onClick={() => setMode('convert')}>Convert to customer</Button>}
            <Button onClick={() => setMode('edit')}>Edit details</Button>
          </div>
          {move && (
            <div className="grid gap-3 sm:grid-cols-2">
              {move === 'FOLLOW_UP' && <Field label="Next follow-up (IST)" required error={fields.nextFollowUpAt}><input className={inputClass} type="datetime-local" value={extra.nextFollowUpAt} onChange={(e) => setExtra({ ...extra, nextFollowUpAt: e.target.value })} /></Field>}
              {move === 'LOST' && <Field label="Reason" required error={fields.lostReason}><select className={inputClass} value={extra.lostReason} onChange={(e) => setExtra({ ...extra, lostReason: e.target.value })}><option value="">Choose…</option>{ref.lostReasons.map((r) => <option key={r}>{r}</option>)}</select></Field>}
              {(move === 'LOST' || lead.status === 'LOST') && <Field label="Note" required={lead.status === 'LOST' || extra.lostReason === 'Other'} error={fields.note}><input className={inputClass} value={extra.note} onChange={(e) => setExtra({ ...extra, note: e.target.value })} /></Field>}
              <div className="flex items-end"><Button variant={move === 'LOST' ? 'danger' : 'primary'} disabled={busy} onClick={() => {
                if (move === 'LOST' && !window.confirm(`Mark lead ${lead.number} as lost?`)) return; // GR-34
                void act(() => leadsApi.setStatus(lead.id, { version: lead.version, status: move, ...(extra.nextFollowUpAt ? { nextFollowUpAt: fromIstInput(extra.nextFollowUpAt) } : {}), ...(extra.lostReason ? { lostReason: extra.lostReason } : {}), ...(extra.note ? { note: extra.note } : {}) }, moveKey.current),
                  () => { setMove(''); setExtra({ nextFollowUpAt: '', lostReason: '', note: '' }); moveKey.current = newKey(); });
              }}>{busy ? 'Saving…' : 'Save status'}</Button></div>
            </div>
          )}
          <div className="grid gap-2.5 border-t border-rule pt-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
            <Field label="Log contact: outcome" required error={fields.outcome}>
              <select className={inputClass} value={contact.outcome} onChange={(e) => setContact({ ...contact, outcome: e.target.value })}>{ref.contactOutcomes.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>
            </Field>
            <Field label="Note" error={fields.note}><input className={inputClass} value={contact.note} onChange={(e) => setContact({ ...contact, note: e.target.value })} /></Field>
            <Button disabled={busy} onClick={() => act(() => leadsApi.logContact(lead.id, { outcome: contact.outcome, ...(contact.note ? { note: contact.note } : {}) }, contactKey.current), () => { setContact({ ...contact, note: '' }); contactKey.current = newKey(); })}>Log contact</Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 border-t border-rule pt-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-[0.9375rem] font-semibold">Contacts <span className="font-normal text-muted">(newest first)</span></h4>
          {lead.contacts.length ? <ol className="m-0 grid list-none gap-2.5 p-0">{lead.contacts.map((c) => (
            <li key={c.id} className="border-l-2 border-rule pl-3 text-[0.875rem]"><span className="font-medium">{c.outcomeLabel}</span>{c.note && <>: {c.note}</>}<div className="text-[0.8125rem] text-muted">{fmtDateTime(c.at)} · {c.by}</div></li>
          ))}</ol> : <p className="text-[0.875rem] text-muted">No contacts logged yet.</p>}
        </div>
        <div>
          <h4 className="mb-2 text-[0.9375rem] font-semibold">Stage history</h4>
          <ol className="m-0 grid list-none gap-2 p-0 text-[0.875rem]">{lead.stageHistory.map((h, i) => (
            <li key={i} className="border-l-2 border-rule pl-3">{h.fromLabel ? <>{h.fromLabel} → <span className="font-medium">{h.toLabel}</span></> : <>Created as <span className="font-medium">{h.toLabel}</span></>}
              <div className="text-[0.8125rem] text-muted">{fmtDateTime(h.at)} · {h.by}{h.reason && ` · ${h.reason}`}{h.note && ` · ${h.note}`}</div></li>
          ))}</ol>
        </div>
      </div>
    </section>
  );
}
