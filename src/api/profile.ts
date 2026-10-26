import { ApiError, api, apiFull, toError } from './client';
import { pushWire } from './wire';

/** Module 5: advisor profile (P-05), KYC (P-06), KYC review (SkyUp), private files (FLD-22). */
export type Section = 'personal' | 'contact' | 'professional' | 'business';
export interface FileInfo { id: string; purpose: string; type: 'PDF' | 'JPG' | 'PNG'; size: number; name: string; uploadedAt: string }
export interface MissingGroup { section: string; missing: string[] }
export interface Profile {
  sections: {
    personal: { fullName: string; dob: string | null; gender: string | null; photoFileId: string | null; savedAt: string | null; version: number };
    contact: { email: string | null; altMobile: string | null; address1: string | null; address2: string | null; city: string | null; state: string | null; pin: string | null; loginMobile: string; savedAt: string | null; version: number };
    professional: { advisorType: string | null; licenceNumber: string | null; licenceValidUntil: string | null; experienceYears: number | null; categories: string[]; savedAt: string | null; version: number };
    business: { displayName: string | null; effectiveDisplayName: string; gstin: string | null; logoFileId: string | null; savedAt: string | null; version: number };
  };
  kycStatus: KycStatus;
  completion: { percent: number; missing: MissingGroup[]; messageId?: string; message?: string };
  licence: { state: 'MISSING' | 'VALID' | 'EXPIRING' | 'EXPIRED'; until: string | null; messageId: string | null; message: string | null };
  options: { advisorTypes: string[]; genders: string[]; categories: string[] };
}
export type KycStatus = 'NOT_SUBMITTED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
export interface Kyc {
  status: KycStatus; version: number; pan: string | null; nameOnPan: string | null; panFile: FileInfo | null; licenceFile: FileInfo | null;
  submittedAt: string | null; decidedAt: string | null; rejection: { reason: string; note: string | null; message: string } | null; message?: string;
}
export interface KycSubmit { version: number; pan: string; nameOnPan: string; panFileId: string; licenceFileId: string; declaration: boolean; confirm?: string[] }
export interface QueueItem { accountId: string; advisorName: string | null; mobile: string | null; submittedAt: string; workingDaysWaiting: number; overdue: boolean }
export interface ReviewItem extends Kyc {
  accountId: string; advisorName: string | null; dob: string | null; rejectReasons: string[];
  licence: { number: string | null; validUntil: string | null; type: string | null };
}
export type FilePurpose = 'PROFILE_PHOTO' | 'BUSINESS_LOGO' | 'KYC_PAN' | 'KYC_LICENCE' | 'APPOINTMENT_LETTER';
export interface InsurerRef { id: string; name: string; shortCode: string; category: string; status: string }
export interface Mapping {
  id: string; insurer: InsurerRef | null; agentCode: string; validUntil: string | null; status: 'ACTIVE' | 'INACTIVE'; version: number;
  appointmentLetter: FileInfo | null; warnings: Array<{ messageId: string; message: string }>;
}
export interface FlagGroup { insurer: string; agentCode: string; accounts: Array<{ accountId: string; advisorName: string | null; flaggedAt: string }> }

export const profileApi = {
  get: () => api<Profile>('GET', '/profile'),
  save: (section: Section, body: Record<string, unknown>) => apiFull<Profile>('PUT', `/profile/${section}`, body, { label: `Save ${section} section` }),
};
export const kycApi = {
  get: () => api<Kyc>('GET', '/kyc'),
  submit: (b: KycSubmit) => apiFull<Kyc>('PUT', '/kyc', b, { label: 'Submit KYC' }),
};
export const insurersApi = {
  list: () => api<Mapping[]>('GET', '/my-insurers'),
  available: (q?: string) => api<InsurerRef[]>('GET', `/my-insurers/available${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  add: (b: { insurerId: string; agentCode: string; validUntil?: string; appointmentLetterFileId?: string; declaration: boolean }) =>
    apiFull<Mapping>('POST', '/my-insurers', b, { label: 'Add insurer' }),
  edit: (id: string, b: { version: number; agentCode?: string; validUntil?: string | null; appointmentLetterFileId?: string | null }) =>
    apiFull<Mapping>('PATCH', `/my-insurers/${id}`, b, { label: 'Edit insurer' }),
  deactivate: (id: string, version: number, confirm: string[] = []) => apiFull<Mapping>('POST', `/my-insurers/${id}/deactivate`, { version, confirm }, { label: 'Deactivate insurer' }),
  activate: (id: string, version: number) => apiFull<Mapping>('POST', `/my-insurers/${id}/activate`, { version }, { label: 'Activate insurer' }),
  flags: () => api<FlagGroup[]>('GET', '/admin/agent-code-flags'),
};
export const reviewApi = {
  queue: () => api<{ targetWorkingDays: number; items: QueueItem[] }>('GET', '/admin/kyc'),
  item: (accountId: string) => api<ReviewItem>('GET', `/admin/kyc/${accountId}`),
  decide: (accountId: string, b: { version: number; decision: 'VERIFY' | 'REJECT'; reason?: string; note?: string }) =>
    apiFull<{ status: KycStatus }>('POST', `/admin/kyc/${accountId}/decision`, b, { label: b.decision === 'VERIFY' ? 'Verify KYC' : 'Reject KYC' }),
};

/** A file the signed-in user may open (cookie session; same origin). */
export const fileUrl = (id: string) => `/v1/files/${id}`;

/**
 * Upload one file as raw bytes (POST /v1/files?purpose=…). The API detects the real type from the content.
 * bearer: act as a check fixture instead of your own session.
 */
export async function uploadFile(file: Blob, purpose: FilePurpose, name: string, opts: { bearer?: string; label?: string } = {}) {
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/octet-stream', 'X-File-Name': name };
  if (opts.bearer) { headers.Authorization = `Bearer ${opts.bearer}`; headers['X-Client'] = 'app'; }
  const path = `/files?purpose=${purpose}`;
  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(`/v1${path}`, { method: 'POST', headers, body: file, credentials: 'same-origin' });
  } catch {
    pushWire({ label: opts.label ?? 'Upload file', method: 'POST', path, status: 0, ms: Math.round(performance.now() - started), requestBody: `${name} (${file.size} bytes)` });
    throw new ApiError(0, 'NETWORK', 'Could not reach Bimayantra. Your entries are kept. Check your internet connection and select Retry.', 'GEN-07');
  }
  const text = await res.text();
  let json: unknown;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = text; }
  pushWire({ label: opts.label ?? 'Upload file', method: 'POST', path, status: res.status, ms: Math.round(performance.now() - started), requestBody: `${name} (${file.size} bytes)`, responseBody: json });
  return { res, json };
}

/** Upload for screens: throws the API's error (with field messages) when refused. */
export async function upload(file: File, purpose: FilePurpose) {
  const { res, json } = await uploadFile(file, purpose, file.name);
  if (!res.ok) throw toError(res, json);
  return (json as { data: FileInfo }).data;
}