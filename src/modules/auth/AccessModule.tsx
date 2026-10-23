import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { authApi, type SessionInfo } from '../../api/auth';
import { errorText, fieldErrors, newKey } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../ui/Button';
import { CheckList } from '../../ui/CheckList';
import { Field, fmtDate, fmtDateTime, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';
import { AUTH_CHECKS } from './checks';

const section = 'max-w-[880px] border-t border-rule py-6';
const sectionTitle = 'mb-3.5 text-lg leading-tight font-semibold';
const th = 'border-b border-rule py-2 pr-3 text-left font-semibold text-muted';
const td = 'border-b border-rule py-3 pr-3 align-top';

/** P-04: OTP to the current number, then OTP to the new number. */
function ChangeMobile({ onDone }: { onDone: (msg: string) => void }) {
  const [step, setStep] = useState<'start' | 'current' | 'new' | 'verifyNew'>('start');
  const [code, setCode] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [token, setToken] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null); setFields({});
    try { await fn(); }
    catch (e) { const f = fieldErrors(e); setFields(f); if (!Object.keys(f).length) setError(errorText(e)); setCode(''); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid max-w-[420px] gap-3.5">
      {info && <Notice>{info}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {step === 'start' && <div><Button onClick={() => run(async () => { setInfo((await authApi.currentMobileOtp()).message); setStep('current'); })}>Change mobile number</Button></div>}
      {(step === 'current' || step === 'verifyNew') && (
        <form className="grid gap-3" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(async () => {
          if (step === 'current') { setToken((await authApi.currentMobileVerify(code)).changeToken); setInfo('Current number verified. Enter the new number.'); setStep('new'); }
          else { const r = await authApi.newMobileVerify(token, newMobile, code, key.current); setStep('start'); setInfo(null); onDone(r.meta.message ?? 'Mobile changed.'); }
          setCode('');
        }); }}>
          <Field label={step === 'current' ? 'OTP sent to your current number' : 'OTP sent to the new number'} required error={fields.code}>
            <input className={`${inputClass} font-mono tracking-[0.3em]`} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
          </Field>
          <div><Button type="submit" variant="primary" disabled={busy || !code}>{busy ? 'Verifying…' : 'Verify'}</Button></div>
        </form>
      )}
      {step === 'new' && (
        <form className="grid gap-3" onSubmit={(e: FormEvent) => { e.preventDefault(); void run(async () => { setInfo((await authApi.newMobileOtp(token, newMobile)).message); setStep('verifyNew'); }); }}>
          <Field label="New mobile number" required error={fields.newMobile}>
            <input className={inputClass} value={newMobile} onChange={(e) => setNewMobile(e.target.value)} inputMode="tel" />
          </Field>
          <div><Button type="submit" variant="primary" disabled={busy || !newMobile}>Send OTP to new number</Button></div>
        </form>
      )}
    </div>
  );
}

export function AccessModule() {
  const { user, signOut, reload } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setSessions(await authApi.sessions()); } catch (e) { setMessage(errorText(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!user) return null;
  const sub = user.subscription;

  return (
    <main className="overflow-y-auto px-[clamp(20px,4vw,56px)] pt-9 pb-16">
      <header className="mb-7 max-w-[68ch]">
        <h1 className="text-[1.9rem] leading-tight font-bold tracking-[-0.01em]">Access and sessions</h1>
        <p className="mt-2 text-ink-soft">Section 5: OTP sign-in (no passwords), sessions and devices, changing the registered mobile.</p>
      </header>
      {message && <Notice>{message}</Notice>}

      <section className={section}>
        <h2 className={sectionTitle}>Signed in as</h2>
        <dl className="mb-[18px] grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5">
          <dt className="text-muted">Name</dt><dd>{user.name}</dd>
          <dt className="text-muted">Mobile</dt><dd>{user.mobile}</dd>
          <dt className="text-muted">Role</dt><dd>{user.roleLabel} <span className="font-mono text-muted">({user.role})</span>{user.advisorName && <span className="text-muted"> · works for {user.advisorName}</span>}</dd>
          {sub && (<><dt className="text-muted">Subscription</dt><dd>{sub.status}{sub.plan ? ` · ${sub.plan}` : ' · no plan chosen'} · ends {fmtDate(sub.endsAt)} ({sub.daysLeft} days){user.readOnly && <span className="ml-2 text-bad">read-only</span>}</dd></>)}
          {user.profile && (<><dt className="text-muted">Profile</dt><dd>KYC {user.profile.kycStatus} · {user.profile.completionPct}% complete <span className="text-muted">(P-05 to P-07 not built yet)</span></dd></>)}
          <dt className="text-muted">Capabilities</dt><dd className="font-mono text-[0.8rem]">{user.capabilities.join(', ') || '—'}</dd>
        </dl>
        <div className="flex flex-wrap gap-2.5">
          <Button onClick={() => reload()}>Reload</Button>
          <Button variant="danger" onClick={() => signOut()}>Log out</Button>
        </div>
      </section>

      <section className={section}>
        <h2 className={sectionTitle}>Active sessions</h2>
        {sessions === null ? <p className="text-muted">Loading sessions…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[0.8125rem]">
              <thead><tr><th className={th}>Device</th><th className={th}>First sign-in</th><th className={th}>Last active</th><th className={th}><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className={td}>{s.device}{s.current && <span className="ml-2 rounded-full bg-ok-tint px-2 py-0.5 text-[0.75rem] text-ok">This device</span>}<div className="text-muted">{s.client === 'APP' ? 'App' : 'Web'} · {s.ip ?? 'IP unknown'}</div></td>
                    <td className={td}>{fmtDateTime(s.startedAt)}</td>
                    <td className={td}>{fmtDateTime(s.lastActiveAt)}</td>
                    <td className={td}>{!s.current && <Button variant="link" onClick={async () => { setMessage((await authApi.endSession(s.id)).meta.message ?? null); await load(); }}>End session</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={section}>
        <h2 className={sectionTitle}>Registered mobile</h2>
        <ChangeMobile onDone={(m) => { setMessage(m); void reload(); void load(); }} />
      </section>

      <CheckList checks={AUTH_CHECKS} />
    </main>
  );
}
