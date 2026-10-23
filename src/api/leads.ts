import { api, apiFull, qs } from './client';
import type { CustomerSummary } from './customers';

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'FOLLOW_UP' | 'CONVERTED' | 'LOST';
export const STATUS_LABEL: Record<LeadStatus, string> = { NEW: 'New', CONTACTED: 'Contacted', QUALIFIED: 'Qualified', FOLLOW_UP: 'Follow-up', CONVERTED: 'Converted', LOST: 'Lost' };
export const STAGES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'FOLLOW_UP', 'CONVERTED', 'LOST'];

export interface Pipeline { id: string; name: string; position: number; counts: Record<LeadStatus, number> }
export interface LeadSummary {
  id: string; number: string; pipelineId: string; name: string; mobile: string; source: string; priority: string; status: LeadStatus;
  statusLabel: string; nextFollowUpAt: string | null; customerId: string | null; createdAt: string; version: number;
  allowedMoves: LeadStatus[]; canConvert: boolean;
}
export interface Lead extends LeadSummary {
  pipelineName: string | null; altMobile: string | null; email: string | null; campaign: string | null; interests: string[]; notes: string | null;
  referrer: { id: string; name: string | null } | null; referredBy: { id: string; number: string; name: string } | null;
  lostReason: string | null; lostNote: string | null; convertedAt: string | null; customer: { id: string; number: string; name: string } | null;
  createdBy: string | null; updatedAt: string; followUpTask: { id: string; dueAt: string; title: string } | null;
  contacts: Array<{ id: string; outcome: string; outcomeLabel: string; note: string | null; at: string; by: string | null }>;
  stageHistory: Array<{ from: string | null; to: string; fromLabel: string | null; toLabel: string; reason: string | null; note: string | null; by: string | null; at: string }>;
}
export interface LeadInput {
  pipelineId?: string; name?: string; mobile?: string; altMobile?: string | null; email?: string | null; source?: string; referrerId?: string | null;
  referredByCustomerId?: string | null; campaign?: string | null; interests?: string[]; priority?: string; nextFollowUpAt?: string | null; notes?: string | null;
  confirm?: string[]; version?: number;
}
export interface LeadQuery { pipelineId?: string; status?: string; source?: string; priority?: string; search?: string; page?: number; limit?: number }
export interface Duplicates { exact: { id: string; number: string; name: string } | null; sameMobile: Array<{ id: string; number: string; name: string }>; customers?: Array<{ id: string; number: string; name: string }> }

export const leadsApi = {
  pipelines: () => api<Pipeline[]>('GET', '/pipelines'),
  list: (q: LeadQuery) => apiFull<LeadSummary[]>('GET', `/leads${qs({ ...q })}`),
  get: (id: string) => api<Lead>('GET', `/leads/${id}`),
  duplicates: (mobile: string, name?: string, excludeId?: string) => api<Duplicates>('GET', `/leads/duplicate-check${qs({ mobile, name, excludeId })}`),
  create: (b: LeadInput, key: string) => apiFull<Lead>('POST', '/leads', b, { label: 'Create lead', idempotencyKey: key }),
  update: (id: string, b: LeadInput) => apiFull<Lead>('PATCH', `/leads/${id}`, b, { label: 'Save lead' }),
  setStatus: (id: string, b: { version: number; status: LeadStatus; nextFollowUpAt?: string; lostReason?: string; note?: string }, key: string) =>
    apiFull<Lead>('POST', `/leads/${id}/status`, b, { label: `Move lead to ${b.status}`, idempotencyKey: key }),
  logContact: (id: string, b: { outcome: string; note?: string }, key: string) => apiFull<Lead>('POST', `/leads/${id}/contacts`, b, { label: 'Log contact', idempotencyKey: key }),
  convert: (id: string, b: { version: number; mode: 'CREATE' | 'LINK'; customerId?: string; customer?: Record<string, unknown>; confirm?: string[] }, key: string) =>
    apiFull<{ lead: Lead; customer: CustomerSummary; outcome: 'CREATED' | 'LINKED' }>('POST', `/leads/${id}/convert`, b, { label: 'Convert to customer', idempotencyKey: key }),
};
