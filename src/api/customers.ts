import { api, apiFull, qs } from './client';

export interface CustomerSummary { id: string; number: string; name: string; mobile: string; email: string | null; city: string | null; status: 'ACTIVE' | 'INACTIVE'; age: number | null; source: string; createdAt: string; version: number }
export interface FamilyMember { id: string; name: string; relationship: string; dob: string | null; age: number | null; gender: string | null; anniversary: string | null; mobile: string | null; email: string | null; status: 'ACTIVE' | 'INACTIVE'; version: number }
export interface Customer extends CustomerSummary {
  dob: string | null; gender: string | null; altMobile: string | null; preferredContact: string | null;
  address: { line1: string | null; line2: string | null; city: string | null; state: string | null; pin: string | null };
  anniversary: string | null; occupation: string | null; notes: string | null; leadId: string | null; statusReason: string | null; statusNote: string | null;
  identity: { pan: string | null; aadhaar: string | null }; referrer: { id: string; name: string } | null; referredBy: { id: string; number: string; name: string } | null;
  leads: Array<{ id: string; number: string; status: string; source: string; convertedAt: string | null }>; family: FamilyMember[];
  personalDataConsent: 'NOT_RECORDED' | 'GIVEN' | 'WITHDRAWN'; updatedAt: string;
}
export type Channel = 'WHATSAPP' | 'EMAIL' | 'SMS' | 'PERSONAL_DATA';
export interface ConsentCell { status: 'NOT_RECORDED' | 'GIVEN' | 'WITHDRAWN'; at: string | null; howGiven: string | null; address: string | null; termsVersion: string | null; version: number | null }
export interface ConsentGrid {
  rows: Array<{ person: { type: 'CUSTOMER' | 'FAMILY'; id: string; name: string; relationship: string; mobile: string | null; email: string | null }; channels: Record<'WHATSAPP' | 'EMAIL' | 'SMS', ConsentCell> }>;
  personalData: ConsentCell;
  history: Array<{ person: string; channel: Channel; from: string | null; to: string; howGiven: string | null; note: string | null; source: string; at: string }>;
}
export type CustomerInput = Record<string, unknown> & { confirm?: string[]; version?: number };

export const customersApi = {
  list: (q: { search?: string; status?: string; page?: number; limit?: number }) => apiFull<CustomerSummary[]>('GET', `/customers${qs(q)}`),
  get: (id: string) => api<Customer>('GET', `/customers/${id}`),
  duplicates: (mobile: string, name?: string, excludeId?: string) =>
    api<{ exact: { id: string; number: string; name: string } | null; sameMobile: Array<{ id: string; number: string; name: string }> }>('GET', `/customers/duplicate-check${qs({ mobile, name, excludeId })}`),
  create: (b: CustomerInput, key: string) => apiFull<Customer>('POST', '/customers', b, { label: 'Create customer', idempotencyKey: key }),
  update: (id: string, b: CustomerInput) => apiFull<Customer>('PATCH', `/customers/${id}`, b, { label: 'Save customer' }),
  deactivate: (id: string, b: { version: number; reason: string; note?: string }) => apiFull<Customer>('POST', `/customers/${id}/deactivate`, b, { label: 'Deactivate customer' }),
  reactivate: (id: string, version: number) => apiFull<Customer>('POST', `/customers/${id}/reactivate`, { version }, { label: 'Reactivate customer' }),
  setIdentity: (id: string, b: { version: number; pan?: string; aadhaar?: string }) => apiFull<Customer>('PUT', `/customers/${id}/identity`, b, { label: 'Save PAN / Aadhaar' }),
  reveal: (id: string, field: 'PAN' | 'AADHAAR') => apiFull<{ field: string; value: string; maskAfterSeconds: number }>('POST', `/customers/${id}/identity/reveal`, { field }, { label: `Show full ${field}`, idempotencyKey: false }),
  addMember: (id: string, b: Record<string, unknown>, key: string) => apiFull<FamilyMember>('POST', `/customers/${id}/family`, b, { label: 'Add family member', idempotencyKey: key }),
  updateMember: (id: string, memberId: string, b: Record<string, unknown>) => apiFull<FamilyMember>('PATCH', `/customers/${id}/family/${memberId}`, b, { label: 'Save family member' }),
  setMember: (id: string, memberId: string, active: boolean, version: number) =>
    apiFull<FamilyMember>('POST', `/customers/${id}/family/${memberId}/${active ? 'activate' : 'deactivate'}`, { version }, { label: active ? 'Activate member' : 'Deactivate member' }),
  consents: (id: string) => api<ConsentGrid>('GET', `/customers/${id}/consents`),
  recordConsent: (id: string, b: { personType: 'CUSTOMER' | 'FAMILY'; personId: string; channel: Channel; action: 'GIVE' | 'WITHDRAW'; howGiven?: string; declaration?: boolean; version?: number }, key: string) =>
    apiFull<ConsentGrid>('POST', `/customers/${id}/consents`, b, { label: `${b.action === 'GIVE' ? 'Record' : 'Withdraw'} ${b.channel} consent`, idempotencyKey: key }),
};
