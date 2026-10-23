import { rawRequest } from '../../api/client';
import { latestOtp } from '../../api/dev';
import type { Check } from '../../ui/CheckList';
import { addFixtureAssistant, as, data, firstPipeline, fixtureAdvisor, fixtureLogin, messageId, randomMobile, seen, verdict } from '../checks/fixtures';

/** Your own session (cookie), for the checks that need your SkyUp role. */
const mine = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  rawRequest(method, path, body, { label: `Check: ${path}`, headers, idempotencyKey: method === 'POST' ? undefined : false });

export const TEAM_CHECKS: Check[] = [
  {
    id: 'step-up', title: 'CFG-83: adding an assistant needs the extra OTP',
    expect: 'without X-Step-Up-Token → 403 STEP_UP_REQUIRED AUTH-26',
    async run() {
      const adv = await fixtureAdvisor();
      const r = await as(adv.token, 'add assistant without OTP').post('/assistants', { name: 'Console check assistant', mobile: randomMobile() });
      return { verdict: verdict(r.res.status === 403 && messageId(r) === 'AUTH-26'), observed: seen(r) };
    },
  },
  {
    id: 'add', title: 'P-53: an added assistant is INVITED and becomes ACTIVE at first login',
    expect: '201 AST-01; the assistant signs in as AST in the advisor\'s account',
    async run() {
      const adv = await fixtureAdvisor();
      const { r, mobile } = await addFixtureAssistant(adv);
      const ast = await fixtureLogin(mobile, 'assistant first login');
      const ok = r.res.status === 201 && messageId(r) === 'AST-01' && ast.user.role === 'AST' && ast.user.accountId === adv.user.accountId;
      return { verdict: verdict(ok), observed: `${seen(r)}; signed in as ${ast.user.role}, same account: ${ast.user.accountId === adv.user.accountId}` };
    },
  },
  {
    id: 'limit', title: 'AC-P53-3: the (CFG-158 + 1)th assistant is refused',
    expect: '3rd assistant → 409 LIMIT_REACHED AST-02',
    async run() {
      const adv = await fixtureAdvisor();
      await addFixtureAssistant(adv);
      await addFixtureAssistant(adv);
      const { r } = await addFixtureAssistant(adv);
      return { verdict: verdict(r.res.status === 409 && messageId(r) === 'AST-02'), observed: seen(r) };
    },
  },
  {
    id: 'ast-rights', title: 'AC-P53-1: assistants enter data but cannot mark lost or manage assistants',
    expect: 'lead created 201; mark lost → 403 GEN-03; assistants list → 403 GEN-03',
    async run() {
      const adv = await fixtureAdvisor();
      const { mobile } = await addFixtureAssistant(adv);
      const ast = await fixtureLogin(mobile, 'assistant login');
      const c = as(ast.token, 'assistant');
      const lead = await c.post('/leads', { pipelineId: await firstPipeline(ast.token), name: 'Console check lead', mobile: randomMobile(), source: 'Other' });
      const id = data<{ id: string }>(lead)?.id;
      const lost = await c.post(`/leads/${id}/status`, { version: 1, status: 'LOST', lostReason: 'Not interested' });
      const list = await c.get('/assistants');
      const ok = lead.res.status === 201 && messageId(lost) === 'GEN-03' && messageId(list) === 'GEN-03';
      return { verdict: verdict(ok), observed: `lead ${lead.res.status}; lost ${seen(lost)}; list ${seen(list)}` };
    },
  },
  {
    id: 'disable', title: 'P-53 step 4: disabling an assistant ends their sessions at once',
    expect: 'AST-03; the assistant\'s next request → 401 AUTH-11',
    async run() {
      const adv = await fixtureAdvisor();
      const { r, mobile } = await addFixtureAssistant(adv);
      const ast = await fixtureLogin(mobile, 'assistant login');
      const list = data<{ items: Array<{ id: string; version: number }> }>(await as(adv.token, 'assistants').get('/assistants'));
      const id = data<{ id: string }>(r).id;
      const d = await as(adv.token, 'disable assistant').post(`/assistants/${id}/disable`, { version: list.items.find((i) => i.id === id)!.version });
      const after = await as(ast.token, 'assistant after disable').get('/auth/me');
      return { verdict: verdict(messageId(d) === 'AST-03' && after.res.status === 401 && messageId(after) === 'AUTH-11'), observed: `${seen(d)}; then ${seen(after)}` };
    },
  },
  {
    id: 'sup-03', title: 'AC-P57-1: SkyUp users cannot open client records without a support grant',
    expect: 'signed in as STF or ADM: GET /leads → 403 SUPPORT_GRANT_REQUIRED SUP-03',
    async run() {
      const me = data<{ role: string }>(await mine('GET', '/auth/me'));
      if (me.role !== 'STF' && me.role !== 'ADM') return { verdict: 'blocked', observed: `You are ${me.role}. Sign in as the seeded SkyUp Admin to run this.` };
      const r = await mine('GET', '/leads');
      return { verdict: verdict(r.res.status === 403 && messageId(r) === 'SUP-03'), observed: seen(r) };
    },
  },
  {
    id: 'adm-self', title: 'P-48: a SkyUp Admin cannot disable their own access',
    expect: 'signed in as ADM: disable yourself (with OTP) → 409 SELF_ACTION ADM-03',
    async run() {
      const me = data<{ id: string; role: string; mobile: string }>(await mine('GET', '/auth/me'));
      if (me.role !== 'ADM') return { verdict: 'blocked', observed: `You are ${me.role}. Sign in as the seeded SkyUp Admin to run this.` };
      await mine('POST', '/auth/step-up/otp', {});
      const token = data<{ stepUpToken: string }>(await mine('POST', '/auth/step-up/verify', { code: await latestOtp(me.mobile) })).stepUpToken;
      const staff = data<Array<{ id: string; version: number }>>(await mine('GET', '/staff'));
      const r = await mine('POST', `/staff/${me.id}/disable`, { version: staff.find((s) => s.id === me.id)!.version }, { 'X-Step-Up-Token': token });
      return { verdict: verdict(r.res.status === 409 && messageId(r) === 'ADM-03'), observed: seen(r) };
    },
  },
];
