import { api, apiFull } from './client';

/** Module 11: payments (P-31, P-32) and proposals (P-55). Bimayantra records payments; it never moves money. */
export interface PaymentView {
  id: string; quotationId: string; revision: number; status: string; statusLabel: string; method: string | null; link: string | null; portalAmount: number | null;
  mode: string | null; amount: number | null; paymentDate: string | null; reference: string | null; reason: string | null; createdAt: string;
}
export const MODES = ['Insurer payment link', 'UPI', 'Net banking', 'Card', 'Cheque', 'Cash'];
export const NEEDS_REFERENCE = ['Insurer payment link', 'UPI', 'Net banking', 'Card', 'Cheque'];
export const paymentsApi = {
  list: (quotationId: string) => api<PaymentView[]>('GET', `/quotations/${quotationId}/payments`),
  addLink: (quotationId: string, b: Record<string, unknown>, replace = false) => apiFull<PaymentView>('POST', `/quotations/${quotationId}/payment-link${replace ? '/replace' : ''}`, b, { label: replace ? 'Replace payment link' : 'Add payment link' }),
  record: (quotationId: string, b: Record<string, unknown>) => apiFull<PaymentView>('POST', `/quotations/${quotationId}/payments`, b, { label: 'Record payment' }),
  fail: (id: string, reason: string) => apiFull<PaymentView>('POST', `/payments/${id}/fail`, { reason }, { label: 'Mark payment failed', idempotencyKey: false }),
  expire: (id: string) => apiFull<PaymentView>('POST', `/payments/${id}/expire`, {}, { label: 'Mark link expired', idempotencyKey: false }),
  undo: (id: string, reason: string) => apiFull<PaymentView>('POST', `/payments/${id}/undo`, { reason }, { label: 'Undo payment', idempotencyKey: false }),
};
export type Answer = { answer: boolean; condition?: string | null; since?: string | null; treatment?: string | null };
export type Nominee = { name: string; relationship: string; dob: string; share: number; appointee?: { name: string; dob: string } | null };
export interface ProposalView {
  id: string; number: string; status: 'DRAFT' | 'SUBMITTED' | 'DECLINED'; quotationId: string; revision: number; customerId: string;
  members: Array<{ name: string; relationship: string; dob: string | null; age: number }>; questions: string[];
  declarations: Array<{ member: string; answers: Record<string, Answer> }>; nominees: Nominee[]; declineReason: string | null; policyId: string | null; version: number;
  warning?: { message: string };
  readiness?: { kyc: boolean; paid: { amount: number; mode: string; date: string; label: string } | null; problems: Array<{ field: string; message: string }> };
}
export const proposalsApi = {
  list: () => api<ProposalView[]>('GET', '/proposals'),
  get: (id: string) => api<ProposalView>('GET', `/proposals/${id}`),
  start: (quotationId: string) => apiFull<ProposalView>('POST', '/proposals', { quotationId }, { label: 'Start proposal' }),
  save: (id: string, b: { version: number; declarations: ProposalView['declarations']; nominees: Nominee[] }) => api<ProposalView>('PUT', `/proposals/${id}`, b, { label: 'Save proposal' }),
  submit: (id: string, version: number) => apiFull<ProposalView>('POST', `/proposals/${id}/submit`, { version }, { label: 'Submit proposal' }),
  decline: (id: string, version: number, reason: string) => apiFull<ProposalView>('POST', `/proposals/${id}/decline`, { version, reason }, { label: 'Mark declined', idempotencyKey: false }),
};