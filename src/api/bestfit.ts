import { api } from './client';

/** Module 9: best-fit ranking (P-26). */
export const PRIORITY_LABEL: Record<string, string> = { LOWEST_PREMIUM: 'Lowest premium', BEST_COVERAGE: 'Best coverage', CLAIM_RELIABILITY: 'Claim reliability', PRE_EXISTING: 'Pre-existing condition' };
export interface Part { score: number; reason: string }
export interface Ranked {
  productId: string; kind: 'VERIFIED' | 'OWN'; name: string; insurer: string; premium: number | null; total: number; covers: number; of: number;
  parts: { budget: Part; roomRent: Part; coPay: Part; waiting: Part; claimRatio: Part }; coverage?: { messageId: string; message: string };
}
export interface Ranking { rankingId: string; weights: number[]; results: Ranked[]; summary: { text: string | null; message: string } | null; messageId: string; message: string }
export const bestFitApi = {
  options: (customerId: string, typeId: string) => api<{ people: Array<{ key: string; name: string; relationship: string; hasDob: boolean }>; sumInsuredOptions: number[]; priorities: string[] }>('GET', `/customers/${customerId}/best-fit/options?typeId=${typeId}`),
  rank: (customerId: string, b: { typeId: string; people: string[]; budget: string; priority: string; sumInsured: number }) => api<Ranking>('POST', `/customers/${customerId}/best-fit`, b, { label: 'Rank by best fit', idempotencyKey: false }),
  choose: (customerId: string, rankingId: string, productId: string) => api<unknown>('POST', `/customers/${customerId}/best-fit/${rankingId}/choose`, { productId }, { label: 'Choose product', idempotencyKey: false }),
};