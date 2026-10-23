import { api, apiFull, type Options } from './client';

export type Role = 'ADV' | 'AST' | 'REF' | 'STF' | 'ADM';
export interface Me {
  id: string; name: string; mobile: string; maskedMobile: string; role: Role; roleLabel: string; accountId: string | null;
  advisorName: string | null; sessionId: string; capabilities: string[]; readOnly: boolean;
  subscription: { status: 'TRIAL' | 'ACTIVE' | 'GRACE' | 'EXPIRED'; storedStatus: string; plan: string | null; endsAt: string; daysLeft: number } | null;
  profile: { kycStatus: string; completionPct: number } | null;
}
export interface OtpSent { sent: boolean; maskedMobile: string; expiresAt: string; resendAfterSeconds: number; codeLength: number; messageId: string; message: string }
export interface SignedIn { outcome: 'CREATED' | 'SIGNED_IN'; user: Me; notices: Array<{ messageId: string; message: string }>; tokens?: { accessToken: string; refreshToken: string } }
export interface SessionInfo { id: string; device: string; client: 'WEB' | 'APP'; ip: string | null; startedAt: string; lastActiveAt: string; current: boolean }

export const authApi = {
  registerOtp: (name: string, mobile: string, termsAccepted: boolean) =>
    api<OtpSent>('POST', '/auth/register/otp', { name, mobile, termsAccepted }, { label: 'Send OTP (register)', idempotencyKey: false }),
  registerVerify: (mobile: string, code: string, key: string) =>
    apiFull<SignedIn>('POST', '/auth/register/verify', { mobile, code }, { label: 'Verify OTP (register)', idempotencyKey: key }),
  loginOtp: (mobile: string) => api<OtpSent>('POST', '/auth/login/otp', { mobile }, { label: 'Send OTP (log in)', idempotencyKey: false }),
  loginVerify: (mobile: string, code: string, key: string) =>
    apiFull<SignedIn>('POST', '/auth/login/verify', { mobile, code }, { label: 'Verify OTP (log in)', idempotencyKey: key }),
  me: (opts: Options = {}) => api<Me>('GET', '/auth/me', undefined, opts),
  logout: () => apiFull<null>('POST', '/auth/logout', {}, { label: 'Log out', idempotencyKey: false, retry: false }),
  sessions: () => api<SessionInfo[]>('GET', '/auth/sessions'),
  endSession: (id: string) => apiFull<null>('DELETE', `/auth/sessions/${id}`, undefined, { label: 'End session' }),
  stepUpOtp: () => apiFull<OtpSent>('POST', '/auth/step-up/otp', {}, { label: 'Send step-up OTP', idempotencyKey: false }),
  stepUpVerify: (code: string) => api<{ stepUpToken: string; expiresAt: string }>('POST', '/auth/step-up/verify', { code }, { label: 'Verify step-up OTP', idempotencyKey: false }),
  currentMobileOtp: () => api<OtpSent>('POST', '/auth/mobile/current/otp', {}, { label: 'OTP to current number', idempotencyKey: false }),
  currentMobileVerify: (code: string) => api<{ changeToken: string }>('POST', '/auth/mobile/current/verify', { code }, { label: 'Verify current number', idempotencyKey: false }),
  newMobileOtp: (changeToken: string, newMobile: string) => api<OtpSent>('POST', '/auth/mobile/new/otp', { changeToken, newMobile }, { label: 'OTP to new number', idempotencyKey: false }),
  newMobileVerify: (changeToken: string, newMobile: string, code: string, key: string) =>
    apiFull<{ mobile: string }>('POST', '/auth/mobile/new/verify', { changeToken, newMobile, code }, { label: 'Change mobile', idempotencyKey: key }),
};
