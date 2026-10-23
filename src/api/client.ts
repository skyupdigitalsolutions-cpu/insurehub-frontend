import { pushWire } from './wire';

/**
 * Typed API client. Web sessions live in HttpOnly cookies set by the API (P-02 backend rules), so this
 * console never stores a token or any personal data in browser storage (GR-14). The live checks act as
 * other users with app-style Bearer tokens (`bearer` option), which never touch the cookies.
 */
export interface FieldError { field: string; messageId: string; message: string }

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public messageId?: string,
    public requestId?: string,
    public fields: FieldError[] = [],
    public details?: unknown,
  ) {
    super(message);
  }
}

let onSessionLost: ((message?: string) => void) | null = null;
export const session = {
  /** Time of the last successful request: drives the idle warning (AUTH-21). */
  lastActivity: Date.now(),
  onLost(cb: (message?: string) => void) { onSessionLost = cb; },
  lost(message?: string) { onSessionLost?.(message); },
};

export interface Options {
  label?: string;
  /** Act as another user with an app token (live checks). */
  bearer?: string;
  /** GR-10: made when a form opens and reused on Retry. false = send none. Default: a fresh key on every POST. */
  idempotencyKey?: string | false;
  headers?: Record<string, string>;
  retry?: boolean;
  credentials?: RequestCredentials;
}

export const newKey = () => crypto.randomUUID();

export async function rawRequest(method: string, path: string, body?: unknown, opts: Options = {}) {
  const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.bearer) headers.Authorization = `Bearer ${opts.bearer}`;
  const key = opts.idempotencyKey === false ? undefined : opts.idempotencyKey ?? (method === 'POST' ? newKey() : undefined);
  if (key) headers['Idempotency-Key'] = key;

  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(path.startsWith('/health') ? path : `/v1${path}`, {
      method, headers, credentials: opts.credentials ?? 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    pushWire({ label: opts.label, method, path, status: 0, ms: Math.round(performance.now() - started), requestBody: body });
    throw new ApiError(0, 'NETWORK', 'Could not reach Bimayantra. Your entries are kept. Check your internet connection and select Retry.', 'GEN-07');
  }
  const text = await res.text();
  let json: unknown;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = text; }
  pushWire({ label: opts.label, method, path, status: res.status, ms: Math.round(performance.now() - started), requestId: res.headers.get('x-request-id') ?? undefined, requestBody: body, responseBody: json });
  return { res, json, key };
}

type ErrorJson = { error?: { code?: string; message?: string; messageId?: string; requestId?: string; fields?: FieldError[]; details?: unknown } };
export function toError(res: Response, json: unknown) {
  const e = (json as ErrorJson)?.error;
  return new ApiError(res.status, e?.code ?? 'UNKNOWN', e?.message ?? `Request failed (${res.status}).`, e?.messageId, e?.requestId, e?.fields ?? [], e?.details);
}

// Single-flight refresh: many requests can meet an expired token at once, but only one refresh is sent.
let refreshing: Promise<void> | null = null;
export function refreshSession(): Promise<void> {
  refreshing ??= (async () => {
    const { res, json } = await rawRequest('POST', '/auth/refresh', {}, { label: 'Refresh session', idempotencyKey: false });
    if (res.ok) return;
    const e = toError(res, json);
    // A parallel request rotated the cookie a moment ago: the browser already holds the new one.
    if (e.code === 'TOKEN_INVALID' && (e.details as { retryWithLatest?: boolean })?.retryWithLatest) return;
    throw e;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export interface Meta { messageId?: string; message?: string; replayed?: boolean; warnings?: Array<{ messageId: string; message: string }>; page?: number; limit?: number; total?: number; pages?: number }

/** Full response: data plus meta (success message, pagination). Refreshes an expired access token once. */
export async function apiFull<T>(method: string, path: string, body?: unknown, opts: Options = {}): Promise<{ data: T; meta: Meta }> {
  let r = await rawRequest(method, path, body, opts);
  if (r.res.status === 401 && !opts.bearer && opts.retry !== false && (r.json as ErrorJson)?.error?.code === 'TOKEN_EXPIRED') {
    try { await refreshSession(); }
    catch (e) { session.lost(e instanceof ApiError ? e.message : undefined); throw e; }
    r = await rawRequest(method, path, body, { ...opts, idempotencyKey: r.key ?? false });
  }
  if (!r.res.ok) {
    const e = toError(r.res, r.json);
    // GR-10 / Section 2.5: a repeat of a completed request shows GEN-06 with the saved result.
    const replay = (e.details as { result?: { data: T; meta?: Meta } })?.result;
    if (e.code === 'ALREADY_SUBMITTED' && replay) return { data: replay.data, meta: { ...(replay.meta ?? {}), messageId: 'GEN-06', message: e.message, replayed: true } };
    if (r.res.status === 401 && !opts.bearer) session.lost(e.message);
    throw e;
  }
  if (!opts.bearer) session.lastActivity = Date.now();
  const j = r.json as { data: T; meta?: Meta } | undefined;
  return { data: j?.data as T, meta: j?.meta ?? {} };
}

export const api = async <T,>(method: string, path: string, body?: unknown, opts: Options = {}) => (await apiFull<T>(method, path, body, opts)).data;

/** Field → message map for showing errors under each field (GR-03). */
export function fieldErrors(e: unknown): Record<string, string> {
  return e instanceof ApiError ? Object.fromEntries(e.fields.map((f) => [f.field, f.message])) : {};
}

/** Banner text: the server's exact message (with the reference for GEN-99). */
export function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Something unexpected happened. Please try again.';
  return e.message;
}

/** "Save anyway" warnings (LD-03, LD-04, CU-03, CU-21, CU-22) returned with 409 CONFIRMATION_REQUIRED. */
export function warningsOf(e: unknown): Array<{ messageId: string; message: string }> {
  if (!(e instanceof ApiError) || e.code !== 'CONFIRMATION_REQUIRED') return [];
  return (e.details as { warnings?: Array<{ messageId: string; message: string }> })?.warnings ?? [{ messageId: e.messageId ?? '', message: e.message }];
}

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
