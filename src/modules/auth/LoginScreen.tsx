import { useEffect, useRef, useState, type FormEvent } from 'react';
import { authApi, type OtpSent } from '../../api/auth';
import { errorText, fieldErrors, newKey } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../ui/Button';
import { Field, Tabs, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';

type Mode = 'login' | 'register';

/** P-01 Register as an advisor and P-02 Log in with mobile OTP. There are no passwords in v3.2. */
export function LoginScreen() {
  const { setSignedIn, notice } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [terms, setTerms] = useState(false);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<OtpSent | null>(null);
  const [wait, setWait] = useState(0);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const verifyKey = useRef(newKey());

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  function reset(m: Mode) {
    setMode(m); setSent(null); setCode(''); setError(null); setFields({}); setInfo(null);
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true); setError(null); setFields({});
    try {
      const r = mode === 'register' ? await authApi.registerOtp(name, mobile, terms) : await authApi.loginOtp(mobile);
      setSent(r); setInfo(r.message); setWait(r.resendAfterSeconds);
      verifyKey.current = newKey();
    } catch (err) {
      const f = fieldErrors(err);
      setFields(f);
      if (!Object.keys(f).length || f.mobile?.startsWith('No account')) setError(errorText(err));
    } finally { setBusy(false); }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setFields({});
    try {
      const r = mode === 'register' ? await authApi.registerVerify(mobile, code, verifyKey.current) : await authApi.loginVerify(mobile, code, verifyKey.current);
      const extra = r.data.notices.map((n) => n.message).join(' ');
      setSignedIn(r.data.user, [r.meta.message, extra].filter(Boolean).join(' ') || null);
    } catch (err) {
      setCode(''); // GR-04: only the OTP field is cleared after a wrong attempt
      const f = fieldErrors(err);
      setFields(f);
      if (!f.code) setError(errorText(err));
    } finally { setBusy(false); }
  }

  return (
    <main className="grid place-items-center overflow-y-auto px-[clamp(20px,4vw,56px)] pt-9 pb-16">
      <div className="grid w-full max-w-[420px] gap-4">
        <h1 className="text-[1.9rem] leading-tight font-bold tracking-[-0.01em]">Bimayantra</h1>
        <Tabs tabs={[['login', 'Log in'], ['register', 'Register as an advisor']]} active={mode} onChange={reset} />
        {notice && !error && <Notice>{notice}</Notice>}

        {!sent ? (
          <form onSubmit={send} noValidate className="grid gap-4">
            {mode === 'register' && (
              <Field label="Full name" required error={fields.name}>
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={!!fields.name} />
              </Field>
            )}
            <Field label="Mobile number" required error={fields.mobile} hint="10-digit Indian mobile. Seeded SkyUp Admin: SEED_ADMIN_MOBILE in the API's .env.">
              <input className={inputClass} value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="98123 45678" aria-invalid={!!fields.mobile} />
            </Field>
            {mode === 'register' && (
              <Field label="Terms" error={fields.termsAccepted}>
                <span className="flex items-start gap-2 font-normal">
                  <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1" />
                  I agree to the Terms of Use and Privacy Notice.
                </span>
              </Field>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            <Button variant="primary" disabled={busy}>{busy ? 'Sending…' : 'Send OTP'}</Button>
          </form>
        ) : (
          <form onSubmit={verify} noValidate className="grid gap-4">
            {info && <Notice>{info}</Notice>}
            <Field label="OTP" required error={fields.code} hint="In development the code is in the SMS inbox tab on the right.">
              <input className={`${inputClass} font-mono tracking-[0.3em]`} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric"
                autoComplete="one-time-code" maxLength={sent.codeLength} autoFocus aria-invalid={!!fields.code} />
            </Field>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="primary" disabled={busy || !code}>{busy ? 'Verifying…' : 'Verify'}</Button>
              <Button type="button" disabled={busy || wait > 0} onClick={() => send()}>{wait > 0 ? `Resend OTP in ${wait}s` : 'Resend OTP'}</Button>
              <Button type="button" variant="link" onClick={() => { setSent(null); setCode(''); setInfo(null); }}>Change number</Button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
