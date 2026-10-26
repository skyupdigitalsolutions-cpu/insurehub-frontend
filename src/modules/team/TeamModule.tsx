import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { errorText, fieldErrors, newKey } from '../../api/client';
import { teamApi, type TeamUser } from '../../api/team';
import { useAuth } from '../../auth/AuthProvider';
import { useStepUp } from '../../auth/StepUp';
import { Button } from '../../ui/Button';
import { CheckList } from '../../ui/CheckList';
import { Field, Tabs, fmtDateTime, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';
import { TEAM_CHECKS } from './checks';

const th = 'border-b border-rule py-2 pr-3 text-left font-semibold text-muted';
const td = 'border-b border-rule py-2.5 pr-3 align-top';
const statusTone: Record<string, string> = { ACTIVE: 'bg-ok-tint text-ok', INVITED: 'bg-warn-tint text-warn', DISABLED: 'bg-bad-tint text-bad' };
const Pill = ({ s }: { s: string }) => <span className={`rounded-full px-2 py-0.5 text-[0.75rem] ${statusTone[s] ?? ''}`}>{s}</span>;

/** Add form shared by both lists: the action needs the step-up OTP (CFG-83). */
function AddUser({ withRole, onAdd }: { withRole: boolean; onAdd: (b: { name: string; mobile: string; role: 'STF' | 'ADM' }, token: string, key: string) => Promise<string | undefined> }) {
  const requestStepUp = useStepUp();
  const [form, setForm] = useState({ name: '', mobile: '', role: 'STF' as 'STF' | 'ADM' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setFields({});
    try {
      const token = await requestStepUp();
      await onAdd(form, token, key.current);
      key.current = newKey();
      setForm({ name: '', mobile: '', role: 'STF' });
    } catch (err) {
      if (err instanceof Error && err.message === 'Step-up cancelled') return;
      const f = fieldErrors(err); setFields(f); if (!Object.keys(f).length) setError(errorText(err));
    } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="mb-5 grid gap-3 rounded border border-rule bg-sheet p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
      <Field label="Name" required error={fields.name}><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Mobile" required error={fields.mobile}><input className={inputClass} value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} inputMode="tel" /></Field>
      {withRole && (
        <Field label="Role" required>
          <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'STF' | 'ADM' })}>
            <option value="STF">SkyUp Staff</option><option value="ADM">SkyUp Admin</option>
          </select>
        </Field>
      )}
      <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Adding…' : 'Add (OTP)'}</Button>
      {error && <div className="sm:col-span-4"><Notice tone="error">{error}</Notice></div>}
    </form>
  );
}

function Assistants() {
  const { user } = useAuth();
  const [data, setData] = useState<{ items: TeamUser[]; limit: number; planAllows: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setData(await teamApi.assistants()); } catch (e) { setError(errorText(e)); } }, []);
  useEffect(() => { void load(); }, [load]);

  async function toggle(u: TeamUser) {
    const enable = u.status === 'DISABLED';
    if (!enable && !window.confirm(`Disable assistant ${u.name}? They will be signed out at once.`)) return; // GR-34
    try { setMessage((await teamApi.setAssistant(u.id, enable, u.version)).meta.message ?? null); setError(null); await load(); }
    catch (e) { setError(errorText(e)); await load(); }
  }

  return (
    <>
      <p className="mb-4 max-w-[68ch] text-ink-soft">P-53: assistants do data entry in your account. They cannot mark leads lost, deactivate customers, see full PAN or Aadhaar, or manage assistants. Premium plan or trial, up to {data?.limit ?? '…'} (CFG-158).</p>
      {data && !data.planAllows && <Notice tone="warn">Assistant users are available on the Premium plan.</Notice>}
      {message && <Notice>{message}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {!user?.readOnly && <AddUser withRole={false} onAdd={async (b, token, key) => { const r = await teamApi.addAssistant({ name: b.name, mobile: b.mobile }, token, key); setMessage(r.meta.message ?? null); setError(null); await load(); return r.meta.message; }} />}
      {data && (data.items.length === 0 ? <p className="text-muted">No assistants yet.</p> : (
        <table className="w-full border-collapse text-[0.8125rem]">
          <thead><tr><th className={th}>Assistant</th><th className={th}>Status</th><th className={th}>Last login</th><th className={th}>Recent actions</th><th className={th} /></tr></thead>
          <tbody>{data.items.map((u) => (
            <tr key={u.id}>
              <td className={td}><span className="font-medium">{u.name}</span><div className="text-muted">{u.mobile}</div></td>
              <td className={td}><Pill s={u.status} /></td>
              <td className={td}>{fmtDateTime(u.lastLoginAt)}</td>
              <td className={td}>{u.recentActions?.length ? <ul className="m-0 list-none p-0">{u.recentActions.slice(0, 3).map((a, i) => <li key={i} className="text-muted">{a.action}{a.entityRef ? ` · ${a.entityRef}` : ''}</li>)}</ul> : '—'}</td>
              <td className={td}><Button variant={u.status === 'DISABLED' ? 'default' : 'danger'} onClick={() => toggle(u)}>{u.status === 'DISABLED' ? 'Enable' : 'Disable'}</Button></td>
            </tr>))}
          </tbody>
        </table>
      ))}
    </>
  );
}

