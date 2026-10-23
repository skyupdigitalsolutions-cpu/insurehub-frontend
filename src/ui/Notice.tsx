import type { ReactNode } from 'react';

/** Status (green), warning (amber) or error (red) message strip. */
export function Notice({ tone = 'ok', children }: { tone?: 'ok' | 'error' | 'warn'; children: ReactNode }) {
  const styles = tone === 'ok' ? 'bg-ok-tint text-ok-deep' : tone === 'warn' ? 'bg-warn-tint text-warn' : 'bg-bad-tint text-bad';
  return (
    <p role={tone === 'ok' ? 'status' : 'alert'} className={`mb-[18px] max-w-[880px] rounded px-3.5 py-2.5 ${styles}`}>
      {children}
    </p>
  );
}
