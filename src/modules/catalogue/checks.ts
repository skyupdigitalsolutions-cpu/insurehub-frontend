import { rawRequest } from '../../api/client';
import { latestOtp } from '../../api/dev';
import type { Check } from '../../ui/CheckList';
import { as, data, fields, fixtureAdvisor, fixtureLogin, meta, messageId, randomMobile, seen, verdict, type Fixture } from '../checks/fixtures';

/** Your own session (the seeded SkyUp Admin): the approver in these checks. */
const mine = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  rawRequest(method, path, body, { label: `Check: ${path}`, headers, idempotencyKey: method === 'POST' ? undefined : false });
const resetLimits = () => rawRequest('POST', '/dev/reset-limits', {}, { label: 'Reset limits and OTP locks', idempotencyKey: false });

/** A fresh step-up OTP for you, read from the dev inbox (AUTH-26). */
async function myStepUp(mobile: string) {
  await resetLimits();
  await mine('POST', '/auth/step-up/otp', {});
  return data<{ stepUpToken: string }>(await mine('POST', '/auth/step-up/verify', { code: await latestOtp(mobile) })).stepUpToken;
}

async function me() {
  const m = data<{ id: string; role: string; mobile: string }>(await mine('GET', '/auth/me'));
  return m.role === 'ADM' ? m : null;
}
const blocked = { verdict: 'blocked' as const, observed: 'Sign in as the seeded SkyUp Admin to run this.' };

/** A throwaway SkyUp Staff member: the MAKER in these checks (added with your OTP). */
async function staffMaker(adminMobile: string): Promise<Fixture> {
  const mobile = randomMobile();
  await mine('POST', '/staff', { name: 'Console check staff', mobile, role: 'STF' }, { 'X-Step-Up-Token': await myStepUp(adminMobile) });
  await resetLimits();
  return fixtureLogin(mobile, 'log in check staff');
}

const uniq = () => Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1e4);
const insurer = (u: string, extra: object = {}) => ({ name: `Check Insurer ${u}`, shortCode: `CHK-${u}`, category: 'General', irdaiRegNo: `IRDAI-${u}`, paymentDomains: ['checkinsurer.in'], ...extra });
const approve = async (adminMobile: string, id: string, version: number) => mine('POST', `/admin/insurers/${id}/approve`, { version }, { 'X-Step-Up-Token': await myStepUp(adminMobile) });

const FEATURES = [
  { name: 'Room rent limit', group: 'Limits and sub-limits', dataType: 'Amount in ₹', requiredToPublish: true },
  { name: 'Pre-existing disease waiting period', group: 'Waiting periods', dataType: 'Months', requiredToPublish: true },
];
const AGE = { name: 'Age of eldest', kind: 'BAND', source: 'Age of the eldest insured person', bands: [{ from: 18, to: 35 }, { from: 36, to: 45 }] };
/** A throwaway insurance type with its empty DRAFT template version 1. */
async function newType(token?: string) {
  const body = { name: `Check type ${uniq()}` };
  const r = token ? await as(token, 'add insurance type').post('/admin/types', body) : await mine('POST', '/admin/types', body);
  return data<{ type: { id: string }; template: { id: string; rev: number } }>(r);
}