function SkyUpUsers() {
  const { user } = useAuth();
  const requestStepUp = useStepUp();
  const [rows, setRows] = useState<TeamUser[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setRows(await teamApi.staff()); } catch (e) { setError(errorText(e)); } }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(fn: (token: string) => Promise<{ meta: { message?: string } }>) {
    try { const token = await requestStepUp(); setMessage((await fn(token)).meta.message ?? null); setError(null); }
    catch (e) { if (!(e instanceof Error && e.message === 'Step-up cancelled')) setError(errorText(e)); }
    await load();
  }

  return (
    <>
      <p className="mb-4 max-w-[68ch] text-ink-soft">P-48: SkyUp Staff and Admins. Every change needs the extra OTP. A role change or disable signs the user out at once. At least one SkyUp Admin must stay active.</p>
      {message && <Notice>{message}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <AddUser withRole onAdd={async (b, token, key) => { const r = await teamApi.addStaff(b, token, key); setMessage(r.meta.message ?? null); setError(null); await load(); return r.meta.message; }} />
      {rows && (
        <table className="w-full border-collapse text-[0.8125rem]">
          <thead><tr><th className={th}>User</th><th className={th}>Role</th><th className={th}>Status</th><th className={th}>Last login</th><th className={th} /></tr></thead>
          <tbody>{rows.map((u) => {
            // ADM-03: nobody can change or disable their own access, so the controls are not shown on
            // your own row (GR-18: hide what you cannot use). The API refuses it too.
            const isMe = u.id === user?.id;
            const roleLabel = u.role === 'ADM' ? 'SkyUp Admin' : 'SkyUp Staff';
            return (
            <tr key={u.id}>
              <td className={td}><span className="font-medium">{u.name}</span>{isMe && <span className="text-muted"> (you)</span>}<div className="text-muted">{u.mobile}</div></td>
              <td className={td}>
                {isMe ? <span>{roleLabel}</span> : (
                  <select className={inputClass} value={u.role} onChange={(e) => {
                    const next = e.target.value as 'STF' | 'ADM';
                    const nextLabel = next === 'ADM' ? 'SkyUp Admin' : 'SkyUp Staff';
                    // GR-34: a role change signs the person out, so confirm first.
                    if (!window.confirm(`Change ${u.name} from ${roleLabel} to ${nextLabel}? They will be signed out at once and get the new role at their next login.`)) {
                      e.target.value = u.role;
                      return;
                    }
                    void act((t) => teamApi.setStaffRole(u.id, next, u.version, t));
                  }}>
                    <option value="STF">SkyUp Staff</option><option value="ADM">SkyUp Admin</option>
                  </select>
                )}
              </td>
              <td className={td}><Pill s={u.status} /></td>
              <td className={td}>{fmtDateTime(u.lastLoginAt)}</td>
              <td className={td}>{isMe
                ? <span className="text-[0.8125rem] text-muted">Only another SkyUp Admin can change your access.</span>
                : <Button variant={u.status === 'DISABLED' ? 'default' : 'danger'}
                    onClick={() => (u.status === 'DISABLED' || window.confirm(`Disable ${u.name}? They will be signed out at once.`)) && act((t) => teamApi.setStaff(u.id, u.status === 'DISABLED', u.version, t))}>
                    {u.status === 'DISABLED' ? 'Enable' : 'Disable'}</Button>}</td>
            </tr>
            );
          })}
          </tbody>
        </table>
      )}
    </>
  );
}

export function TeamModule() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'team' | 'checks'>('team');
  return (
    <main className="overflow-y-auto px-[clamp(20px,4vw,56px)] pt-9 pb-16">
      <header className="mb-6 max-w-[68ch]">
        <h1 className="text-[1.9rem] leading-tight font-bold tracking-[-0.01em]">Team and access</h1>
        <p className="mt-2 text-ink-soft">v3.2 has six fixed roles (Section 3.1–3.2); there are no custom roles. Advisors manage assistants; SkyUp Admins manage SkyUp users.</p>
      </header>
      <Tabs tabs={[['team', can('staff.manage') ? 'SkyUp users' : 'Assistants'], ['checks', 'Backend checks']]} active={tab} onChange={setTab} />
      {tab === 'checks' ? <CheckList checks={TEAM_CHECKS} intro="Most checks create throwaway advisor accounts and assistants. The last two need you signed in as the seeded SkyUp Admin." />
        : can('assistants.manage') ? <Assistants /> : can('staff.manage') ? <SkyUpUsers />
          : <Notice tone="warn">Your role has no team management. Advisors manage assistants (P-53); SkyUp Admins manage SkyUp users (P-48).</Notice>}
    </main>
  );
}