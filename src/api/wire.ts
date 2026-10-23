/**
 * The wire log: every API call made by this console, as it crossed the network. Tokens, OTP codes and
 * full identity numbers are masked before they are stored here, so the panel is safe to screen-share.
 */
export interface WireEntry {
  id: number; at: Date; label?: string; method: string; path: string; status: number; ms: number;
  requestId?: string; requestBody?: unknown; responseBody?: unknown;
}

let entries: WireEntry[] = [];
let seq = 0;
const listeners = new Set<() => void>();

const TOKEN_KEYS = /token$/i;
const SECRET_REQUEST_KEYS = /^(code|pan|aadhaar)$/i;

export function mask(value: unknown, secretKeys: RegExp | null): unknown {
  if (Array.isArray(value)) return value.map((v) => mask(v, secretKeys));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => {
      if (TOKEN_KEYS.test(k) && typeof v === 'string') return [k, `${v.slice(0, 8)}…(${v.length} chars)`];
      if (secretKeys?.test(k) && typeof v === 'string') return [k, '••••••'];
      return [k, mask(v, secretKeys)];
    }));
  }
  return value;
}

export function pushWire(e: Omit<WireEntry, 'id' | 'at'>) {
  const reveal = e.path.includes('/identity/reveal');
  entries = [{
    ...e, id: ++seq, at: new Date(),
    requestBody: mask(e.requestBody, SECRET_REQUEST_KEYS),
    responseBody: mask(e.responseBody, reveal ? /^value$/ : null),
  }, ...entries].slice(0, 200);
  listeners.forEach((l) => l());
}

export function clearWire() {
  entries = [];
  listeners.forEach((l) => l());
}

export const wireStore = {
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  snapshot: () => entries,
};
