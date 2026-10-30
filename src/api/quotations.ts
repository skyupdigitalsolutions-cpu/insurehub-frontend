import { api, apiFull } from './client';

/** Module 10: quotations (P-27). */
export interface Breakdown { base: number; riders: Array<{ name: string; amount: number }>; ridersTotal: number; calculated: number; override: number | null; beforeDiscount: number; discount: number; afterDiscount: number; taxPercent: number | null; tax: number; final: number }
export interface QInputs {
  typeId?: string; insurerId?: string; productId?: string; people?: string[]; sumInsured?: number; policyTerm?: number; startDate?: string;
  answers?: Record<string, string | number | boolean>; riders?: string[]; override?: { amount: number; reason: string } | null;
  discount?: { kind: 'AMOUNT' | 'PERCENT'; value: number; reference: string } | null; manual?: { netPremium?: number; taxAmount?: number } | null;
}
export interface QuotationView {
  id: string; customerId: string; number: string | null; status: 'DRAFT' | 'READY' | 'SHARED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'; step: number; inputs: QInputs; version: number; updatedAt: string;
  calc: { breakdown: Breakdown; priceVersionId: string | null } | null;
  revisions: Array<{ revision: number; status: string; pdfFileId: string | null; generatedAt: string; final: number | null; sharedAt: string | null; validUntil: string | null; viewed: number; reason: string | null }>;
}
export interface Choices {
  types: Array<{ id: string; name: string }>; insurers: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string; pricingMode: string; addOns: Array<{ name: string; priceType: string; value: number }>; sumInsured: { options?: number[]; min?: number; max?: number }; policyTerms: number[]; questions: Array<{ key: string; label: string; dataType: string; required: boolean }> }>;
}
export const quotationsApi = {
  list: (customerId?: string) => api<QuotationView[]>('GET', `/quotations${customerId ? `?customerId=${customerId}` : ''}`),
  get: (id: string) => api<QuotationView>('GET', `/quotations/${id}`),
  choices: (typeId?: string, insurerId?: string) => api<Choices>('GET', `/quotations/choices?${new URLSearchParams({ ...(typeId ? { typeId } : {}), ...(insurerId ? { insurerId } : {}) })}`),
  start: (customerId: string) => api<QuotationView>('POST', '/quotations', { customerId }, { label: 'Start quotation' }),
  save: (id: string, version: number, step: number, inputs: QInputs) => api<QuotationView>('PATCH', `/quotations/${id}`, { version, step, inputs }, { label: `Quotation step ${step - 1}` }),
  calculate: (id: string) => apiFull<QuotationView>('POST', `/quotations/${id}/calculate`, {}, { label: 'Calculate premium', idempotencyKey: false }),
  generate: (id: string) => apiFull<QuotationView>('POST', `/quotations/${id}/generate`, {}, { label: 'Generate quotation' }),
  snapshot: (id: string, rev: number) => api<Record<string, unknown>>('GET', `/quotations/${id}/revisions/${rev}`),
};

// ── Stage 2: share (P-28), outcomes and revisions (P-29), the customer's page ──
export const quotationActionsApi = {
  share: (id: string, channel: 'EMAIL' | 'WHATSAPP' | 'LINK' | 'DOWNLOAD') => apiFull<{ quotation: QuotationView; link: string; pdfFileId: string | null; whatsappUrl: string | null }>('POST', `/quotations/${id}/share`, { channel }, { label: `Share by ${channel.toLowerCase()}` }),
  edit: (id: string, version: number) => api<QuotationView>('POST', `/quotations/${id}/edit`, { version }, { label: 'Edit quotation', idempotencyKey: false }),
  revise: (id: string, version: number) => apiFull<QuotationView>('POST', `/quotations/${id}/revise`, { version }, { label: 'Revise', idempotencyKey: false }),
  accept: (id: string, version: number) => apiFull<QuotationView>('POST', `/quotations/${id}/accept`, { version }, { label: 'Mark accepted', idempotencyKey: false }),
  reject: (id: string, version: number, reason: string, note?: string) => apiFull<QuotationView>('POST', `/quotations/${id}/reject`, { version, reason, ...(note ? { note } : {}) }, { label: 'Mark rejected', idempotencyKey: false }),
  cancel: (id: string, version: number, reason: string) => apiFull<QuotationView>('POST', `/quotations/${id}/cancel`, { version, reason }, { label: 'Cancel quotation', idempotencyKey: false }),
  remove: (id: string) => apiFull<unknown>('DELETE', `/quotations/${id}`, undefined, { label: 'Delete draft' }),
};
export interface PublicQuotation {
  valid: boolean; message?: string; number?: string; revision?: number; validUntil?: string; customer?: string; people?: Array<{ name: string; age: number }>;
  product?: { name: string; uin: string }; insurer?: { name: string }; sumInsured?: number; policyTerm?: number; startDate?: string; breakdown?: Breakdown;
  advisor?: { name: string; businessName: string; mobile: string | null }; disclaimer?: string;
  payment?: { payOn?: string; domain?: string; link?: string; message?: string } | null;
}
export const publicQuotation = async (token: string): Promise<PublicQuotation> => {
  const r = await fetch(`/v1/public/q/${encodeURIComponent(token)}`);
  if (!r.ok) return { valid: false, message: 'This link is not valid.' };
  return (await r.json()).data as PublicQuotation;
};

