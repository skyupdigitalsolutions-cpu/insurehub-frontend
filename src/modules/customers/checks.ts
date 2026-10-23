import type { Check } from '../../ui/CheckList';
import { addFixtureAssistant, as, data, fields, fixtureAdvisor, fixtureLogin, messageId, meta, randomMobile, sampleAadhaar, seen, verdict } from '../checks/fixtures';

type C = { id: string; number: string; mobile: string; version: number; identity: { pan: string | null; aadhaar: string | null } };
async function ctx() {
  const f = await fixtureAdvisor();
  const c = as(f.token, 'customers');
  const cus = data<C>(await c.post('/customers', { name: 'Meena Iyer', mobile: randomMobile(), email: 'meena@example.com' }));
  const consent = (body: object) => c.post(`/customers/${cus.id}/consents`, { personType: 'CUSTOMER', personId: cus.id, ...body });
  return { f, c, cus, consent };
}

/** Live checks for Section 8 (P-15 to P-17, P-19). */
export const CUSTOMER_CHECKS: Check[] = [
  {
    id: 'duplicates', title: 'AC-P15-1/2: saves with name and mobile; exact duplicate blocked; other name warned',
    expect: 'CU-000001; same name → 409 CU-02; other name → 409 CU-03; with confirm → 201',
    async run() {
      const { c, cus } = await ctx();
      const exact = await c.post('/customers', { name: 'MEENA IYER', mobile: cus.mobile });
      const warn = await c.post('/customers', { name: 'Ramesh Iyer', mobile: cus.mobile });
      const ok = await c.post('/customers', { name: 'Ramesh Iyer', mobile: cus.mobile, confirm: ['CU-03'] });
      return { verdict: verdict(cus.number === 'CU-000001' && messageId(exact) === 'CU-02' && messageId(warn) === 'CU-03' && ok.res.status === 201), observed: `${cus.number}; ${seen(exact)} / ${seen(warn)} / ${ok.res.status}` };
    },
  },
  {
    id: 'fields', title: 'Field rules: future DOB, PIN starting with 0, unknown state',
    expect: '400 GEN-02 with dob VAL-05, pin VAL-15, state VAL-22',
    async run() {
      const { c } = await ctx();
      const r = await c.post('/customers', { name: 'Ravi Kumar', mobile: randomMobile(), dob: '2999-01-01', pin: '012345', state: 'Atlantis' });
      const f = fields(r);
      return { verdict: verdict(f.dob === 'VAL-05' && f.pin === 'VAL-15' && f.state === 'VAL-22'), observed: `${seen(r)} ${JSON.stringify(f)}` };
    },
  },
  {
    id: 'pan-consent', title: 'AC-P15-6/7: PAN needs personal-data consent; stored masked; reveal is recorded',
    expect: 'before consent → 409 CU-23; after → PAN shown as ABCXX1234F; reveal → CU-25 with the full value',
    async run() {
      const { c, cus, consent } = await ctx();
      const before = await c.put(`/customers/${cus.id}/identity`, { version: 1, pan: 'ABCPE1234F' });
      await consent({ channel: 'PERSONAL_DATA', action: 'GIVE', howGiven: 'Signed form', declaration: true });
      const saved = await c.put(`/customers/${cus.id}/identity`, { version: 1, pan: 'ABCPE1234F', aadhaar: sampleAadhaar() });
      const shown = await c.post(`/customers/${cus.id}/identity/reveal`, { field: 'PAN' });
      const ok = messageId(before) === 'CU-23' && data<C>(saved).identity.pan === 'ABCXX1234F' && messageId(shown) === 'CU-25' && data<{ value: string }>(shown).value === 'ABCPE1234F';
      return { verdict: verdict(ok), observed: `${seen(before)}; saved ${data<C>(saved)?.identity?.pan}; reveal ${seen(shown)}` };
    },
  },
  {
    id: 'assistant-masked', title: 'AC-P15-8: an assistant never sees the full number',
    expect: 'assistant reveal → 403 GEN-03',
    async run() {
      const { f, cus, consent, c } = await ctx();
      await consent({ channel: 'PERSONAL_DATA', action: 'GIVE', howGiven: 'Signed form', declaration: true });
      await c.put(`/customers/${cus.id}/identity`, { version: 1, pan: 'ABCPE1234F' });
      const { mobile } = await addFixtureAssistant(f);
      const ast = await fixtureLogin(mobile, 'assistant login');
      const r = await as(ast.token, 'assistant reveal').post(`/customers/${cus.id}/identity/reveal`, { field: 'PAN' });
      return { verdict: verdict(r.res.status === 403 && messageId(r) === 'GEN-03'), observed: seen(r) };
    },
  },
  {
    id: 'mobile-change', title: 'AC-P15-4: changing the mobile asks CU-21 and resets WhatsApp consent',
    expect: 'without confirmation → 409 CU-21; with ["CU-21"] → saved; WhatsApp consent NOT_RECORDED',
    async run() {
      const { c, cus, consent } = await ctx();
      await consent({ channel: 'WHATSAPP', action: 'GIVE', howGiven: 'Replied on WhatsApp', declaration: true });
      const ask = await c.patch(`/customers/${cus.id}`, { version: 1, mobile: randomMobile() });
      const ok = await c.patch(`/customers/${cus.id}`, { version: 1, mobile: randomMobile(), confirm: ['CU-21'] });
      const grid = data<{ rows: Array<{ channels: { WHATSAPP: { status: string } } }> }>(await c.get(`/customers/${cus.id}/consents`));
      const wa = grid.rows[0]!.channels.WHATSAPP.status;
      return { verdict: verdict(messageId(ask) === 'CU-21' && ok.res.ok && wa === 'NOT_RECORDED'), observed: `${seen(ask)} / ${ok.res.status} / WhatsApp ${wa}` };
    },
  },
  {
    id: 'consent-rules', title: 'AC-P17-1: consent needs the channel\'s address and the declaration',
    expect: 'member without mobile → 409 CU-13; no declaration → VAL-29; withdrawal → CU-12',
    async run() {
      const { c, cus, consent } = await ctx();
      const m = data<{ id: string }>(await c.post(`/customers/${cus.id}/family`, { name: 'Arjun Iyer', relationship: 'Son' }));
      const noMobile = await c.post(`/customers/${cus.id}/consents`, { personType: 'FAMILY', personId: m.id, channel: 'WHATSAPP', action: 'GIVE', howGiven: 'Signed form', declaration: true });
      const noTick = await consent({ channel: 'EMAIL', action: 'GIVE', howGiven: 'Signed form' });
      await consent({ channel: 'EMAIL', action: 'GIVE', howGiven: 'Signed form', declaration: true });
      const w = await consent({ channel: 'EMAIL', action: 'WITHDRAW' });
      return { verdict: verdict(messageId(noMobile) === 'CU-13' && fields(noTick).declaration === 'VAL-29' && messageId(w) === 'CU-12'), observed: `${seen(noMobile)} / ${JSON.stringify(fields(noTick))} / ${meta(w).messageId}` };
    },
  },
  {
    id: 'family', title: 'P-16: a duplicate family member is refused',
    expect: 'CU-05 on add; same name and relationship again → 409 CU-07',
    async run() {
      const { c, cus } = await ctx();
      const a = await c.post(`/customers/${cus.id}/family`, { name: 'Arjun Iyer', relationship: 'Son' });
      const b = await c.post(`/customers/${cus.id}/family`, { name: 'arjun iyer', relationship: 'Son' });
      return { verdict: verdict(messageId(a) === 'CU-05' && messageId(b) === 'CU-07'), observed: `${meta(a).message} / ${seen(b)}` };
    },
  },
  {
    id: 'deactivate', title: 'P-19: deactivation needs a reason; an inactive customer cannot be edited',
    expect: 'no reason → GEN-01; CU-09; edit → 409 CU-20; reactivate → CU-10',
    async run() {
      const { c, cus } = await ctx();
      const bare = await c.post(`/customers/${cus.id}/deactivate`, { version: 1 });
      const d = await c.post(`/customers/${cus.id}/deactivate`, { version: 1, reason: 'Not reachable' });
      const edit = await c.patch(`/customers/${cus.id}`, { version: 2, occupation: 'Teacher' });
      const back = await c.post(`/customers/${cus.id}/reactivate`, { version: 2 });
      const ok = fields(bare).reason === 'GEN-01' && messageId(d) === 'CU-09' && messageId(edit) === 'CU-20' && messageId(back) === 'CU-10';
      return { verdict: verdict(ok), observed: `${seen(bare)} / ${meta(d).messageId} / ${seen(edit)} / ${meta(back).messageId}` };
    },
  },
];
