import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { authApi } from '../api/auth';
import { errorText, fieldErrors } from '../api/client';
import { Button } from '../ui/Button';
import { Field, inputClass } from '../ui/form';
import { Notice } from '../ui/Notice';

/**
 * Step-up OTP (CFG-83, AUTH-26): sensitive actions (adding an assistant, SkyUp user changes) ask for an
 * extra OTP even though the user is signed in. requestStepUp() opens this dialog and resolves with the token.
 */
const Ctx = createContext<{ requestStepUp(): Promise<string> } | null>(null);

export function StepUpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ resolve(t: string): void; reject(e: Error): void } | null>(null);

  const send = useCallback(async () => {
    setError(null);
    try { setPrompt((await authApi.stepUpOtp()).meta.message ?? ''); }
    catch (e) { setError(errorText(e)); }
  }, []);

  const requestStepUp = useCallback(() => new Promise<string>((resolve, reject) => {
    pending.current = { resolve, reject };
    setCode('');
    setOpen(true);
    void send();
  }), [send]);

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { stepUpToken } = await authApi.stepUpVerify(code);
      setOpen(false);
      pending.current?.resolve(stepUpToken);
    } catch (err) {
      setCode(''); // GR-04: only an OTP field is cleared after a wrong attempt
      setError(fieldErrors(err).code ?? errorText(err));
    } finally { setBusy(false); }
  }

  function cancel() {
    setOpen(false);
    pending.current?.reject(new Error('Step-up cancelled'));
  }

  return (
    <Ctx.Provider value={{ requestStepUp }}>
      {children}
      {open && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="stepup-title">
          <form onSubmit={verify} className="grid w-full max-w-[380px] gap-3.5 rounded border border-rule bg-sheet p-5 shadow-lg">
            <h2 id="stepup-title" className="text-lg font-semibold">Confirm it is you</h2>
            {prompt && <p className="text-[0.875rem] text-ink-soft">{prompt}</p>}
            {error && <Notice tone="error">{error}</Notice>}
            <Field label="OTP" required>
              <input className={`${inputClass} font-mono tracking-[0.3em]`} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            </Field>
            <div className="flex flex-wrap gap-2.5">
              <Button type="submit" variant="primary" disabled={busy || !code}>{busy ? 'Verifying…' : 'Verify'}</Button>
              <Button type="button" onClick={send}>Resend OTP</Button>
              <Button type="button" variant="link" onClick={cancel}>Cancel</Button>
            </div>
          </form>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useStepUp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStepUp must be used inside StepUpProvider');
  return v.requestStepUp;
}
