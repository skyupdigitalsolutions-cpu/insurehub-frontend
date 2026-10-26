import { api } from './client';

/** Test tools (non-production only): SMS inbox, test clock, CFG overrides. */
export interface SmsMessage { to: string; kind: string; text: string; at: string }
export interface CfgRow { id: string; label: string; unit: string | null; change: string; default: unknown; value: unknown; overridden: boolean }
const quiet = { label: undefined, idempotencyKey: false as const };

export const devApi = {
  sms: (mobile?: string) => api<{ failing: boolean; messages: SmsMessage[] }>('GET', `/dev/sms${mobile ? `?mobile=${encodeURIComponent(mobile)}` : ''}`, undefined, quiet),
  clearSms: () => api('DELETE', '/dev/sms', undefined, { label: 'Clear SMS inbox' }),
  setSmsFailing: (failing: boolean) => api<{ failing: boolean }>('POST', '/dev/sms/failing', { failing }, { label: 'Simulate SMS failure', idempotencyKey: false }),
  clock: () => api<{ offsetMs: number; now: string; ist: string }>('GET', '/dev/clock'),
  setClock: (b: { advanceMinutes?: number; reset?: boolean }) => api<{ offsetMs: number; now: string; ist: string }>('POST', '/dev/clock', b, { label: 'Move test clock', idempotencyKey: false }),
  config: () => api<CfgRow[]>('GET', '/dev/config'),
  setConfig: (id: string, value: unknown) => api<CfgRow>('PUT', `/dev/config/${id}`, { value }, { label: `Set ${id}` }),
  resetConfig: (id: string) => api<CfgRow[]>('DELETE', `/dev/config/${id}`, undefined, { label: `Reset ${id}` }),
  resetLimits: () => api<{ counters: number; otpLocks: number }>('POST', '/dev/reset-limits', {}, { label: 'Reset limits and OTP locks', idempotencyKey: false }),
  insurers: () => api<DevInsurer[]>('GET', '/dev/insurers'),
  createInsurer: (b: { name: string; category?: string; status?: 'ACTIVE' | 'INACTIVE' }) => api<DevInsurer>('POST', '/dev/insurers', b, { label: 'Create test insurer', idempotencyKey: false }),
  setInsurerStatus: (id: string, status: 'ACTIVE' | 'INACTIVE') => api<DevInsurer>('POST', `/dev/insurers/${id}/status`, { status }, { label: `Insurer ${status}`, idempotencyKey: false }),
};
export interface DevInsurer { _id: string; name: string; shortCode: string; category: string; status: string }

/** The latest OTP sent to a number (for console checks and the SMS inbox "use code" button). */
export async function latestOtp(mobile: string): Promise<string> {
  const { messages } = await devApi.sms(mobile);
  const m = messages.find((x) => x.kind === 'OTP');
  if (!m) throw new Error(`No OTP in the test inbox for ${mobile}. Is SMS_PROVIDER=dev and DEV_TOOLS=true?`);
  return m.text.slice(0, m.text.indexOf(' '));
}