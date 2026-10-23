import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { authApi, type Me } from '../api/auth';
import { ApiError, session } from '../api/client';
import { loadReference } from '../api/reference';

type Status = 'checking' | 'signedOut' | 'signedIn';
interface AuthState {
  status: Status;
  user: Me | null;
  notice: string | null;
  /** AUTH-21 idle warning is showing. */
  idleWarning: string | null;
  setSignedIn(user: Me, notice?: string | null): void;
  signOut(): Promise<void>;
  reload(): Promise<void>;
  /** True if the signed-in user's role has this capability (Section 3.2). The server still enforces it. */
  can(capability: string): boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking');
  const [user, setUser] = useState<Me | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [idleWarning, setIdleWarning] = useState<string | null>(null);
  const checking = useRef(true);

  useEffect(() => {
    session.onLost((message) => {
      setUser(null);
      setStatus('signedOut');
      if (!checking.current) setNotice(message ?? 'Your session has ended for security. Verify your mobile number to continue.');
    });
    // Restore the session after a reload: the HttpOnly cookie is sent automatically.
    (async () => {
      try { setUser(await authApi.me()); setStatus('signedIn'); }
      catch { setStatus('signedOut'); }
      finally { checking.current = false; }
    })();
  }, []);

  // P-03 step 2: CFG-123 minutes before CFG-07 of no activity, warn (AUTH-21) and offer Stay signed in.
  useEffect(() => {
    if (status !== 'signedIn') return;
    const t = setInterval(async () => {
      const { limits } = await loadReference();
      const idleMs = Date.now() - session.lastActivity;
      if (idleMs > (limits.idleMinutes - limits.idleWarningMinutes) * 60_000) {
        setIdleWarning(`You will be logged out in ${limits.idleWarningMinutes} minutes because of no activity.`);
      }
    }, 15_000);
    return () => clearInterval(t);
  }, [status]);

  const setSignedIn = useCallback((u: Me, n?: string | null) => {
    session.lastActivity = Date.now();
    setUser(u);
    setNotice(n ?? null);
    setIdleWarning(null);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    let message = 'You have logged out.';
    try { message = (await authApi.logout()).meta.message ?? message; }
    catch (e) { if (e instanceof ApiError && e.status === 0) message = 'You have logged out on this device. The server will end the session when it is reachable.'; }
    setUser(null);
    setStatus('signedOut');
    setNotice(message);
  }, []);

  const reload = useCallback(async () => { setUser(await authApi.me()); setIdleWarning(null); }, []);
  const can = useCallback((c: string) => user?.capabilities.includes(c) ?? false, [user]);

  return <Ctx.Provider value={{ status, user, notice, idleWarning, setSignedIn, signOut, reload, can }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
