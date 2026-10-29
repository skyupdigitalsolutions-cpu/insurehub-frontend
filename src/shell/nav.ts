/**
 * Open a record from anywhere (search results, bell items, dashboard widgets). The workspace switches to the
 * right module; that module opens the record. A target waits until its module has mounted and taken it.
 */
import { useEffect } from 'react';

export type Target =
  | { type: 'LEAD'; id: string }
  | { type: 'CUSTOMER'; id: string; tab?: 'family' | 'documents' | 'vehicles' }
  | { type: 'TASK'; id?: string }
  | { type: 'PROFILE'; id?: string }
  | { type: 'KYC_REVIEW'; id?: string }
  | { type: 'LIST'; list: 'LEADS' | 'CUSTOMERS' | 'TASKS'; filter?: Record<string, unknown> };

/** Which module shows each target. */
export const MODULE_OF: Record<string, string> = {
  LEAD: 'leads', CUSTOMER: 'customers', TASK: 'dashboard', PROFILE: 'profile', KYC_REVIEW: 'profile',
  'LIST:LEADS': 'leads', 'LIST:CUSTOMERS': 'customers', 'LIST:TASKS': 'dashboard',
};
export const moduleFor = (t: Target) => MODULE_OF[t.type === 'LIST' ? `LIST:${t.list}` : t.type] ?? 'dashboard';

let pending: Target | null = null;
const EVENT = 'bimayantra:open';

export function openRecord(t: Target) {
  pending = t;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: t }));
}

/** Used by a module: receive targets meant for it (also one that arrived just before it mounted). */
export function useOpenRecord(accepts: (t: Target) => boolean, handle: (t: Target) => void) {
  useEffect(() => {
    if (pending && accepts(pending)) { handle(pending); pending = null; }
    const on = (e: Event) => {
      const t = (e as CustomEvent<Target>).detail;
      if (accepts(t)) { handle(t); pending = null; }
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Used by the workspace: switch module when a target is opened. */
export function useModuleSwitch(setActive: (key: string) => void) {
  useEffect(() => {
    const on = (e: Event) => setActive(moduleFor((e as CustomEvent<Target>).detail));
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [setActive]);
}