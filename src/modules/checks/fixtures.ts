import { newKey, rawRequest } from '../../api/client';
import { devApi, latestOtp } from '../../api/dev';
import type { CheckResult } from '../../ui/CheckList';

/**
 * Live-check fixtures. Checks act as throwaway users with app-style Bearer tokens (X-Client: app), so they
 * never disturb your own cookie session. OTPs are read from the dev SMS inbox (SMS_PROVIDER=dev).
 * Each throwaway advisor is a real account named "Console check …".
 */
export type Reply = { res: Response; json: unknown };
export const randomMobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

const err = (r: Reply) => (r.json as { error?: { code?: string; messageId?: string; message?: string; fields?: Array<{ field: string; messageId: string; message: string }> } })?.error;
export const data = <T,>(r: Reply) => (r.json as { data: T }).data;
export const meta = (r: Reply) => (r.json as { meta?: { messageId?: string; message?: string; warnings?: Array<{ message: string }> } })?.meta ?? {};
export const messageId = (r: Reply) => err(r)?.messageId ?? meta(r).messageId ?? '—';
export const fields = (r: Reply) => Object.fromEntries((err(r)?.fields ?? []).map((f) => [f.field, f.messageId]));
export const seen = (r: Reply) => `${r.res.status} ${err(r)?.code ?? ''} ${messageId(r)}`.replace(/\s+/g, ' ');
export const verdict = (ok: boolean): CheckResult['verdict'] => (ok ? 'pass' : 'fail');

const APP = { 'X-Client': 'app' };
export function as(token: string, label: string) {
  const o = (extra: Record<string, string> = {}) => ({ bearer: token, headers: { ...APP, ...extra }, label: `Check: ${label}` });
  return {
    get: (p: string) => rawRequest('GET', p, undefined, o()),
    post: (p: string, body: object = {}, extra: Record<string, string> = {}, key?: string) => rawRequest('POST', p, body, { ...o(extra), idempotencyKey: key ?? newKey() }),
    patch: (p: string, body: object) => rawRequest('PATCH', p, body, o()),
    put: (p: string, body: object) => rawRequest('PUT', p, body, o()),
    del: (p: string) => rawRequest('DELETE', p, undefined, o()),
  };
}

export interface Fixture { token: string; refresh: string; mobile: string; user: { id: string; accountId: string | null; role: string } }

async function verify(kind: 'register' | 'login', mobile: string, label: string): Promise<Fixture> {
  const r = await rawRequest('POST', `/auth/${kind}/verify`, { mobile, code: await latestOtp(mobile) }, { headers: APP, label: `Check: ${label}` });
  if (!r.res.ok) throw new Error(`${label} failed (${seen(r)})`);
  const d = data<{ user: Fixture['user']; tokens: { accessToken: string; refreshToken: string } }>(r);
  return { token: d.tokens.accessToken, refresh: d.tokens.refreshToken, mobile, user: d.user };
}

/** A brand-new advisor account (P-01). Clears the per-IP limit first so repeated check runs are not throttled. */
export async function fixtureAdvisor(name = 'Console check advisor'): Promise<Fixture> {
  await devApi.resetLimits();
  const mobile = randomMobile();
  const s = await rawRequest('POST', '/auth/register/otp', { name, mobile, termsAccepted: true }, { label: 'Check: register fixture advisor', idempotencyKey: false });
  if (!s.res.ok) throw new Error(`Could not send the registration OTP (${seen(s)}). Is the API running with SMS_PROVIDER=dev and DEV_TOOLS=true?`);
  return verify('register', mobile, 'verify fixture advisor');
}

export async function fixtureLogin(mobile: string, label = 'log in fixture'): Promise<Fixture> {
  const s = await rawRequest('POST', '/auth/login/otp', { mobile }, { label: `Check: ${label} (OTP)`, idempotencyKey: false });
  if (!s.res.ok) throw new Error(`Login OTP failed (${seen(s)})`);
  return verify('login', mobile, label);
}

/** Step-up OTP for a fixture (CFG-83), fully automated through the inbox. */
export async function fixtureStepUp(f: { token: string; mobile: string }) {
  const c = as(f.token, 'step-up');
  await c.post('/auth/step-up/otp', {}, {}, undefined);
  const r = await c.post('/auth/step-up/verify', { code: await latestOtp(f.mobile) });
  return data<{ stepUpToken: string }>(r).stepUpToken;
}

export async function addFixtureAssistant(adv: Fixture) {
  const mobile = randomMobile();
  const r = await as(adv.token, 'add assistant').post('/assistants', { name: 'Console check assistant', mobile }, { 'X-Step-Up-Token': await fixtureStepUp(adv) });
  return { r, mobile };
}

export async function firstPipeline(token: string) {
  return data<Array<{ id: string; name: string }>>(await as(token, 'pipelines').get('/pipelines'))[0]!.id;
}

/** Runs fn with the test clock moved, and always puts it back. */
export async function withClock<T>(advanceMinutes: number, fn: () => Promise<T>): Promise<T> {
  await devApi.setClock({ advanceMinutes });
  try { return await fn(); } finally { await devApi.setClock({ reset: true }); }
}

/** A valid Aadhaar number (Verhoeff check digit, FLD-33) for tests. */
export function sampleAadhaar() {
  const d = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
  const p = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
  const valid = (s: string) => s.split('').reverse().map(Number).reduce((c, n, i) => d[c]![p[i % 8]![n]!]!, 0) === 0;
  const base = `2${String(Math.floor(Math.random() * 1e10)).padStart(10, '0')}`;
  for (let k = 0; k <= 9; k++) if (valid(base + k)) return base + k;
  throw new Error('unreachable');
}