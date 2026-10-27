import { api, apiFull } from './client';
import type { FileInfo } from './profile';

/** Module 6: document vault (P-18). */
export interface DocVersion {
  id: string; customerId: string; personKey: string; type: string; name: string | null; version: number; label: string; originalName: string;
  status: 'UNCONFIRMED' | 'CONFIRMED'; rev: number; uploadedAt: string; uploadedBy: string; confirmedAt: string | null; file: FileInfo | null;
}
export interface DocGroup { personKey: string; personName: string; type: string; name: string | null; versions: DocVersion[] }
export interface CustomerDocs { groups: DocGroup[]; missing: { items: string[]; message: string } | null; aadhaarReminder: { message: string } }
export interface DocDetail extends DocVersion {
  readValues: Record<string, unknown> | null; confirmedValues: Record<string, unknown> | null;
  history: Array<{ event: 'UPLOADED' | 'LABEL_CHANGED'; name?: string; from?: string; to?: string; by: string; at: string }>;
  messageId?: string; message?: string;
}
export interface Uploaded extends DocVersion { personName: string; verify: { values: Record<string, unknown>; messageId: string; message: string } | null }
export interface Confirmed {
  document: DocVersion;
  identity: { field: 'PAN' | 'AADHAAR'; copied: boolean; differs: boolean; current?: string | null; fromDocument?: string } | null;
  existingPolicyPrefill: Record<string, unknown> | null;
}
export interface CatalogueInsurer { id: string; name: string; category: string; status: string }

export const documentsApi = {
  forCustomer: (customerId: string) => api<CustomerDocs>('GET', `/customers/${customerId}/documents`),
  get: (id: string) => api<DocDetail>('GET', `/documents/${id}`),
  add: (b: { customerId?: string; personKey?: string; type?: string; name?: string; fileId: string }) => apiFull<Uploaded>('POST', '/documents', b, { label: 'Add document' }),
  confirm: (id: string, rev: number, values: Record<string, unknown>) => apiFull<Confirmed>('POST', `/documents/${id}/confirm`, { rev, values }, { label: 'Confirm document' }),
  relabel: (id: string, rev: number, label: string) => apiFull<DocVersion>('PATCH', `/documents/${id}/label`, { rev, label }, { label: 'Change label' }),
  insurers: () => api<CatalogueInsurer[]>('GET', '/insurers'),
};