import { api, apiFull } from './client';

/** Module 8: insurance catalogue (Section 9). */
export interface InsurerValues { name: string; shortCode: string; category: string; irdaiRegNo: string; website?: string | null; paymentDomains: string[]; careNumber?: string | null; careEmail?: string | null }
export interface CatInsurer extends InsurerValues {
  id: string; status: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'INACTIVE'; version: number; makerId: string | null; rejectReason: string | null; mine?: boolean;
  pendingChange: { values: InsurerValues; status: 'PENDING' | 'REJECTED'; makerId: string; at: string; reason: string | null } | null;
}
export interface Approval { changes?: Array<{ field: string; before: unknown; after: unknown }>; kind: 'INSURER' | 'TEMPLATE' | 'PRODUCT'; id: string; name: string; what: 'NEW' | 'CHANGE'; at: string; makerId: string; mine: boolean; version: number; current?: InsurerValues; proposed?: InsurerValues }

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

// ── Products (P-22, P-25) ──
export interface TplFeature { key: string; name: string; group: string; dataType: string; requiredToPublish: boolean; order: number; help?: string | null }
export interface FeatureValue { value?: string | number | boolean | null; page?: number | null; notStated?: boolean }
export interface ProductData {
  name?: string; description?: string | null; uin?: string; launchDate?: string;
  adultMin?: number; adultMax?: number; coversChildren?: boolean; childMin?: number | null; childMax?: number | null;
  sumInsured?: { options?: number[]; min?: number | null; max?: number | null }; policyTerms?: number[];
  features?: Record<string, FeatureValue>;
  addOns?: Array<{ name: string; description?: string | null; priceType: 'FIXED' | 'PERCENT'; value: number }>;
  pricingMode?: 'RATE_TABLE' | 'MANUAL_ENTRY'; taxPercent?: number; nomineeRequired?: boolean; maxNominees?: number; gracePeriodDays?: number | null;
  brochureFileId?: string | null; sourceLink?: string | null; sourceCheckedOn?: string | null;
}
export interface PVersion { id: string; productId: string; number: number; status: 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'SUPERSEDED'; templateId: string; data: ProductData; rejectReason: string | null; rev: number }
export interface AdminProductRow { id: string; code: string; name: string | null; status: string; version: number; insurer: string | null; type: string | null; openVersion: { id: string; number: number; status: string } | null }
export interface AdminProduct { id: string; code: string; status: string; version: number; withdrawnReason: string | null; insurer: { id: string; name: string }; type: { id: string; name: string }; currentTemplateId: string | null; versions: PVersion[] }
export interface CatalogueProduct { id: string; kind: 'VERIFIED' | 'OWN'; code: string; insurerId: string; typeId: string; name: string | null; status: string; insurer: string | null; type: string | null; quotable: boolean; renewalOnly: boolean }
export interface ProductDetail {
  id: string; kind: 'VERIFIED' | 'OWN'; code: string; status: string; version: number; insurerId: string; typeId: string; insurer: string | null; type: string | null;
  /** `data` is what advisors see ("Not stated by insurer" as text); `entered` (own products only) is what the owner typed: edit from it. */
  publishedVersion: { id: string; number: number; templateId: string; data: ProductData; entered?: ProductData } | null;
  features: TplFeature[];
}
export interface OwnType { id: string; name: string; template: { id: string; number: number } }
export interface LiveFeatures { typeId: string; typeName: string; template: { id: string; number: number }; features: TplFeature[] }

