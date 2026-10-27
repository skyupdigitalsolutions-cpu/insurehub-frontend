import { uploadFile } from '../../api/profile';
import { loadReference } from '../../api/reference';
import type { Check } from '../../ui/CheckList';
import { addFixtureAssistant, as, data, fields, fixtureAdvisor, fixtureLogin, meta, messageId, randomMobile, seen, verdict, type Fixture, type Reply } from '../checks/fixtures';

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const PNG = () => new Blob([bytes('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')]);

/** A throwaway advisor with one customer; consent: give personal-data consent through the API. */
async function setup(consent = true) {
  const f = await fixtureAdvisor();
  const cus = data<{ id: string; name: string }>(await as(f.token, 'create customer').post('/customers', { name: 'Console check customer', mobile: randomMobile() }));
  if (consent) {
    const ref = await loadReference();
    await as(f.token, 'record personal-data consent').post(`/customers/${cus.id}/consents`, { personType: 'CUSTOMER', personId: cus.id, channel: 'PERSONAL_DATA', action: 'GIVE', howGiven: ref.consentHowGiven[0], declaration: true });
  }
  const file = async (token = f.token) => data<{ id: string }>(await uploadFile(PNG(), 'CUSTOMER_DOCUMENT', 'scan.png', { bearer: token, label: 'Check: upload scan.png' })).id;
  const add = async (type: string, extra: object = {}, token = f.token): Promise<Reply> =>
    as(token, `add ${type}`).post('/documents', { customerId: cus.id, personKey: `C:${cus.id}`, type, fileId: await file(token), ...extra });
  return { f, cus, file, add };
}
/** + Vehicle with n slot photos and an RC (P-54). */
async function addVehicle(f: Fixture, customerId: string, n: number, extra: object = {}) {
  const slots = ['Front', 'Rear', 'Left', 'Right', 'Odometer', 'Chassis number'].slice(0, n);
  const up = async () => data<{ id: string }>(await uploadFile(PNG(), 'CUSTOMER_DOCUMENT', 'photo.png', { bearer: f.token, label: 'Check: upload photo.png' })).id;
  const photos = await Promise.all(slots.map(async (slot) => ({ slot, fileId: await up() })));
  return as(f.token, 'save vehicle').post(`/customers/${customerId}/vehicles`, { registration: 'KA01AB1234', vehicleType: 'Private car', make: 'Maruti', model: 'Swift', year: 2021, fuel: 'Petrol', rcFileId: await up(), photos, ...extra });
}
const docOf = (r: Reply) => data<{ id: string; rev: number; version: number; status: string; file: { id: string } }>(r);
const listOf = async (f: Fixture, customerId: string) => data<{ groups: Array<{ type: string; versions: Array<{ version: number }> }>; missing: { message: string } | null }>(await as(f.token, 'list documents').get(`/customers/${customerId}/documents`));

