import type { Check } from '../../ui/CheckList';
import { as, data, fields, firstPipeline, fixtureAdvisor, messageId, meta, randomMobile, seen, verdict, type Fixture } from '../checks/fixtures';

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();
async function ctx() {
  const f: Fixture = await fixtureAdvisor();
  const c = as(f.token, 'leads');
  const pipelineId = await firstPipeline(f.token);
  const create = (body: object = {}, key?: string) => c.post('/leads', { pipelineId, name: 'Console Check Lead', mobile: randomMobile(), source: 'Walk-in or personal contact', ...body }, {}, key);
  return { f, c, create };
}
type L = { id: string; number: string; status: string; version: number; allowedMoves: string[] };

/** Live checks for Section 7 (P-12 to P-14) and the global rules they rely on. */
export const LEAD_CHECKS: Check[] = [
  {
    id: 'validation', title: 'GR-03/05: every problem is reported per field with its message ID',
    expect: '400 GEN-02; name VAL-02, mobile VAL-01, source GEN-01',
    async run() {
      const { c, f } = await ctx();
      const r = await c.post('/leads', { pipelineId: await firstPipeline(f.token), name: 'P', mobile: '12345' });
      const fl = fields(r);
      return { verdict: verdict(messageId(r) === 'GEN-02' && fl.name === 'VAL-02' && fl.mobile === 'VAL-01' && fl.source === 'GEN-01'), observed: `${seen(r)} ${JSON.stringify(fl)}` };
    },
  },
  {
    id: 'create', title: 'AC-P12-1: name, mobile and source save as NEW with an LD number',
    expect: '201 LD-01, number LD-YYMM-00001, status NEW, priority MEDIUM',
    async run() {
      const { create } = await ctx();
      const r = await create();
      const l = data<L & { priority: string }>(r);
      return { verdict: verdict(r.res.status === 201 && messageId(r) === 'LD-01' && /^LD-\d{4}-00001$/.test(l.number) && l.status === 'NEW'), observed: `${seen(r)} ${l.number} ${l.status} ${l.priority}` };
    },
  },
  {
    id: 'duplicates', title: 'AC-P12-2/3: exact duplicate blocked; same mobile, other name warns',
    expect: 'same name → 409 DUPLICATE LD-02; other name → 409 CONFIRMATION_REQUIRED LD-03; with confirm ["LD-03"] → 201',
    async run() {
      const { create } = await ctx();
      const mobile = randomMobile();
      await create({ mobile, name: 'Ravi Kumar' });
      const exact = await create({ mobile, name: 'ravi kumar.' });
      const warn = await create({ mobile, name: 'Lakshmi Kumar' });
      const ok = await create({ mobile, name: 'Lakshmi Kumar', confirm: ['LD-03'] });
      return { verdict: verdict(messageId(exact) === 'LD-02' && messageId(warn) === 'LD-03' && ok.res.status === 201), observed: `${seen(exact)} / ${seen(warn)} / ${ok.res.status}` };
    },
  },
  {
    id: 'source', title: 'P-12: Campaign needs a campaign name; referring client must be a customer',
    expect: '"Campaign name is required." / "Referred by client is required."',
    async run() {
      const { create } = await ctx();
      const a = await create({ source: 'Campaign' });
      const b = await create({ source: 'Referred by a client' });
      const ok = fields(a).campaign === 'GEN-01' && fields(b).referredByCustomerId === 'GEN-01';
      return { verdict: verdict(ok), observed: `${seen(a)} ${JSON.stringify(fields(a))} / ${JSON.stringify(fields(b))}` };
    },
  },
  {
    id: 'moves', title: 'AC-P13-1: only the Section 4.3 moves are offered and accepted',
    expect: 'NEW offers CONTACTED, FOLLOW_UP, LOST; NEW → QUALIFIED → 409 INVALID_STATE GEN-04',
    async run() {
      const { c, create } = await ctx();
      const l = data<L>(await create());
      const r = await c.post(`/leads/${l.id}/status`, { version: 1, status: 'QUALIFIED' });
      return { verdict: verdict(l.allowedMoves.join() === 'CONTACTED,FOLLOW_UP,LOST' && messageId(r) === 'GEN-04'), observed: `${l.allowedMoves.join()} / ${seen(r)}` };
    },
  },
  {
    id: 'lost-followup', title: 'AC-P13-2/3: LOST needs a reason; FOLLOW_UP needs a date',
    expect: 'LOST without reason → LD-06; FOLLOW_UP without date → GEN-01 on nextFollowUpAt; with a date → LD-05',
    async run() {
      const { c, create } = await ctx();
      const l = data<L>(await create());
      const lost = await c.post(`/leads/${l.id}/status`, { version: 1, status: 'LOST' });
      const fu = await c.post(`/leads/${l.id}/status`, { version: 1, status: 'FOLLOW_UP' });
      const ok = await c.post(`/leads/${l.id}/status`, { version: 1, status: 'FOLLOW_UP', nextFollowUpAt: tomorrow() });
      return { verdict: verdict(fields(lost).lostReason === 'LD-06' && fields(fu).nextFollowUpAt === 'GEN-01' && messageId(ok) === 'LD-05'), observed: `${seen(lost)} / ${seen(fu)} / ${meta(ok).message}` };
    },
  },
  {
    id: 'reopen', title: 'AC-P13-4: reopen moves LOST to CONTACTED and needs a note',
    expect: 'without note → GEN-01 on note; with note → LD-07, status CONTACTED',
    async run() {
      const { c, create } = await ctx();
      const l = data<L>(await create());
      await c.post(`/leads/${l.id}/status`, { version: 1, status: 'LOST', lostReason: 'Not reachable' });
      const bare = await c.post(`/leads/${l.id}/status`, { version: 2, status: 'CONTACTED' });
      const r = await c.post(`/leads/${l.id}/status`, { version: 2, status: 'CONTACTED', note: 'Called back' });
      return { verdict: verdict(fields(bare).note === 'GEN-01' && messageId(r) === 'LD-07' && data<L>(r).status === 'CONTACTED'), observed: `${seen(bare)} / ${seen(r)}` };
    },
  },
  {
    id: 'version', title: 'GR-11: a change from a stale form is refused, nothing overwritten',
    expect: '409 VERSION_CONFLICT GEN-05',
    async run() {
      const { c, create } = await ctx();
      const l = data<L>(await create());
      await c.post(`/leads/${l.id}/status`, { version: 1, status: 'CONTACTED' });
      const r = await c.patch(`/leads/${l.id}`, { version: 1, notes: 'stale edit' });
      return { verdict: verdict(r.res.status === 409 && messageId(r) === 'GEN-05'), observed: seen(r) };
    },
  },
  {
    id: 'idempotency', title: 'AC-P12-5 / GR-10: a double submit creates one lead',
    expect: 'same Idempotency-Key twice → 201, then 409 ALREADY_SUBMITTED GEN-06 with the saved lead',
    async run() {
      const { create } = await ctx();
      const key = crypto.randomUUID();
      const body = { mobile: randomMobile() };
      const a = await create(body, key);
      const b = await create(body, key);
      return { verdict: verdict(a.res.status === 201 && messageId(b) === 'GEN-06'), observed: `${a.res.status} / ${seen(b)}` };
    },
  },
  {
    id: 'convert', title: 'AC-P14-1/4: conversion creates one customer; the lead is then closed',
    expect: 'LD-10 "Customer CU-000001 created from lead …"; editing the lead → LD-08',
    async run() {
      const { c, create } = await ctx();
      const l = data<L>(await create({ nextFollowUpAt: tomorrow() }));
      const r = await c.post(`/leads/${l.id}/convert`, { version: 1, mode: 'CREATE' });
      const edit = await c.patch(`/leads/${l.id}`, { version: 2, notes: 'after conversion' });
      return { verdict: verdict(messageId(r) === 'LD-10' && messageId(edit) === 'LD-08'), observed: `${meta(r).message} / ${seen(edit)}` };
    },
  },
  {
    id: 'link', title: 'AC-P14-3: an exact duplicate customer can only be linked',
    expect: 'CREATE → 409 CU-02; LINK → LD-11',
    async run() {
      const { c, create } = await ctx();
      const mobile = randomMobile();
      const cus = data<{ id: string }>(await c.post('/customers', { name: 'Console Check Lead', mobile }));
      const l = data<L>(await create({ mobile, confirm: ['LD-04'] }));
      const bad = await c.post(`/leads/${l.id}/convert`, { version: 1, mode: 'CREATE' });
      const ok = await c.post(`/leads/${l.id}/convert`, { version: 1, mode: 'LINK', customerId: cus.id });
      return { verdict: verdict(messageId(bad) === 'CU-02' && messageId(ok) === 'LD-11'), observed: `${seen(bad)} / ${meta(ok).message}` };
    },
  },
];
