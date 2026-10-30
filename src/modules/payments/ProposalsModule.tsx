import { useCallback, useEffect, useState } from 'react';
import { errorText, fieldErrors } from '../../api/client';
import { proposalsApi, type Answer, type Nominee, type ProposalView } from '../../api/payments';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../ui/Button';
import { inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';

const th = 'border-b border-rule py-2 pr-3 text-left text-[0.8125rem] font-semibold text-muted';
const td = 'border-b border-rule py-2 pr-3 align-top';

/** P-55: members (locked), declarations, nominees, the submit checklist; only the advisor submits. */
function Proposal({ start, onChanged }: { start: ProposalView; onChanged: () => void }) {
  const { can } = useAuth();
  const [p, setP] = useState(start);
  const [decl, setDecl] = useState(start.declarations);
  const [noms, setNoms] = useState<Nominee[]>(start.nominees);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = async () => setP(await proposalsApi.get(p.id));
  useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const draft = p.status === 'DRAFT';
  const answer = (member: string, q: string): Answer | undefined => decl.find((d) => d.member === member)?.answers[q];
  const setAnswer = (member: string, q: string, a: Partial<Answer>) => {
    const cur = decl.find((d) => d.member === member) ?? { member, answers: {} };
    const next = { ...cur, answers: { ...cur.answers, [q]: { ...(cur.answers[q] ?? { answer: false }), ...a } } };
    setDecl([...decl.filter((d) => d.member !== member), next]);
  };
  async function run(fn: () => Promise<unknown>) {
    setErrors({}); setError(null); setMessage(null);
    try { const r = (await fn()) as { meta?: { message?: string } } | ProposalView; if (r && 'meta' in r && r.meta?.message) setMessage(r.meta.message); await reload(); onChanged(); }
    catch (e) { setErrors(fieldErrors(e)); setError(errorText(e)); }
  }
  const save = () => run(async () => { const u = await proposalsApi.save(p.id, { version: p.version, declarations: decl, nominees: noms }); setP(u); setMessage('Saved.'); });
  return (
    <section className="mb-6 rounded border border-rule bg-sheet p-4 text-[0.875rem]">
      <div className="mb-3 flex flex-wrap items-baseline gap-3"><h3 className="font-mono font-semibold">{p.number}</h3><span className="font-medium">{p.status}</span>{p.declineReason && <span className="text-muted">Declined: {p.declineReason}</span>}</div>
      <h4 className="font-semibold">Covered members</h4>
      <p className="text-muted">Covered members are locked for this proposal. Revise the quotation to change them.</p>
      <ul className="mb-3 list-disc pl-5">{p.members.map((m) => <li key={m.name}>{m.name} ({m.relationship}, {m.age})</li>)}</ul>
      <h4 className="font-semibold">Health declaration</h4>
      <div className="overflow-x-auto"><table className="mb-2 w-full"><thead><tr><th className={th}>Question</th>{p.members.map((m) => <th key={m.name} className={th}>{m.name}</th>)}</tr></thead>
        <tbody>{p.questions.map((q) => <tr key={q}><td className={td}>{q}</td>{p.members.map((m) => { const a = answer(m.name, q); return (
          <td key={m.name} className={td}>
            <select disabled={!draft} className={`${inputClass} py-1`} value={a === undefined ? '' : a.answer ? 'yes' : 'no'} onChange={(e) => setAnswer(m.name, q, { answer: e.target.value === 'yes' })}><option value="">—</option><option value="no">No</option><option value="yes">Yes</option></select>
            {a?.answer && <div className="mt-1 grid gap-1"><input disabled={!draft} className={`${inputClass} py-1`} placeholder="Condition" value={a.condition ?? ''} onChange={(e) => setAnswer(m.name, q, { condition: e.target.value })} /><input disabled={!draft} className={`${inputClass} py-1`} placeholder="Since when" value={a.since ?? ''} onChange={(e) => setAnswer(m.name, q, { since: e.target.value })} /><input disabled={!draft} className={`${inputClass} py-1`} placeholder="Current treatment" value={a.treatment ?? ''} onChange={(e) => setAnswer(m.name, q, { treatment: e.target.value })} /></div>}
          </td>); })}</tr>)}</tbody></table></div>
      {p.warning && <div className="mb-3"><Notice tone="warn">{p.warning.message}</Notice></div>}
      <h4 className="font-semibold">Nominees for this policy</h4>
      {noms.map((n, i) => (
        <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_0.6fr_1.4fr_1fr_auto]">
          <input disabled={!draft} className={inputClass} placeholder="Name" value={n.name} onChange={(e) => setNoms(noms.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input disabled={!draft} className={inputClass} placeholder="Relationship" value={n.relationship} onChange={(e) => setNoms(noms.map((x, j) => (j === i ? { ...x, relationship: e.target.value } : x)))} />
          <input disabled={!draft} className={inputClass} placeholder="DOB DD-MM-YYYY" value={n.dob} onChange={(e) => setNoms(noms.map((x, j) => (j === i ? { ...x, dob: e.target.value } : x)))} />
          <input disabled={!draft} className={inputClass} placeholder="%" value={n.share || ''} onChange={(e) => setNoms(noms.map((x, j) => (j === i ? { ...x, share: Number(e.target.value || 0) } : x)))} />
          <input disabled={!draft} className={inputClass} placeholder="Appointee name (minor)" value={n.appointee?.name ?? ''} onChange={(e) => setNoms(noms.map((x, j) => (j === i ? { ...x, appointee: e.target.value ? { name: e.target.value, dob: x.appointee?.dob ?? '' } : null } : x)))} />
          <input disabled={!draft} className={inputClass} placeholder="Appointee DOB" value={n.appointee?.dob ?? ''} onChange={(e) => setNoms(noms.map((x, j) => (j === i ? { ...x, appointee: { name: x.appointee?.name ?? '', dob: e.target.value } } : x)))} />
          {draft && <Button onClick={() => setNoms(noms.filter((_, j) => j !== i))}>Remove</Button>}
        </div>
      ))}
      {Object.entries(errors).filter(([k]) => k.startsWith('nominees')).map(([k, v]) => <p key={k} className="text-bad">{v}</p>)}
      {draft && <div className="mb-3 flex gap-2"><Button onClick={() => setNoms([...noms, { name: '', relationship: '', dob: '', share: 0 }])}>+ Nominee</Button><Button variant="primary" onClick={() => void save()}>Save</Button></div>}
      {p.readiness && <>
        <h4 className="font-semibold">Before submitting</h4>
        <ul className="mb-3 pl-1">
          <li>{p.readiness.kyc ? '✓ Aadhaar and PAN confirmed in the vault' : '✗ Aadhaar and PAN not confirmed in the vault'}</li>
          <li>{p.readiness.paid ? `✓ Premium paid ₹${p.readiness.paid.amount.toLocaleString('en-IN')} by ${p.readiness.paid.mode}, ${p.readiness.paid.label}` : '✗ No payment recorded'}</li>
          {p.readiness.problems.map((x, i) => <li key={i} className="text-bad">✗ {x.message}</li>)}
        </ul>
      </>}
      <div className="flex flex-wrap gap-2">
        {draft && can('proposals.submit') && <Button variant="primary" disabled={!!p.readiness?.problems.length} onClick={() => void run(() => proposalsApi.submit(p.id, p.version))}>Submit</Button>}
        {p.status === 'SUBMITTED' && can('proposals.submit') && <Button onClick={() => { const why = window.prompt('Why did the insurer decline?'); if (why) void run(() => proposalsApi.decline(p.id, p.version, why)); }}>Mark declined</Button>}
      </div>
      {message && <div className="mt-3"><Notice>{message}</Notice></div>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}

export function ProposalsModule() {
  const [rows, setRows] = useState<ProposalView[] | null>(null);
  const [open, setOpen] = useState<ProposalView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { proposalsApi.list().then(setRows, (e) => setError(errorText(e))); }, []);
  useEffect(load, [load]);
  return (
    <main className="overflow-y-auto px-[clamp(20px,4vw,56px)] pt-7 pb-16">
      <header className="mb-5 max-w-[68ch]">
        <h1 className="text-[1.9rem] leading-tight font-bold tracking-[-0.01em]">Payments and proposals</h1>
        <p className="mt-2 text-ink-soft">Record payments on the quotation (Quotations → Open → Payment), then Start proposal. Here: declarations, nominees and the checklist. Only the advisor submits; then submit on the insurer's portal.</p>
      </header>
      {error && <Notice tone="error">{error}</Notice>}
      {open && <Proposal key={open.id} start={open} onChanged={load} />}
      {!rows ? <p className="text-muted">Loading…</p> : rows.length === 0 ? <p className="text-muted">No proposals yet.</p> : (
        <table className="w-full text-[0.875rem]"><thead><tr><th className={th}>Proposal</th><th className={th}>Status</th><th className={th}>Members</th><th className={th} /></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td className={`${td} font-mono`}>{r.number}</td><td className={td}>{r.status}</td><td className={td}>{r.members.map((m) => m.name).join(', ')}</td><td className={td}><Button onClick={() => setOpen(r)}>Open</Button></td></tr>)}</tbody></table>
      )}
    </main>
  );
}