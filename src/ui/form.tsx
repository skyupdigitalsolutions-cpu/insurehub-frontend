import type { ReactNode } from 'react';
import { Button } from './Button';

/** Shared form styles so every screen's inputs look and behave the same. */
export const inputClass =
  'w-full rounded border border-field bg-sheet px-3 py-2 text-[0.9375rem] font-normal text-ink focus-visible:border-focus disabled:bg-paper disabled:text-muted aria-[invalid=true]:border-bad';
export const labelClass = 'grid gap-1.5 text-[0.8125rem] font-medium';

/** GR-03 / GR-07: label with a red asterisk when required, the field's error in red directly under it. */
export function Field({ label, required, error, hint, children, className = '' }: { label: string; required?: boolean; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`${labelClass} ${className}`}>
      <span>{label}{required && <span className="text-bad" aria-hidden> *</span>}</span>
      {children}
      {hint && !error && <span className="font-normal text-muted">{hint}</span>}
      {error && <span role="alert" className="font-normal text-bad">⚠ {error}</span>}
    </label>
  );
}

/** "Save anyway" warnings (LD-03, LD-04, CU-03) and confirmations (CU-21, CU-22). */
export function Warnings({ items, onConfirm, onCancel, busy, confirmLabel = 'Save anyway' }: {
  items: Array<{ messageId: string; message: string }>; onConfirm: () => void; onCancel: () => void; busy?: boolean; confirmLabel?: string;
}) {
  if (!items.length) return null;
  return (
    <div role="alert" className="grid gap-2 rounded border border-warn bg-warn-tint p-3 text-[0.875rem] text-warn">
      {items.map((w, i) => <p key={i}><span className="font-mono text-[0.75rem]">{w.messageId}</span> {w.message}</p>)}
      <div className="flex gap-2">
        <Button type="button" disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
        <Button type="button" variant="link" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: Array<[T, string]>; active: T; onChange: (t: T) => void }) {
  return (
    <nav className="mb-5 flex flex-wrap gap-5 border-b border-rule" aria-label="Sections">
      {tabs.map(([key, label]) => (
        <button key={key} type="button" onClick={() => onChange(key)} aria-current={active === key ? 'page' : undefined}
          className={`-mb-px cursor-pointer border-b-2 pb-2.5 text-[0.9375rem] ${active === key ? 'border-ink font-semibold' : 'border-transparent text-muted hover:text-ink'}`}>
          {label}
        </button>
      ))}
    </nav>
  );
}

const IST = 'Asia/Kolkata';
/** GR-25: shown in IST, dates DD-MM-YYYY, times 12-hour with AM/PM. */
export const fmtDate = (v: string | null | undefined) => {
  if (!v) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v.slice(8, 10)}-${v.slice(5, 7)}-${v.slice(0, 4)}`;
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: IST, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(v));
  return p.replace(/\//g, '-');
};
export const fmtDateTime = (v: string | null | undefined) => {
  if (!v) return '—';
  const t = new Intl.DateTimeFormat('en-US', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(v));
  return `${fmtDate(v)} ${t}`;
};
/** datetime-local input value (IST) ↔ ISO with +05:30. */
export const toIstInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 330 * 60_000);
  return d.toISOString().slice(0, 16);
};
export const fromIstInput = (v: string) => (v ? `${v}:00+05:30` : '');