export const productsApi = {
  // SkyUp (verified products)
  adminList: (q?: string) => api<AdminProductRow[]>('GET', `/admin/products${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  adminGet: (id: string) => api<AdminProduct>('GET', `/admin/products/${id}`),
  adminCreate: (b: { insurerId: string; typeId: string; code: string }) => api<{ productId: string; version: PVersion }>('POST', '/admin/products', b, { label: '+ Product' }),
  startEdit: (id: string) => apiFull<PVersion>('POST', `/admin/products/${id}/versions`, {}, { label: 'Edit product', idempotencyKey: false }),
  saveDraft: (vid: string, rev: number, data: ProductData) => apiFull<PVersion>('PUT', `/admin/product-versions/${vid}`, { rev, data }, { label: 'Save product draft' }),
  useCurrentTemplate: (vid: string, rev: number) => apiFull<PVersion>('POST', `/admin/product-versions/${vid}/use-current-template`, { rev }, { label: 'Use current template' }),
  submit: (vid: string, rev: number) => apiFull<PVersion>('POST', `/admin/product-versions/${vid}/submit`, { rev }, { label: 'Submit product' }),
  approve: (vid: string, rev: number, token: string) => apiFull<PVersion>('POST', `/admin/product-versions/${vid}/approve`, { rev }, { label: 'Approve product', ...step(token) }),
  reject: (vid: string, rev: number, reason: string, token: string) => apiFull<PVersion>('POST', `/admin/product-versions/${vid}/reject`, { rev, reason }, { label: 'Reject product', ...step(token) }),
  withdraw: (id: string, version: number, reason: string) => apiFull<{ status: string }>('POST', `/admin/products/${id}/withdraw`, { version, reason }, { label: 'Withdraw product' }),
  makeAvailable: (id: string, version: number) => apiFull<{ status: string }>('POST', `/admin/products/${id}/make-available`, { version }, { label: 'Make available' }),
  // Advisors and assistants
  list: (opts: { quotable?: boolean } = {}) => api<CatalogueProduct[]>('GET', `/products${opts.quotable ? '?quotable=true' : ''}`),
  get: (id: string) => api<ProductDetail>('GET', `/products/${id}`),
  ownTypes: () => api<OwnType[]>('GET', '/my-products/types'),
  liveFeatures: (typeId: string) => api<LiveFeatures>('GET', `/my-products/types/${typeId}/template`),
  createOwn: (b: { insurerId: string; typeId: string; code: string; data: ProductData }) => apiFull<ProductDetail>('POST', '/my-products', b, { label: '+ My product' }),
  editOwn: (id: string, version: number, data: ProductData) => apiFull<ProductDetail>('PUT', `/my-products/${id}`, { version, data }, { label: 'Save my product' }),
  ownStatus: (id: string, version: number, status: 'UPCOMING' | 'ACTIVE' | 'WITHDRAWN') => apiFull<ProductDetail>('POST', `/my-products/${id}/status`, { version, status }, { label: 'Product status' }),
  commercials: (id: string) => api<{ commissionPercent: number | null; notes: string | null }>('GET', `/products/${id}/commercials`),
  saveCommercials: (id: string, b: { commissionPercent: string | null; notes: string | null }) => apiFull<{ commissionPercent: number | null }>('PUT', `/products/${id}/commercials`, b, { label: 'Save my commercials' }),
};

// ── Price versions (P-24): base is '/products' (my prices) or '/admin/products' (SkyUp reference price) ──
export interface PriceRow { factors: Record<string, string>; basePremium: number | string }
export interface PriceVersionView { id: string; number: number; name: string; effectiveFrom: string; effectiveTo: string | null; status: 'CURRENT' | 'SCHEDULED' | 'CLOSED' | 'CANCELLED'; taxPercent: number; rowCount: number; sourceNote: string | null; rows?: PriceRow[] }
export interface PriceTemplate { csv: string; columns: string[]; factors: Array<{ key: string; name: string; kind: string; choices: string[] }> }
export interface PriceCheck { accepted: number; errors: Array<{ row: number; problems: string[] }>; repeatedRows: number[]; missing: string[]; messages: Array<{ messageId: string; message: string }> }
export const pricesApi = {
  list: (base: string, id: string) => api<PriceVersionView[]>('GET', `${base}/${id}/prices`),
  template: (base: string, id: string) => api<PriceTemplate>('GET', `${base}/${id}/prices/template`),
  reference: (id: string) => api<PriceVersionView | null>('GET', `/products/${id}/prices/reference`),
  check: (base: string, id: string, b: { rows?: PriceRow[]; csv?: string }) => api<PriceCheck>('POST', `${base}/${id}/prices/check`, b, { label: 'Check rate table', idempotencyKey: false }),
  save: (base: string, id: string, b: { effectiveFrom: string; taxPercent: string; rows?: PriceRow[]; csv?: string; sourceNote?: string | null }) => apiFull<PriceVersionView>('POST', `${base}/${id}/prices`, b, { label: 'Save price' }),
  cancel: (base: string, id: string, pid: string) => apiFull<PriceVersionView>('POST', `${base}/${id}/prices/${pid}/cancel`, {}, { label: 'Cancel price' }),
};

// ── Corrections (P-58) and brochure OCR (P-23) ──
export interface CorrectionView { id: string; productId: string; field: string; currentValue: unknown; proposedValue: string; reason: string; status: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED'; rejectReason: string | null; createdAt: string; product?: string }
export interface OcrRow { key: string; name: string; dataType: string; found: boolean; value: string | null; confidence: number; page: number | null; decision: 'ACCEPT' | 'EDIT' | 'IGNORE' | 'NOT_STATED' | null; editedValue: string | null; flagged: boolean }
export interface OcrJobView { id: string; versionId: string; fileId: string; status: 'QUEUED' | 'PROCESSING' | 'REVIEW_REQUIRED' | 'REVIEWED' | 'FAILED'; error: string | null; applied: number; threshold: number; rows: OcrRow[] }
export const correctionsApi = {
  fields: (productId: string) => api<Array<{ field: string; label: string }>>('GET', `/products/${productId}/corrections/fields`),
  mine: (productId: string) => api<CorrectionView[]>('GET', `/products/${productId}/corrections`),
  suggest: (productId: string, b: { field: string; proposedValue: string; reason: string }) => apiFull<CorrectionView>('POST', `/products/${productId}/corrections`, b, { label: 'Suggest a correction' }),
  queue: () => api<CorrectionView[]>('GET', '/admin/corrections'),
  accept: (id: string) => api<{ draftVersionId: string }>('POST', `/admin/corrections/${id}/accept`, {}, { label: 'Accept correction', idempotencyKey: false }),
  reject: (id: string, reason: string) => api<CorrectionView>('POST', `/admin/corrections/${id}/reject`, { reason }, { label: 'Reject correction', idempotencyKey: false }),
};
export const ocrApi = {
  start: (vid: string, fileId: string) => apiFull<OcrJobView>('POST', `/admin/product-versions/${vid}/ocr`, { fileId }, { label: 'Read with OCR', idempotencyKey: false }),
  latest: (vid: string) => api<OcrJobView | null>('GET', `/admin/product-versions/${vid}/ocr`),
  decide: (id: string, decisions: Array<{ key: string; decision: string; value?: string | null }>) => api<OcrJobView>('PUT', `/admin/ocr-jobs/${id}/decisions`, { decisions }, { label: 'OCR decisions' }),
  acceptHigh: (id: string) => api<OcrJobView>('POST', `/admin/ocr-jobs/${id}/accept-high`, {}, { label: 'Accept high-confidence values', idempotencyKey: false }),
  apply: (id: string) => apiFull<OcrJobView>('POST', `/admin/ocr-jobs/${id}/apply`, {}, { label: 'Apply to draft', idempotencyKey: false }),
  retry: (id: string) => apiFull<OcrJobView>('POST', `/admin/ocr-jobs/${id}/retry`, {}, { label: 'Try OCR again', idempotencyKey: false }),
};