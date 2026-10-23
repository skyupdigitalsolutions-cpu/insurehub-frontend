import { useCallback, useRef, useState } from 'react';

/**
 * Guards an action against double submission (double-clicks, impatient re-clicks).
 * The ref blocks a second run synchronously, before React has re-rendered the disabled button;
 * `busy` drives the disabled state and "…" labels.
 */
export function useBusy() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try { await fn(); }
    finally { running.current = false; setBusy(false); }
  }, []);
  return { busy, run };
}