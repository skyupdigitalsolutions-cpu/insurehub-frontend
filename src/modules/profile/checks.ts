import { rawRequest } from '../../api/client';
import { uploadFile, type FilePurpose } from '../../api/profile';
import type { Check } from '../../ui/CheckList';
import { as, data, fields, fixtureAdvisor, fixtureLogin, meta, messageId, seen, verdict, withClock, type Fixture, type Reply } from '../checks/fixtures';

/** Your own session (cookie): for the review checks that need your SkyUp role. */
const mine = (method: string, path: string, body?: unknown) =>
  rawRequest(method, path, body, { label: `Check: ${path}`, idempotencyKey: method === 'POST' ? undefined : false });

// ── sample files (built in the browser) ──
const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const PNG = () => new Blob([bytes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')]);
const PDF = () => new Blob(['%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n']);
const PDF_LOCKED = () => new Blob(['%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R /Encrypt 2 0 R >>\n%%EOF\n']);
const PROGRAM = () => new Blob(['MZ\u0090\u0000this is a program, not a document']);

const put = async (f: Fixture, blob: Blob, purpose: FilePurpose, name: string): Promise<Reply> =>
  uploadFile(blob, purpose, name, { bearer: f.token, label: `Check: upload ${name}` });
const fileId = (r: Reply) => data<{ id: string }>(r).id;
const profileOf = async (f: Fixture) => data<{ sections: Record<string, { version: number } & Record<string, unknown>>; completion: { percent: number; missing: Array<{ section: string }>; messageId?: string } }>(await as(f.token, 'profile').get('/profile'));
const dmy = (daysFromToday: number) => { const d = new Date(Date.now() + daysFromToday * 86_400_000); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; };

/** An advisor with both KYC files uploaded, ready to submit. */
async function kycReady() {
  const f = await fixtureAdvisor();
  const pan = fileId(await put(f, PNG(), 'KYC_PAN', 'pan.png'));
  const licence = fileId(await put(f, PDF(), 'KYC_LICENCE', 'licence.pdf'));
  const submit = async (extra: object = {}) => {
    const k = data<{ version: number }>(await as(f.token, 'KYC').get('/kyc'));
    return as(f.token, 'submit KYC').put('/kyc', { version: k.version, pan: 'ABCPE1234F', nameOnPan: 'Console check advisor', panFileId: pan, licenceFileId: licence, declaration: true, ...extra });
  };
  return { f, pan, licence, submit };
}

/** Review checks run as YOU (SkyUp Admin or Staff). */
async function reviewer(): Promise<string | null> {
  const me = data<{ role: string }>(await mine('GET', '/auth/me'));
  return me.role === 'STF' || me.role === 'ADM' ? null : `You are ${me.role}. Sign in as the seeded SkyUp Admin to run this.`;
}
const reviewVersion = async (accountId: string) => data<{ version: number }>(await mine('GET', `/admin/kyc/${accountId}`)).version;

// ── P-07 fixtures: test insurers (dev tools; until the catalogue module) ──
async function testInsurer(status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') {
  const name = `Check Insurer ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const r = await rawRequest('POST', '/dev/insurers', { name, category: 'General', status }, { label: 'Check: create test insurer', idempotencyKey: false });
  if (!r.res.ok) throw new Error(`Could not create a test insurer (${r.res.status}). Is DEV_TOOLS=true?`);
  return { id: data<{ _id: string }>(r)._id, name };
}
const addInsurer = (f: Fixture, insurerId: string, extra: object = {}) =>
  as(f.token, 'add insurer').post('/my-insurers', { insurerId, agentCode: 'AG-1001', declaration: true, ...extra });

export const PROFILE_CHECKS: Check[] = [
  {
    id: 'start', title: 'P-05: a new advisor starts at 0% with the missing items grouped by section',
    expect: '0%; PRF-02; groups Personal, Contact, Professional, Business, KYC, Insurers',
    async run() {
      const p = await profileOf(await fixtureAdvisor());
      const groups = p.completion.missing.map((g) => g.section).join(', ');
      return { verdict: verdict(p.completion.percent === 0 && p.completion.messageId === 'PRF-02' && groups === 'Personal, Contact, Professional, Business, KYC, Insurers'), observed: `${p.completion.percent}% ${p.completion.messageId}; ${groups}` };
    },
  },
  {
    id: 'section', title: 'AC-P05-1/3: saving one section returns the new % and leaves the others unchanged',
    expect: 'Contact saved → 200 PRF-01 "…20% complete."; Personal still empty',
    async run() {
      const f = await fixtureAdvisor();
      const p = await profileOf(f);
      const r = await as(f.token, 'save contact').put('/profile/contact', { version: p.sections.contact!.version, email: 'check@example.com', address1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pin: '560001' });
      const after = await profileOf(f);
      const ok = r.res.status === 200 && meta(r).message === 'Profile saved. Your profile is 20% complete.' && after.sections.personal!.dob === null;
      return { verdict: verdict(ok), observed: `${seen(r)} "${meta(r).message ?? ''}"; personal DOB ${String(after.sections.personal!.dob)}` };
    },
  },
  {
    id: 'conflict', title: 'AC-P05-6: two tabs saving the same section cannot overwrite each other',
    expect: 'first save 200; second save with the same version → 409 VERSION_CONFLICT GEN-05',
    async run() {
      const f = await fixtureAdvisor();
      const v = (await profileOf(f)).sections.contact!.version;
      const a = await as(f.token, 'tab 1 saves contact').put('/profile/contact', { version: v, city: 'Mysuru' });
      const b = await as(f.token, 'tab 2 saves contact').put('/profile/contact', { version: v, city: 'Hubballi' });
      return { verdict: verdict(a.res.status === 200 && b.res.status === 409 && messageId(b) === 'GEN-05'), observed: `${seen(a)} / ${seen(b)}` };
    },
  },
  {
    id: 'age', title: 'PRF-14: an advisor younger than 18 is refused',
    expect: '400 with "You must be 18 or older to use Bimayantra as an advisor."',
    async run() {
      const f = await fixtureAdvisor();
      const r = await as(f.token, 'save under-age DOB').put('/profile/personal', { version: (await profileOf(f)).sections.personal!.version, dob: dmy(-17 * 365) });
      return { verdict: verdict(r.res.status === 400 && JSON.stringify(r.json).includes('You must be 18 or older')), observed: `${seen(r)} ${JSON.stringify(fields(r))}` };
    },
  },
  {
    id: 'fields', title: 'Field rules: licence number, licence date, experience',
    expect: '400: licenceNumber VAL-17, licenceValidUntil VAL-07, experienceYears VAL-12',
    async run() {
      const f = await fixtureAdvisor();
      const r = await as(f.token, 'bad professional').put('/profile/professional', { version: (await profileOf(f)).sections.professional!.version, licenceNumber: 'ab', licenceValidUntil: dmy(-2), experienceYears: 61 });
      const x = fields(r);
      return { verdict: verdict(x.licenceNumber === 'VAL-17' && x.licenceValidUntil === 'VAL-07' && x.experienceYears === 'VAL-12'), observed: `${seen(r)} ${JSON.stringify(x)}` };
    },
  },
  {
    id: 'file-type', title: 'FLD-22: the file type is judged by content, not by name',
    expect: 'a program named licence.pdf → 400 VAL-23; a PNG named licence.pdf → stored as PNG',
    async run() {
      const f = await fixtureAdvisor();
      const bad = await put(f, PROGRAM(), 'KYC_LICENCE', 'licence.pdf');
      const png = await put(f, PNG(), 'KYC_LICENCE', 'licence.pdf');
      const ok = bad.res.status === 400 && fields(bad).file === 'VAL-23' && png.res.status === 201 && data<{ type: string }>(png).type === 'PNG';
      return { verdict: verdict(ok), observed: `${seen(bad)} ${JSON.stringify(fields(bad))}; PNG-as-.pdf → ${png.res.status} ${png.res.ok ? data<{ type: string }>(png).type : ''}` };
    },
  },
  {
    id: 'file-locked', title: 'FLD-22: a password-protected PDF is refused',
    expect: '400 VAL-26 "This file could not be opened…"',
    async run() {
      const r = await put(await fixtureAdvisor(), PDF_LOCKED(), 'KYC_LICENCE', 'locked.pdf');
      return { verdict: verdict(r.res.status === 400 && fields(r).file === 'VAL-26'), observed: `${seen(r)} ${JSON.stringify(fields(r))}` };
    },
  },
  {
    id: 'file-private', title: 'AC-P06-4: another advisor cannot open these files',
    expect: 'owner 200; another advisor 404 GEN-11',
    async run() {
      const { f, pan } = await kycReady();
      const other = await fixtureAdvisor();
      const own = await as(f.token, 'owner opens PAN image').get(`/files/${pan}`);
      const peek = await as(other.token, 'other advisor opens PAN image').get(`/files/${pan}`);
      return { verdict: verdict(own.res.status === 200 && peek.res.status === 404 && messageId(peek) === 'GEN-11'), observed: `owner ${own.res.status}; other ${seen(peek)}` };
    },
  },
  {
    id: 'kyc-validation', title: 'P-06 validation: PAN format and the declaration',
    expect: '400: pan VAL-16, declaration VAL-29',
    async run() {
      const { submit } = await kycReady();
      const r = await submit({ pan: 'ABCDE1234F', declaration: false });
      const x = fields(r);
      return { verdict: verdict(x.pan === 'VAL-16' && x.declaration === 'VAL-29'), observed: `${seen(r)} ${JSON.stringify(x)}` };
    },
  },
  {
    id: 'kyc-submit', title: 'AC-P06-1: a complete submission goes to PENDING_REVIEW and counts towards the profile',
    expect: '200 PRF-04 "…within 2 working days."; status PENDING_REVIEW; KYC no longer missing',
    async run() {
      const { f, submit } = await kycReady();
      const r = await submit();
      const p = await profileOf(f);
      const ok = r.res.status === 200 && messageId(r) === 'PRF-04' && data<{ status: string }>(r).status === 'PENDING_REVIEW' && !p.completion.missing.some((g) => g.section === 'KYC');
      return { verdict: verdict(ok), observed: `${seen(r)} ${r.res.ok ? data<{ status: string }>(r).status : ''}; ${p.completion.percent}%` };
    },
  },
  {
    id: 'review', title: 'AC-P06-2: Reject needs a reason (PRF-06); Verify notifies with PRF-05',
    expect: 'signed in as STF or ADM: reject without reason → 400; reject → PRF-06; resubmit; verify → PRF-05',
    async run() {
      const blocked = await reviewer();
      if (blocked) return { verdict: 'blocked', observed: blocked };
      const { f, submit } = await kycReady();
      await submit();
      const acc = f.user.accountId!;
      const noReason = await mine('POST', `/admin/kyc/${acc}/decision`, { version: await reviewVersion(acc), decision: 'REJECT' });
      const rej = await mine('POST', `/admin/kyc/${acc}/decision`, { version: await reviewVersion(acc), decision: 'REJECT', reason: 'Document unclear' });
      await submit({ nameOnPan: 'Console check advisor K' });
      const ver = await mine('POST', `/admin/kyc/${acc}/decision`, { version: await reviewVersion(acc), decision: 'VERIFY' });
      const ok = noReason.res.status === 400 && messageId(rej) === 'PRF-06' && messageId(ver) === 'PRF-05';
      return { verdict: verdict(ok), observed: `no reason ${seen(noReason)}; reject ${seen(rej)}; verify ${seen(ver)}` };
    },
  },
  {
    id: 'review-twice', title: 'P-06: two reviewers deciding the same item — the second gets GEN-04',
    expect: 'signed in as STF or ADM: first decision 200; second with the same version → 409 GEN-04',
    async run() {
      const blocked = await reviewer();
      if (blocked) return { verdict: 'blocked', observed: blocked };
      const { f, submit } = await kycReady();
      await submit();
      const acc = f.user.accountId!;
      const v = await reviewVersion(acc);
      const first = await mine('POST', `/admin/kyc/${acc}/decision`, { version: v, decision: 'VERIFY' });
      const second = await mine('POST', `/admin/kyc/${acc}/decision`, { version: v, decision: 'REJECT', reason: 'PAN invalid' });
      return { verdict: verdict(first.res.status === 200 && second.res.status === 409 && messageId(second) === 'GEN-04'), observed: `${seen(first)} / ${seen(second)}` };
    },
  },
  {
    id: 'reverify', title: 'AC-P06-3: changing verified KYC asks PRF-07, then returns it to review',
    expect: 'signed in as STF or ADM: after Verify, change → 409 PRF-07; with confirmation → PENDING_REVIEW',
    async run() {
      const blocked = await reviewer();
      if (blocked) return { verdict: 'blocked', observed: blocked };
      const { f, submit } = await kycReady();
      await submit();
      const acc = f.user.accountId!;
      await mine('POST', `/admin/kyc/${acc}/decision`, { version: await reviewVersion(acc), decision: 'VERIFY' });
      const ask = await submit({ nameOnPan: 'Console check advisor R' });
      const ok2 = await submit({ nameOnPan: 'Console check advisor R', confirm: ['PRF-07'] });
      const ok = ask.res.status === 409 && messageId(ask) === 'PRF-07' && ok2.res.ok && data<{ status: string }>(ok2).status === 'PENDING_REVIEW';
      return { verdict: verdict(ok), observed: `${seen(ask)} / ${seen(ok2)} ${ok2.res.ok ? data<{ status: string }>(ok2).status : ''}` };
    },
  },
  {
    id: 'p07-add', title: 'AC-P07-1: an advisor can add many insurers, each with its own code',
    expect: 'two insurers → 201 PRF-08 "{Insurer} added with agent code {code}."; both ACTIVE',
    async run() {
      const f = await fixtureAdvisor();
      const a = await testInsurer(); const b = await testInsurer();
      const r1 = await addInsurer(f, a.id, { agentCode: 'ag/1001' });
      const r2 = await addInsurer(f, b.id, { agentCode: 'BL-77' });
      const list = data<Array<{ agentCode: string; status: string }>>(await as(f.token, 'my insurers').get('/my-insurers'));
      const ok = r1.res.status === 201 && meta(r1).message === `${a.name} added with agent code AG/1001.` && r2.res.status === 201 && list.length === 2 && list.every((m) => m.status === 'ACTIVE');
      return { verdict: verdict(ok), observed: `${seen(r1)} "${meta(r1).message ?? ''}"; ${list.map((m) => `${m.agentCode} ${m.status}`).join(', ')}` };
    },
  },
  {
    id: 'p07-twice', title: 'AC-P07-2: the same insurer cannot be added twice, even from two tabs at once',
    expect: 'two saves at the same moment → one 201, one 409 DUPLICATE PRF-09',
    async run() {
      const f = await fixtureAdvisor();
      const a = await testInsurer();
      const [x, y] = await Promise.all([addInsurer(f, a.id), addInsurer(f, a.id, { agentCode: 'AG-2002' })]);
      const codes = [x.res.status, y.res.status].sort().join('/');
      const dup = x.res.status === 409 ? x : y;
      return { verdict: verdict(codes === '201/409' && messageId(dup) === 'PRF-09'), observed: `${seen(x)} / ${seen(y)}` };
    },
  },
  {
    id: 'p07-inactive', title: 'AC-P07-3: an INACTIVE insurer cannot be added and is not offered',
    expect: '400 insurerId VAL-22; not in the Add insurer list',
    async run() {
      const f = await fixtureAdvisor();
      const off = await testInsurer('INACTIVE');
      const r = await addInsurer(f, off.id);
      const offered = data<Array<{ id: string }>>(await as(f.token, 'available insurers').get('/my-insurers/available')).some((i) => i.id === off.id);
      return { verdict: verdict(r.res.status === 400 && fields(r).insurerId === 'VAL-22' && !offered), observed: `${seen(r)} ${JSON.stringify(fields(r))}; offered: ${offered}` };
    },
  },
  {
    id: 'p07-fields', title: 'P-07 validation: agent code, validity date, declaration',
    expect: '400: agentCode VAL-18, validUntil VAL-07, declaration VAL-29',
    async run() {
      const f = await fixtureAdvisor();
      const a = await testInsurer();
      const r = await addInsurer(f, a.id, { agentCode: 'a', validUntil: dmy(-2), declaration: false });
      const x = fields(r);
      return { verdict: verdict(x.agentCode === 'VAL-18' && x.validUntil === 'VAL-07' && x.declaration === 'VAL-29'), observed: `${seen(r)} ${JSON.stringify(x)}` };
    },
  },
  {
    id: 'p07-deactivate', title: 'AC-P07-4: Deactivate asks PRF-12 first; Activate reverses it',
    expect: 'without confirmation → 409 PRF-12; with → INACTIVE; Activate → ACTIVE',
    async run() {
      const f = await fixtureAdvisor();
      const a = await testInsurer();
      const m = data<{ id: string; version: number }>(await addInsurer(f, a.id));
      const ask = await as(f.token, 'deactivate').post(`/my-insurers/${m.id}/deactivate`, { version: m.version });
      const off = await as(f.token, 'deactivate (confirmed)').post(`/my-insurers/${m.id}/deactivate`, { version: m.version, confirm: ['PRF-12'] });
      const on = await as(f.token, 'activate').post(`/my-insurers/${m.id}/activate`, { version: data<{ version: number }>(off).version });
      const ok = ask.res.status === 409 && messageId(ask) === 'PRF-12' && data<{ status: string }>(off).status === 'INACTIVE' && data<{ status: string }>(on).status === 'ACTIVE';
      return { verdict: verdict(ok), observed: `${seen(ask)} / ${off.res.ok ? data<{ status: string }>(off).status : seen(off)} / ${on.res.ok ? data<{ status: string }>(on).status : seen(on)}` };
    },
  },
  {
    id: 'p07-prf10', title: 'PRF-10: when SkyUp makes an insurer INACTIVE, the entry warns and cannot be re-activated',
    expect: 'entry shows PRF-10; Activate → 409 PRF-10',
    async run() {
      const f = await fixtureAdvisor();
      const a = await testInsurer();
      const m = data<{ id: string; version: number }>(await addInsurer(f, a.id));
      const off = await as(f.token, 'deactivate').post(`/my-insurers/${m.id}/deactivate`, { version: m.version, confirm: ['PRF-12'] });
      await rawRequest('POST', `/dev/insurers/${a.id}/status`, { status: 'INACTIVE' }, { label: 'Check: insurer INACTIVE', idempotencyKey: false });
      const list = data<Array<{ warnings: Array<{ messageId: string }> }>>(await as(f.token, 'my insurers').get('/my-insurers'));
      const act = await as(f.token, 'activate').post(`/my-insurers/${m.id}/activate`, { version: data<{ version: number }>(off).version });
      const ok = list[0]?.warnings.some((w) => w.messageId === 'PRF-10') === true && act.res.status === 409 && messageId(act) === 'PRF-10';
      return { verdict: verdict(ok), observed: `warnings ${JSON.stringify(list[0]?.warnings.map((w) => w.messageId))}; activate ${seen(act)}` };
    },
  },
  {
    id: 'p07-completion', title: 'P-05: an ACTIVE insurer adds the Insurers 15%; deactivating removes it',
    expect: '0% → add insurer → 15% → deactivate → 0%',
    async run() {
      const f = await fixtureAdvisor();
      const a = await testInsurer();
      const before = (await profileOf(f)).completion.percent;
      const m = data<{ id: string; version: number }>(await addInsurer(f, a.id));
      const added = (await profileOf(f)).completion.percent;
      await as(f.token, 'deactivate').post(`/my-insurers/${m.id}/deactivate`, { version: m.version, confirm: ['PRF-12'] });
      const after = (await profileOf(f)).completion.percent;
      return { verdict: verdict(before === 0 && added === 15 && after === 0), observed: `${before}% → ${added}% → ${after}%` };
    },
  },
  {
    id: 'p07-isolation', title: 'GR-20: another advisor cannot see or change these insurers',
    expect: 'their list is empty; edit → 404 GEN-11',
    async run() {
      const f = await fixtureAdvisor();
      const a = await testInsurer();
      const m = data<{ id: string; version: number }>(await addInsurer(f, a.id));
      const other = await fixtureAdvisor();
      const list = data<unknown[]>(await as(other.token, 'other advisor lists').get('/my-insurers'));
      const edit = await as(other.token, 'other advisor edits').patch(`/my-insurers/${m.id}`, { version: m.version, agentCode: 'X-1' });
      return { verdict: verdict(list.length === 0 && edit.res.status === 404 && messageId(edit) === 'GEN-11'), observed: `their list ${list.length}; edit ${seen(edit)}` };
    },
  },
  {
    id: 'p07-expired', title: 'AC-P07-5: an expired code date blocks new quotations with PRF-11',
    expect: 'code valid until tomorrow; clock moved 2 days ahead → the entry shows PRF-11',
    destructive: 'Moves the test clock 2 days ahead for a moment, then back. Avoid clicking elsewhere while it runs.',
    async run() {
      const f = await fixtureAdvisor();
      const a = await testInsurer();
      await addInsurer(f, a.id, { validUntil: dmy(1) });
      // Two days later the 15-minute sign-in has expired too, so sign in again inside the moved clock.
      return withClock(2 * 24 * 60, async () => {
        const s2 = await fixtureLogin(f.mobile, 'sign in 2 days later');
        const list = data<Array<{ warnings: Array<{ messageId: string; message: string }> }>>(await as(s2.token, 'my insurers').get('/my-insurers'));
        const w = list[0]?.warnings.find((x) => x.messageId === 'PRF-11');
        return { verdict: verdict(!!w && w.message.startsWith(`Your agent code for ${a.name} expired on `)), observed: w ? w.message : JSON.stringify(list[0]?.warnings ?? list) };
      });
    },
  },
];