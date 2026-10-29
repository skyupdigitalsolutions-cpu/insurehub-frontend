import { api, apiFull } from './client';

/** Module 8: insurance catalogue (Section 9). */
export interface InsurerValues { name: string; shortCode: string; category: string; irdaiRegNo: string; website?: string | null; paymentDomains: string[]; careNumber?: string | null; careEmail?: string | null }
export interface CatInsurer extends InsurerValues {
  id: string; status: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'INACTIVE'; version: number; makerId: string | null; rejectReason: string | null; mine?: boolean;
  pendingChange: { values: InsurerValues; status: 'PENDING' | 'REJECTED'; makerId: string; at: string; reason: string | null } | null;
}
export interface Approval { kind: 'INSURER' | 'TEMPLATE'; id: string; name: string; what: 'NEW' | 'CHANGE'; at: string; makerId: string; mine: boolean; version: number; current?: InsurerValues; proposed?: InsurerValues }

const step = (t: string) => ({ headers: { 'X-Step-Up-Token': t } });
export const catalogueApi = {
  insurers: (q?: string, status?: string) => api<CatInsurer[]>('GET', `/admin/insurers?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}`),
  insurer: (id: string) => api<CatInsurer>('GET', `/admin/insurers/${id}`),
  create: (b: InsurerValues & { submit?: boolean }) => apiFull<CatInsurer>('POST', '/admin/insurers', b, { label: b.submit ? 'Submit insurer' : 'Save insurer draft' }),
  edit: (id: string, b: Partial<InsurerValues> & { version: number; submit?: boolean }) => apiFull<CatInsurer>('PATCH', `/admin/insurers/${id}`, b, { label: 'Edit insurer' }),
  submit: (id: string, version: number) => apiFull<CatInsurer>('POST', `/admin/insurers/${id}/submit`, { version }, { label: 'Submit for approval' }),
  approve: (id: string, version: number, token: string) => apiFull<CatInsurer>('POST', `/admin/insurers/${id}/approve`, { version }, { label: 'Approve', ...step(token) }),
  reject: (id: string, version: number, reason: string, token: string) => apiFull<CatInsurer>('POST', `/admin/insurers/${id}/reject`, { version, reason }, { label: 'Reject', ...step(token) }),
  deactivate: (id: string, version: number, confirm: string[] = []) => apiFull<CatInsurer>('POST', `/admin/insurers/${id}/deactivate`, { version, confirm }, { label: 'Deactivate insurer' }),
  activate: (id: string, version: number) => apiFull<CatInsurer>('POST', `/admin/insurers/${id}/activate`, { version }, { label: 'Activate insurer' }),
  approvals: () => api<Approval[]>('GET', '/admin/approvals'),
  types: () => api<InsType[]>('GET', '/admin/types'),
  createType: (name: string) => api<{ type: { id: string }; template: Template }>('POST', '/admin/types', { name }, { label: 'Add insurance type' }),
  startDraft: (typeId: string) => api<Template>('POST', `/admin/types/${typeId}/templates`, {}, { label: 'Edit template', idempotencyKey: false }),
  template: (id: string) => api<Template>('GET', `/admin/templates/${id}`),
  saveTemplate: (id: string, b: { rev: number; features: Feature[]; factors: Factor[]; questions: Question[] }) => apiFull<Template>('PUT', `/admin/templates/${id}`, b, { label: 'Save template draft' }),
  submitTemplate: (id: string, rev: number) => apiFull<Template>('POST', `/admin/templates/${id}/submit`, { rev }, { label: 'Submit template' }),
  approveTemplate: (id: string, rev: number, token: string) => apiFull<Template>('POST', `/admin/templates/${id}/approve`, { rev }, { label: 'Approve template', ...step(token) }),
  rejectTemplate: (id: string, rev: number, reason: string, token: string) => apiFull<Template>('POST', `/admin/templates/${id}/reject`, { rev, reason }, { label: 'Reject template', ...step(token) }),
  deactivateType: (id: string, version: number, confirm: string[] = []) => apiFull<InsType>('POST', `/admin/types/${id}/deactivate`, { version, confirm }, { label: 'Deactivate type' }),
  activateType: (id: string, version: number) => apiFull<InsType>('POST', `/admin/types/${id}/activate`, { version }, { label: 'Activate type' }),
};
export interface Feature { key?: string; name: string; group: string; dataType: string; requiredToPublish: boolean; order?: number; help?: string | null }
export interface Factor { key?: string; name: string; kind: 'BAND' | 'VALUE'; source: string; bands: Array<{ from: number; to: number }>; values: string[] }
export interface Question { key?: string; label: string; dataType: string; required: boolean }
export interface Template { id: string; typeId: string; number: number; status: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'RETIRED'; features: Feature[]; factors: Factor[]; questions: Question[]; rejectReason: string | null; rev: number; mine?: boolean }
export interface InsType {
  id: string; name: string; status: 'ACTIVE' | 'INACTIVE'; version: number;
  activeTemplate: { id: string; number: number } | null; openTemplate: { id: string; number: number; status: string; mine: boolean; rejectReason: string | null } | null;
}
export const GROUPS = ['Coverage', 'Waiting periods', 'Limits and sub-limits', 'Benefits', 'Exclusions', 'Other'];
export const DATA_TYPES = ['Yes/No', 'Number', 'Amount in ₹', 'Percentage', 'Days', 'Months', 'Years', 'Text'];
export const SOURCES = ['Asked in the quotation', 'Age of the eldest insured person', 'Age of the proposer', 'Number of adults', 'Number of children', 'Sum insured', 'Policy term'];