export const CATALOGUE_CHECKS: Check[] = [
  {
    id: 'p20-fields', title: 'P-20 fields: code capitals, bare payment domain (CAT-10), https web address, Indian phone',
    expect: '400: shortCode VAL-33, paymentDomains CAT-10, website VAL-28, careNumber VAL-36',
    async run() {
      const a = await me(); if (!a) return blocked;
      const r = await mine('POST', '/admin/insurers', insurer(uniq(), { shortCode: 'A B', paymentDomains: ['https://x.in/pay'], website: 'x.in', careNumber: '123' }));
      const f = fields(r);
      const ok = f.shortCode === 'VAL-33' && (f.paymentDomains === 'CAT-10' || f['paymentDomains.0'] === 'CAT-10') && f.website === 'VAL-28' && f.careNumber === 'VAL-36';
      return { verdict: verdict(ok), observed: `${seen(r)} ${JSON.stringify(f)}` };
    },
  },
  {
    id: 'p20-duplicate', title: 'AC-P20-1: a duplicate name (ignoring case) or code is refused',
    expect: 'same name in capitals → CAT-06; same code → CAT-07',
    async run() {
      const a = await me(); if (!a) return blocked;
      const u = uniq();
      await mine('POST', '/admin/insurers', insurer(u));
      const byName = await mine('POST', '/admin/insurers', insurer(uniq(), { name: `CHECK INSURER ${u}` }));
      const byCode = await mine('POST', '/admin/insurers', insurer(uniq(), { shortCode: `CHK-${u}` }));
      return { verdict: verdict(fields(byName).name === 'CAT-06' && fields(byCode).shortCode === 'CAT-07'), observed: `${JSON.stringify(fields(byName))} / ${JSON.stringify(fields(byCode))}` };
    },
  },
  {
    id: 'p20-own', title: 'AC-P20-2: the maker cannot approve their own insurer',
    expect: 'you submit, then approve with OTP → 403 CAT-05 "You made this change, so another admin must approve it."',
    async run() {
      const a = await me(); if (!a) return blocked;
      const d = data<{ id: string; version: number }>(await mine('POST', '/admin/insurers', insurer(uniq(), { submit: true })));
      const r = await approve(a.mobile, d.id, d.version);
      return { verdict: verdict(r.res.status === 403 && messageId(r) === 'CAT-05'), observed: seen(r) };
    },
  },
  {
    id: 'p20-approve', title: 'P-20 maker-checker: staff submits (CAT-02); you approve with OTP (CAT-03) → ACTIVE',
    expect: 'staff: "… sent for approval."; you: "… approved.", status ACTIVE',
    async run() {
      const a = await me(); if (!a) return blocked;
      const s = await staffMaker(a.mobile);
      const sub = await as(s.token, 'staff submits insurer').post('/admin/insurers', insurer(uniq(), { submit: true }));
      const d = data<{ id: string; version: number; name: string }>(sub);
      const r = await approve(a.mobile, d.id, d.version);
      const ok = meta(sub).message === `${d.name} sent for approval.` && meta(r).message === `${d.name} approved.` && data<{ status: string }>(r).status === 'ACTIVE';
      return { verdict: verdict(ok), observed: `"${meta(sub).message}" / "${meta(r).message ?? seen(r)}"` };
    },
  },
  {
    id: 'p20-reject', title: 'P-20: Reject with a reason (CAT-04) returns it to DRAFT with every value kept',
    expect: '"… rejected. Reason: …"; DRAFT; website still filled',
    async run() {
      const a = await me(); if (!a) return blocked;
      const s = await staffMaker(a.mobile);
      const d = data<{ id: string; version: number; name: string }>(await as(s.token, 'staff submits insurer').post('/admin/insurers', insurer(uniq(), { website: 'https://checkinsurer.in', submit: true })));
      await resetLimits();
      const r = await mine('POST', `/admin/insurers/${d.id}/reject`, { version: d.version, reason: 'Wrong IRDAI number' }, { 'X-Step-Up-Token': await myStepUp(a.mobile) });
      const x = data<{ status: string; website: string; rejectReason: string }>(r);
      const ok = meta(r).message === `${d.name} rejected. Reason: Wrong IRDAI number` && x.status === 'DRAFT' && x.website === 'https://checkinsurer.in';
      return { verdict: verdict(ok), observed: `"${meta(r).message ?? seen(r)}" ${x?.status}` };
    },
  },
  {
    id: 'p20-pending', title: 'AC-P20-3: an edit to an ACTIVE insurer is not visible to advisors until approved',
    expect: 'staff renames; advisors still see the old name; a second change → CAT-08; after approval the new name',
    async run() {
      const a = await me(); if (!a) return blocked;
      const s = await staffMaker(a.mobile);
      const u = uniq();
      const d = data<{ id: string; version: number; name: string }>(await as(s.token, 'staff submits insurer').post('/admin/insurers', insurer(u, { submit: true })));
      const live = data<{ version: number }>(await approve(a.mobile, d.id, d.version));
      const adv = await fixtureAdvisor();
      const seenName = async () => data<Array<{ id: string; name: string }>>(await as(adv.token, 'advisor insurer list').get('/my-insurers/available')).find((i) => i.id === d.id)?.name;
      const ch = data<{ version: number }>(await as(s.token, 'staff proposes rename').patch(`/admin/insurers/${d.id}`, { version: live.version, name: `Renamed Insurer ${u}` }));
      const before = await seenName();
      const second = await as(s.token, 'second change').patch(`/admin/insurers/${d.id}`, { version: ch.version, careNumber: '1800 123 4567' });
      await approve(a.mobile, d.id, ch.version);
      const after = await seenName();
      const ok = before === d.name && messageId(second) === 'CAT-08' && after === `Renamed Insurer ${u}`;
      return { verdict: verdict(ok), observed: `before "${before}"; second ${seen(second)}; after "${after}"` };
    },
  },
  {
    id: 'p20-deactivate', title: 'AC-P20-4: deactivation asks CAT-09, then blocks new mappings; existing ones are kept',
    expect: 'CAT-09 with "affects 1 advisors"; INACTIVE; a new advisor cannot add it (VAL-22)',
    async run() {
      const a = await me(); if (!a) return blocked;
      const s = await staffMaker(a.mobile);
      const d = data<{ id: string; version: number }>(await as(s.token, 'staff submits insurer').post('/admin/insurers', insurer(uniq(), { submit: true })));
      const live = data<{ version: number }>(await approve(a.mobile, d.id, d.version));
      const adv = await fixtureAdvisor();
      await as(adv.token, 'advisor adds insurer').post('/my-insurers', { insurerId: d.id, agentCode: 'AG-1', declaration: true });
      const ask = await mine('POST', `/admin/insurers/${d.id}/deactivate`, { version: live.version });
      const off = await mine('POST', `/admin/insurers/${d.id}/deactivate`, { version: live.version, confirm: ['CAT-09'] });
      const other = await fixtureAdvisor();
      const add = await as(other.token, 'new advisor adds insurer').post('/my-insurers', { insurerId: d.id, agentCode: 'AG-2', declaration: true });
      const kept = data<Array<{ insurer: { id: string } }>>(await as(adv.token, 'existing mapping').get('/my-insurers')).length;
      const ok = messageId(ask) === 'CAT-09' && JSON.stringify(ask.json).includes('affects 1 advisors') && data<{ status: string }>(off).status === 'INACTIVE' && fields(add).insurerId === 'VAL-22' && kept === 1;
      return { verdict: verdict(ok), observed: `${seen(ask)}; ${off.res.ok ? data<{ status: string }>(off).status : seen(off)}; new advisor ${JSON.stringify(fields(add))}; kept ${kept}` };
    },
  },
  // ── P-21 insurance types and feature templates ──
  {
    id: 'p21-empty', title: 'P-21: a template needs at least one feature (CAT-12) and one rating factor (CAT-30)',
    expect: 'submit an empty draft → features CAT-12, factors CAT-30',
    async run() {
      const a = await me(); if (!a) return blocked;
      const t = await newType();
      const r = await mine('POST', `/admin/templates/${t.template.id}/submit`, { rev: t.template.rev });
      return { verdict: verdict(fields(r).features === 'CAT-12' && fields(r).factors === 'CAT-30'), observed: `${seen(r)} ${JSON.stringify(fields(r))}` };
    },
  },
  {
    id: 'p21-bands', title: 'AC-P21-2: overlapping, gapped or reversed bands are refused (CAT-16)',
    expect: 'bands 18-40, 36-45, 50-60, 70-65 → CAT-16 on bands 2, 3 and 4',
    async run() {
      const a = await me(); if (!a) return blocked;
      const t = await newType();
      const saved = data<{ rev: number }>(await mine('PUT', `/admin/templates/${t.template.id}`, { rev: t.template.rev, features: FEATURES, factors: [{ ...AGE, bands: [{ from: 18, to: 40 }, { from: 36, to: 45 }, { from: 50, to: 60 }, { from: 70, to: 65 }] }], questions: [] }));
      const r = await mine('POST', `/admin/templates/${t.template.id}/submit`, { rev: saved.rev });
      const f = fields(r);
      return { verdict: verdict(f['factors.0.bands.1'] === 'CAT-16' && f['factors.0.bands.2'] === 'CAT-16' && f['factors.0.bands.3'] === 'CAT-16'), observed: JSON.stringify(f) };
    },
  },
  {
    id: 'p21-approve', title: 'P-21 maker-checker: staff submits a template; you approve with OTP → ACTIVE; version 2 retires version 1',
    expect: 'version 1 ACTIVE; after version 2 is approved, version 1 RETIRED and still has its features',
    async run() {
      const a = await me(); if (!a) return blocked;
      const s = await staffMaker(a.mobile);
      const t = await newType(s.token);
      const v1 = data<{ rev: number }>(await as(s.token, 'staff saves template').put(`/admin/templates/${t.template.id}`, { rev: t.template.rev, features: FEATURES, factors: [AGE], questions: [] }));
      const s1 = data<{ rev: number }>(await as(s.token, 'staff submits template').post(`/admin/templates/${t.template.id}/submit`, { rev: v1.rev }));
      const ok1 = await mine('POST', `/admin/templates/${t.template.id}/approve`, { rev: s1.rev }, { 'X-Step-Up-Token': await myStepUp(a.mobile) });
      const v2 = data<{ id: string; rev: number; features: unknown[]; factors: unknown[] }>(await as(s.token, 'staff starts version 2').post(`/admin/types/${t.type.id}/templates`, {}));
      const v2s = data<{ rev: number }>(await as(s.token, 'staff saves version 2').put(`/admin/templates/${v2.id}`, { rev: v2.rev, features: [FEATURES[0]], factors: v2.factors, questions: [] }));
      const s2 = data<{ rev: number }>(await as(s.token, 'staff submits version 2').post(`/admin/templates/${v2.id}/submit`, { rev: v2s.rev }));
      await mine('POST', `/admin/templates/${v2.id}/approve`, { rev: s2.rev }, { 'X-Step-Up-Token': await myStepUp(a.mobile) });
      const old = data<{ status: string; features: unknown[] }>(await mine('GET', `/admin/templates/${t.template.id}`));
      const ok = data<{ status: string }>(ok1).status === 'ACTIVE' && old.status === 'RETIRED' && old.features.length === 2;
      return { verdict: verdict(ok), observed: `v1 approved: ${ok1.res.ok ? data<{ status: string }>(ok1).status : seen(ok1)}; v1 now ${old.status} with ${old.features.length} features` };
    },
  },
  {
    id: 'p21-one-draft', title: 'P-21: one open template version per type (CAT-08)',
    expect: 'a second Edit template while a draft exists → 409 CAT-08',
    async run() {
      const a = await me(); if (!a) return blocked;
      const t = await newType();
      const r = await mine('POST', `/admin/types/${t.type.id}/templates`, {});
      return { verdict: verdict(r.res.status === 409 && messageId(r) === 'CAT-08'), observed: seen(r) };
    },
  },
];