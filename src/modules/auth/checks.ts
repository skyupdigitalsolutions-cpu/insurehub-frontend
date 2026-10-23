import { rawRequest } from '../../api/client';
import { latestOtp } from '../../api/dev';
import type { Check } from '../../ui/CheckList';
import { as, data, fields, firstPipeline, fixtureAdvisor, fixtureLogin, messageId, meta, randomMobile, seen, verdict, withClock } from '../checks/fixtures';

/** Live checks for Section 5 (P-01 to P-04). They use throwaway advisor accounts, never your own session. */
export const AUTH_CHECKS: Check[] = [
  {
    id: 'register', title: 'P-01: registration creates the account, TRIAL, wallet and pipelines',
    expect: 'AUTH-15; role ADV; subscription TRIAL with no plan; 5 pipelines (CFG-169)',
    async run() {
      const f = await fixtureAdvisor();
      const me = data<{ role: string; subscription: { status: string; plan: string | null } }>(await as(f.token, 'who am I').get('/auth/me'));
      const pipes = data<unknown[]>(await as(f.token, 'pipelines').get('/pipelines'));
      const ok = me.role === 'ADV' && me.subscription.status === 'TRIAL' && me.subscription.plan === null && pipes.length === 5;
      return { verdict: verdict(ok), observed: `${me.role}, ${me.subscription.status}, plan ${me.subscription.plan}, ${pipes.length} pipelines` };
    },
  },
  {
    id: 'mobile', title: 'FLD-01: a mobile that is not a 10-digit Indian number is refused',
    expect: '400 with VAL-01 on mobile',
    async run() {
      const r = await rawRequest('POST', '/auth/login/otp', { mobile: '12345' }, { label: 'Check: bad mobile', idempotencyKey: false });
      return { verdict: verdict(r.res.status === 400 && fields(r).mobile === 'VAL-01'), observed: `${seen(r)} ${JSON.stringify(fields(r))}` };
    },
  },
  {
    id: 'unknown', title: 'P-02: an unknown number gets AUTH-09 and no SMS',
    expect: '404 MOBILE_NOT_REGISTERED AUTH-09',
    async run() {
      const r = await rawRequest('POST', '/auth/login/otp', { mobile: randomMobile() }, { label: 'Check: unknown number', idempotencyKey: false });
      return { verdict: verdict(r.res.status === 404 && messageId(r) === 'AUTH-09'), observed: seen(r) };
    },
  },
  {
    id: 'wrong-otp', title: 'AC-P01-3: a wrong code shows the tries left',
    expect: '400 OTP_INCORRECT AUTH-02 "…You have 4 tries left."',
    async run() {
      const f = await fixtureAdvisor();
      await rawRequest('POST', '/auth/login/otp', { mobile: f.mobile }, { label: 'Check: login OTP', idempotencyKey: false });
      const right = await latestOtp(f.mobile);
      const wrong = right.slice(0, -1) + ((Number(right.slice(-1)) + 1) % 10);
      const r = await rawRequest('POST', '/auth/login/verify', { mobile: f.mobile, code: wrong }, { label: 'Check: wrong code', headers: { 'X-Client': 'app' } });
      const text = (r.json as { error?: { message?: string } }).error?.message ?? '';
      return { verdict: verdict(r.res.status === 400 && messageId(r) === 'AUTH-02' && text.includes('4 tries left')), observed: `${seen(r)} "${text}"` };
    },
  },
  {
    id: 'resend', title: 'AC-P01-5: Resend inside CFG-04 sends no new SMS',
    expect: '200 with sent=false and AUTH-05',
    async run() {
      const f = await fixtureAdvisor();
      await rawRequest('POST', '/auth/login/otp', { mobile: f.mobile }, { label: 'Check: first OTP', idempotencyKey: false });
      const r = await rawRequest('POST', '/auth/login/otp', { mobile: f.mobile }, { label: 'Check: resend at once', idempotencyKey: false });
      return { verdict: verdict(r.res.ok && data<{ sent: boolean }>(r).sent === false && messageId(r) === 'AUTH-05'), observed: `${seen(r)} sent=${data<{ sent: boolean }>(r)?.sent}` };
    },
  },
  {
    id: 'sessions', title: 'AC-P03-3: the 4th sign-in ends the oldest session',
    expect: 'the first device gets 401 SESSION_ENDED AUTH-17',
    async run() {
      const f = await fixtureAdvisor();
      for (let i = 0; i < 3; i++) await fixtureLogin(f.mobile, `sign in again (${i + 2})`);
      const r = await as(f.token, 'oldest device').get('/auth/me');
      return { verdict: verdict(r.res.status === 401 && messageId(r) === 'AUTH-17'), observed: seen(r) };
    },
  },
  {
    id: 'reuse', title: 'Refresh tokens rotate; replaying an old one ends the session',
    expect: '1st refresh 200; replay after the 10 s grace → 401 REFRESH_TOKEN_REUSED',
    destructive: 'Moves the test clock 11 seconds for a moment.',
    async run() {
      const f = await fixtureAdvisor();
      const opts = { headers: { 'X-Client': 'app' }, label: 'Check: refresh', idempotencyKey: false as const };
      const first = await rawRequest('POST', '/auth/refresh', { refreshToken: f.refresh }, opts);
      const replay = await withClock(11 / 60, () => rawRequest('POST', '/auth/refresh', { refreshToken: f.refresh }, { ...opts, label: 'Check: replay old refresh token' }));
      const ok = first.res.ok && replay.res.status === 401 && (replay.json as { error?: { code?: string } }).error?.code === 'REFRESH_TOKEN_REUSED';
      return { verdict: verdict(ok), observed: `${first.res.status} / ${seen(replay)}` };
    },
  },
  {
    id: 'cookies', title: 'Web sessions are HttpOnly cookies (no token readable by this page)',
    expect: 'without cookies → 401 GEN-09; document.cookie has no session token',
    async run() {
      const r = await rawRequest('GET', '/auth/me', undefined, { label: 'Check: /auth/me without cookies', credentials: 'omit' });
      const leaked = /bm_(at|rt)=/.test(document.cookie);
      return { verdict: verdict(r.res.status === 401 && messageId(r) === 'GEN-09' && !leaked), observed: `${seen(r)}; readable cookie: ${leaked}` };
    },
  },
  {
    id: 'change-mobile', title: 'AC-P04-1/2: changing the mobile needs both OTPs; a used number is AUTH-25',
    expect: 'used number → 409 AUTH-25; after both OTPs → AUTH-23 and the new number on /auth/me',
    async run() {
      const f = await fixtureAdvisor();
      const other = await fixtureAdvisor('Console check other advisor');
      const c = as(f.token, 'change mobile');
      await c.post('/auth/mobile/current/otp');
      const token = data<{ changeToken: string }>(await c.post('/auth/mobile/current/verify', { code: await latestOtp(f.mobile) })).changeToken;
      const used = await c.post('/auth/mobile/new/otp', { changeToken: token, newMobile: other.mobile });
      const fresh = randomMobile();
      await c.post('/auth/mobile/new/otp', { changeToken: token, newMobile: fresh });
      const done = await c.post('/auth/mobile/new/verify', { changeToken: token, newMobile: fresh, code: await latestOtp(fresh) });
      const me = data<{ mobile: string }>(await c.get('/auth/me'));
      const ok = messageId(used) === 'AUTH-25' && meta(done).messageId === 'AUTH-23' && me.mobile === `+91${fresh}`;
      return { verdict: verdict(ok), observed: `${seen(used)} / ${seen(done)} / now ${me.mobile}` };
    },
  },
  {
    id: 'read-only', title: 'AC-P02-4: after the trial the account is read-only (SUB-03)',
    expect: 'sign-in works with readOnly=true; creating a lead → 403 READ_ONLY SUB-03; reading works',
    destructive: 'Moves the test clock 8 days ahead for a few seconds. Avoid clicking elsewhere while it runs.',
    async run() {
      const f = await fixtureAdvisor();
      const pipelineId = await firstPipeline(f.token);
      return withClock(8 * 24 * 60, async () => {
        const s = await fixtureLogin(f.mobile, 'sign in after trial');
        const me = data<{ readOnly: boolean }>(await as(s.token, 'who am I').get('/auth/me'));
        const w = await as(s.token, 'create lead in read-only').post('/leads', { pipelineId, name: 'Console check lead', mobile: randomMobile(), source: 'Other' });
        const read = await as(s.token, 'list leads in read-only').get('/leads');
        return { verdict: verdict(me.readOnly && w.res.status === 403 && messageId(w) === 'SUB-03' && read.res.ok), observed: `readOnly=${me.readOnly}; write ${seen(w)}; read ${read.res.status}` };
      });
    },
  },
];