export const DOCUMENT_CHECKS: Check[] = [
  {
    id: 'p18-required', title: 'AC-P18-1: upload needs customer, person and type; Other needs a name',
    expect: 'nothing chosen → 400 DOC-01; Other without a name → DOC-02; with a name → 201 "… saved as version 1."',
    async run() {
      const { f, cus, file } = await setup(false);
      const none = await as(f.token, 'add with nothing chosen').post('/documents', { fileId: await file() });
      const other = await as(f.token, 'add Other without a name').post('/documents', { customerId: cus.id, personKey: `C:${cus.id}`, type: 'Other', fileId: await file() });
      const named = await as(f.token, 'add Other with a name').post('/documents', { customerId: cus.id, personKey: `C:${cus.id}`, type: 'Other', name: 'Rent agreement', fileId: await file() });
      const ok = messageId(none) === 'DOC-01' && fields(other).name === 'DOC-02' && meta(named).message === 'Rent agreement saved as version 1.';
      return { verdict: verdict(ok), observed: `${seen(none)}; ${JSON.stringify(fields(other))}; "${meta(named).message ?? seen(named)}"` };
    },
  },
  {
    id: 'p18-versions', title: 'AC-P18-2: re-uploading a type creates version 2 and keeps version 1',
    expect: '"Medical report saved as version 2."; the list shows versions 2 and 1',
    async run() {
      const { f, cus, add } = await setup(false);
      await add('Medical report');
      const second = await add('Medical report');
      const g = (await listOf(f, cus.id)).groups.find((x) => x.type === 'Medical report');
      return { verdict: verdict(meta(second).message === 'Medical report saved as version 2.' && JSON.stringify(g?.versions.map((v) => v.version)) === '[2,1]'), observed: `"${meta(second).message}"; versions ${JSON.stringify(g?.versions.map((v) => v.version))}` };
    },
  },
  {
    id: 'p18-delete', title: 'AC-P18-3: no role can delete a document, by API',
    expect: 'advisor and assistant DELETE → 409 DOC-07; the document is still listed',
    async run() {
      const { f, cus, add } = await setup(false);
      const d = docOf(await add('Photo'));
      const adv = await as(f.token, 'advisor deletes').del(`/documents/${d.id}`);
      const { mobile } = await addFixtureAssistant(f);
      const ast = await fixtureLogin(mobile, 'log in assistant');
      const asst = await as(ast.token, 'assistant deletes').del(`/documents/${d.id}`);
      const still = (await listOf(f, cus.id)).groups.some((g) => g.type === 'Photo');
      return { verdict: verdict(messageId(adv) === 'DOC-07' && messageId(asst) === 'DOC-07' && still), observed: `${seen(adv)} / ${seen(asst)}; still listed: ${still}` };
    },
  },
  {
    id: 'p18-unconfirmed', title: 'AC-P18-4: nothing read from a PAN is saved before Confirm',
    expect: 'status UNCONFIRMED, DOC-10 (manual entry); customer PAN still empty; Missing box shows "waiting to be checked"',
    async run() {
      const { f, cus, add } = await setup();
      const r = await add('PAN');
      const d = data<{ status: string; verify: { messageId: string } | null }>(r);
      const c = data<{ identity: { pan: string | null } }>(await as(f.token, 'read customer').get(`/customers/${cus.id}`));
      const missing = (await listOf(f, cus.id)).missing?.message ?? '';
      const ok = d.status === 'UNCONFIRMED' && d.verify?.messageId === 'DOC-10' && !c.identity.pan && missing.endsWith('Aadhaar, PAN (waiting to be checked).');
      return { verdict: verdict(ok), observed: `${d.status} ${d.verify?.messageId}; customer PAN ${String(c.identity.pan)}; "${missing}"` };
    },
  },
  {
    id: 'p18-confirm', title: 'P-18 step 6: Confirm checks the fields, copies PAN to the empty customer field; a double click is refused',
    expect: 'bad PAN → VAL-16; Confirm → CONFIRMED, PAN copied; second Confirm → 409 GEN-06',
    async run() {
      const { f, cus, add } = await setup();
      const d = docOf(await add('PAN'));
      const bad = await as(f.token, 'confirm bad PAN').post(`/documents/${d.id}/confirm`, { rev: d.rev, values: { name: 'Console check customer', pan: 'ABCDE1234F' } });
      const ok1 = await as(f.token, 'confirm').post(`/documents/${d.id}/confirm`, { rev: d.rev, values: { name: 'Console check customer', pan: 'ABCPE1234F' } });
      const again = await as(f.token, 'confirm again').post(`/documents/${d.id}/confirm`, { rev: d.rev, values: { name: 'Console check customer', pan: 'ABCPE1234F' } });
      const c = data<{ identity: { pan: string | null } }>(await as(f.token, 'read customer').get(`/customers/${cus.id}`));
      const out = ok1.res.ok ? data<{ document: { status: string }; identity: { copied: boolean } }>(ok1) : null;
      const ok = fields(bad).pan === 'VAL-16' && out?.document.status === 'CONFIRMED' && out.identity.copied && messageId(again) === 'GEN-06' && c.identity.pan === 'ABCXX1234F';
      return { verdict: verdict(ok), observed: `${JSON.stringify(fields(bad))}; ${out?.document.status} copied ${out?.identity.copied}; again ${seen(again)}; customer PAN ${c.identity.pan}` };
    },
  },
  {
    id: 'p18-consent', title: 'P-17: identity documents need personal-data consent',
    expect: 'no consent: Aadhaar → 409 CU-23; Medical report → 201',
    async run() {
      const { add } = await setup(false);
      const a = await add('Aadhaar');
      const m = await add('Medical report');
      return { verdict: verdict(messageId(a) === 'CU-23' && m.res.status === 201), observed: `${seen(a)} / ${seen(m)}` };
    },
  },
  {
    id: 'p18-labels', title: 'AC-P18-5: a label change keeps the original name; empty or duplicate labels are refused',
    expect: 'DOC-05; history starts with "scan.png"; duplicate → DOC-06; one character → VAL-42',
    async run() {
      const { f, add } = await setup(false);
      const a = docOf(await add('Photo'));
      const b = docOf(await add('Address proof'));
      const ch = await as(f.token, 'change label').patch(`/documents/${a.id}/label`, { rev: a.rev, label: 'Passport photo' });
      const hist = data<{ history: Array<{ name?: string; to?: string }> }>(await as(f.token, 'history').get(`/documents/${a.id}`)).history.map((h) => h.name ?? h.to);
      const dup = await as(f.token, 'duplicate label').patch(`/documents/${b.id}/label`, { rev: b.rev, label: 'passport PHOTO' });
      const short = await as(f.token, 'one-character label').patch(`/documents/${b.id}/label`, { rev: b.rev, label: 'x' });
      const ok = messageId(ch) === 'DOC-05' && JSON.stringify(hist) === '["scan.png","Passport photo"]' && fields(dup).label === 'DOC-06' && fields(short).label === 'VAL-42';
      return { verdict: verdict(ok), observed: `${seen(ch)}; history ${JSON.stringify(hist)}; ${JSON.stringify(fields(dup))} ${JSON.stringify(fields(short))}` };
    },
  },
  {
    id: 'p18-assistant', title: 'P-18 Who: an assistant uploads, but cannot change labels',
    expect: 'assistant upload → 201; assistant label change → 403 GEN-03',
    async run() {
      const { f, add } = await setup(false);
      const { mobile } = await addFixtureAssistant(f);
      const ast = await fixtureLogin(mobile, 'log in assistant');
      const up = await add('Photo', {}, ast.token);
      const rl = await as(ast.token, 'assistant changes label').patch(`/documents/${docOf(up).id}/label`, { rev: 1, label: 'New label' });
      return { verdict: verdict(up.res.status === 201 && rl.res.status === 403 && messageId(rl) === 'GEN-03'), observed: `${seen(up)} / ${seen(rl)}` };
    },
  },
  {
    id: 'p18-isolation', title: 'AC-P18-7: another account cannot open the documents, even with the file link',
    expect: 'other advisor: list → 404 GEN-11; document → 404; file link → 404',
    async run() {
      const { cus, add } = await setup(false);
      const d = docOf(await add('Medical report'));
      const o = await fixtureAdvisor();
      const list = await as(o.token, 'other lists documents').get(`/customers/${cus.id}/documents`);
      const doc = await as(o.token, 'other opens document').get(`/documents/${d.id}`);
      const file = await as(o.token, 'other opens file link').get(`/files/${d.file.id}`);
      const ok = list.res.status === 404 && messageId(list) === 'GEN-11' && doc.res.status === 404 && file.res.status === 404;
      return { verdict: verdict(ok), observed: `list ${seen(list)}; document ${doc.res.status}; file ${file.res.status}` };
    },
  },
  // ── P-54 vehicles ──
  {
    id: 'p54-few-photos', title: 'AC-P54-1: a vehicle with fewer than CFG-154 photos cannot be saved',
    expect: '3 photos → 400 photos VEH-02 "Add at least 4 photos before saving."; no vehicle saved',
    async run() {
      const { f, cus } = await setup(false);
      const r = await addVehicle(f, cus.id, 3);
      const list = data<{ vehicles: unknown[] }>(await as(f.token, 'list vehicles').get(`/customers/${cus.id}/vehicles`)).vehicles;
      return { verdict: verdict(fields(r).photos === 'VEH-02' && JSON.stringify(r.json).includes('Add at least 4 photos before saving.') && list.length === 0), observed: `${seen(r)} ${JSON.stringify(fields(r))}; vehicles ${list.length}` };
    },
  },
  {
    id: 'p54-save', title: 'P-54: the vehicle, RC and photos are saved together; registration in capitals without spaces',
    expect: '201 VEH-01 "Vehicle KA01AB1234 added for …"; 1 RC and 4 photos',
    async run() {
      const { f, cus } = await setup(false);
      const r = await addVehicle(f, cus.id, 4, { registration: 'ka 01 ab-1234' });
      const v = r.res.ok ? data<{ registration: string; rc: unknown[]; photos: Array<{ versions: unknown[] }> }>(r) : null;
      const ok = r.res.status === 201 && meta(r).message === `Vehicle KA01AB1234 added for ${cus.name}.` && v?.rc.length === 1 && v.photos.filter((s) => s.versions.length).length === 4;
      return { verdict: verdict(ok), observed: `${seen(r)} "${meta(r).message ?? ''}"` };
    },
  },
  {
    id: 'p54-several', title: 'AC-P54-2: one customer can have several vehicles, each with its own RC and photos',
    expect: 'two vehicles listed, with different RC files',
    async run() {
      const { f, cus } = await setup(false);
      await addVehicle(f, cus.id, 4, { registration: 'KA01AB1234' });
      await addVehicle(f, cus.id, 4, { registration: '22BH1234AA', vehicleType: 'Two-wheeler', fuel: 'Electric' });
      const list = data<{ vehicles: Array<{ registration: string; rc: Array<{ file: { id: string } }> }> }>(await as(f.token, 'list vehicles').get(`/customers/${cus.id}/vehicles`)).vehicles;
      const ok = list.length === 2 && list[0]!.rc[0]!.file.id !== list[1]!.rc[0]!.file.id;
      return { verdict: verdict(ok), observed: list.map((v) => v.registration).join(', ') };
    },
  },
  {
    id: 'p54-duplicate', title: 'AC-P54-3: a registration already ACTIVE in the account is refused',
    expect: 'second customer, same registration → 409 VEH-03 "Vehicle … is already recorded for …"',
    async run() {
      const { f, cus } = await setup(false);
      await addVehicle(f, cus.id, 4, { registration: 'MH12DE3456' });
      const other = data<{ id: string }>(await as(f.token, 'second customer').post('/customers', { name: 'Second check customer', mobile: randomMobile() }));
      const r = await addVehicle(f, other.id, 4, { registration: 'MH12DE3456' });
      return { verdict: verdict(messageId(r) === 'VEH-03' && meta(r).message === undefined && JSON.stringify(r.json).includes(`Vehicle MH12DE3456 is already recorded for ${cus.name}.`)), observed: seen(r) };
    },
  },
  {
    id: 'p54-sold', title: 'AC-P54-4: marking a vehicle sold keeps its RC and photos; it can be marked active again',
    expect: 'INACTIVE with 1 RC and 4 photos still there; then ACTIVE again',
    async run() {
      const { f, cus } = await setup(false);
      const v = data<{ id: string; version: number }>(await addVehicle(f, cus.id, 4));
      const sold = await as(f.token, 'mark as sold').post(`/vehicles/${v.id}/status`, { version: v.version, status: 'INACTIVE' });
      const s = data<{ status: string; version: number; rc: unknown[]; photos: Array<{ versions: unknown[] }> }>(sold);
      const back = await as(f.token, 'mark active again').post(`/vehicles/${v.id}/status`, { version: s.version, status: 'ACTIVE' });
      const ok = s.status === 'INACTIVE' && s.rc.length === 1 && s.photos.filter((x) => x.versions.length).length === 4 && data<{ status: string }>(back).status === 'ACTIVE';
      return { verdict: verdict(ok), observed: `${s.status}: RC ${s.rc.length}, photos ${s.photos.filter((x) => x.versions.length).length}; then ${back.res.ok ? data<{ status: string }>(back).status : seen(back)}` };
    },
  },
  {
    id: 'p54-version', title: 'P-54 step 4: a newer photo for a slot adds version 2 and keeps version 1',
    expect: '"Front photo saved as version 2."; Front shows versions 2 and 1',
    async run() {
      const { f, cus, file } = await setup(false);
      const v = data<{ id: string }>(await addVehicle(f, cus.id, 4));
      const r = await as(f.token, 'new Front photo').post(`/vehicles/${v.id}/files`, { kind: 'PHOTO', slot: 'Front', fileId: await file() });
      const front = data<{ photos: Array<{ slot: string; versions: Array<{ version: number }> }> }>(r).photos.find((x) => x.slot === 'Front');
      return { verdict: verdict(meta(r).message === 'Front photo saved as version 2.' && JSON.stringify(front?.versions.map((x) => x.version)) === '[2,1]'), observed: `"${meta(r).message ?? seen(r)}"; ${JSON.stringify(front?.versions.map((x) => x.version))}` };
    },
  },
  {
    id: 'p54-isolation', title: 'GR-20: another account cannot see or change these vehicles',
    expect: 'other advisor: list → 404 GEN-11; mark sold → 404',
    async run() {
      const { f, cus } = await setup(false);
      const v = data<{ id: string }>(await addVehicle(f, cus.id, 4));
      const o = await fixtureAdvisor();
      const list = await as(o.token, 'other lists vehicles').get(`/customers/${cus.id}/vehicles`);
      const sold = await as(o.token, 'other marks sold').post(`/vehicles/${v.id}/status`, { version: 1, status: 'INACTIVE' });
      return { verdict: verdict(list.res.status === 404 && messageId(list) === 'GEN-11' && sold.res.status === 404), observed: `list ${seen(list)}; sold ${sold.res.status}` };
    },
  },
];