// ── Comparisons (P-30) ──
export interface CmpColumn { productId: string; name: string; insurer: string | null; uin: string | null; agentCode: string | null; premium?: number; breakdown?: Breakdown; covers?: number; of?: number; lowest: boolean; coverage?: { message: string }; error?: { message: string } }
export interface CmpTable { columns: CmpColumn[]; rows: Array<{ label: string; values: unknown[] }> }
export interface ComparisonView {
  id: string; customerId: string; number: string | null; status: string; inputs: QInputs; options: Array<{ productId: string; riders?: string[] }>;
  recommendedProductId: string | null; recommendedReason: string | null; snapshot: (CmpTable & { customer: { name: string } }) | null; pdfFileId: string | null;
  validUntil: string | null; viewed: number; chosenProductId: string | null; linkedQuotationIds: string[]; version: number; updatedAt: string;
}
export const comparisonsApi = {
  list: () => api<ComparisonView[]>('GET', '/comparisons'),
  get: (id: string) => api<ComparisonView>('GET', `/comparisons/${id}`),
  start: (customerId: string) => api<ComparisonView>('POST', '/comparisons', { customerId }, { label: 'Start comparison' }),
  save: (id: string, b: { version: number; inputs: QInputs; options: Array<{ productId: string; riders?: string[] }>; recommendedProductId: string | null; recommendedReason: string | null }) => api<ComparisonView>('PUT', `/comparisons/${id}`, b, { label: 'Save comparison' }),
  preview: (id: string) => api<CmpTable>('POST', `/comparisons/${id}/preview`, {}, { label: 'Preview comparison', idempotencyKey: false }),
  generate: (id: string) => apiFull<ComparisonView>('POST', `/comparisons/${id}/generate`, {}, { label: 'Generate comparison' }),
  share: (id: string, channel: 'EMAIL' | 'WHATSAPP' | 'LINK' | 'DOWNLOAD') => api<{ comparison: ComparisonView; link: string; pdfFileId: string | null; whatsappUrl: string | null }>('POST', `/comparisons/${id}/share`, { channel }, { label: `Share comparison by ${channel.toLowerCase()}` }),
  choose: (id: string, version: number, productId: string) => apiFull<ComparisonView>('POST', `/comparisons/${id}/choose`, { version, productId }, { label: 'Customer chose this', idempotencyKey: false }),
  createQuotation: (id: string) => api<QuotationView>('POST', `/comparisons/${id}/create-quotation`, {}, { label: 'Create quotation' }),
};
export const publicComparison = async (token: string) => {
  const r = await fetch(`/v1/public/c/${encodeURIComponent(token)}`);
  if (!r.ok) return { valid: false, message: 'This link is not valid.' } as { valid: false; message: string };
  return (await r.json()).data as ({ valid: true; number: string; validUntil: string; customer: { name: string }; advisor: { name: string; businessName: string }; advisorMobile: string | null; recommendedProductId: string | null; recommendedReason: string | null; disclaimer: string } & CmpTable) | { valid: false; message: string };
};