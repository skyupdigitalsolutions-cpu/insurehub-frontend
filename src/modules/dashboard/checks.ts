import { rawRequest } from '../../api/client';
import type { Check } from '../../ui/CheckList';
import { as, data, fields, fixtureAdvisor, meta, messageId, randomMobile, seen, verdict, type Fixture } from '../checks/fixtures';

/** An IST date DD-MM-YYYY, n days from today. */
const day = (n: number) => { const d = new Date(Date.now() + 5.5 * 3_600_000 + n * 86_400_000); const iso = d.toISOString().slice(0, 10); return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`; };
/** "hh:mm AM" (IST) n minutes from now. */
const inMinutes = (n: number) => {
  const d = new Date(Date.now() + 5.5 * 3_600_000 + n * 60_000);
  const h = d.getUTCHours(); const m = String(d.getUTCMinutes()).padStart(2, '0');
  return { date: `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`, time: `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${m} ${h < 12 ? 'AM' : 'PM'}` };
};
const sweep = () => rawRequest('POST', '/dev/run-sweep', {}, { label: 'Check: run the minute sweep', idempotencyKey: false });
const addTask = (f: Fixture, extra: object = {}) => as(f.token, 'add task').post('/tasks', { title: 'Call Meena about renewal', dueDate: day(1), dueTime: '10:30 AM', ...extra });

export const WORKDAY_CHECKS: Check[] = [
  {
    id: 'p11-past', title: 'AC-P11-1: a task due in the past cannot be saved',
    expect: 'past date → dueDate VAL-07; earlier time today → dueTime DSH-24 "Choose a time later than now."',
    async run() {
      const f = await fixtureAdvisor();
      const a = await addTask(f, { dueDate: day(-1) });
      const b = await addTask(f, { dueDate: day(0), dueTime: '12:01 AM' });
      return { verdict: verdict(fields(a).dueDate === 'VAL-07' && fields(b).dueTime === 'DSH-24'), observed: `${JSON.stringify(fields(a))} / ${JSON.stringify(fields(b))}` };
    },
  },
  {
    id: 'p11-done', title: 'P-11: Mark done (DSH-23); the task moves to Done; editing it from a stale tab gets GEN-05',
    expect: '"Task marked as done."; Done tab lists it; edit with the old version → 409 GEN-05',
    async run() {
      const f = await fixtureAdvisor();
      const t = data<{ id: string; version: number }>(await addTask(f));
      const d = await as(f.token, 'mark done').post(`/tasks/${t.id}/done`, { version: t.version });
      const doneTab = data<{ tasks: Array<{ id: string }> }>(await as(f.token, 'Done tab').get('/tasks?tab=DONE')).tasks.map((x) => x.id);
      const stale = await as(f.token, 'edit from a stale tab').patch(`/tasks/${t.id}`, { version: t.version, title: 'Changed' });
      return { verdict: verdict(meta(d).message === 'Task marked as done.' && doneTab.includes(t.id) && messageId(stale) === 'GEN-05'), observed: `"${meta(d).message ?? seen(d)}"; Done ${doneTab.length}; ${seen(stale)}` };
    },
  },
  {
    id: 'p11-reminder', title: 'AC-P11-2: the reminder (DSH-11) arrives once, CFG-34 before the due time',
    expect: 'task due in 10 minutes; sweep twice → one bell item "Follow-up with … is due at …"',
    async run() {
      const f = await fixtureAdvisor();
      const at = inMinutes(10);
      const t = await addTask(f, { title: 'Call Kavya', dueDate: at.date, dueTime: at.time });
      if (!t.res.ok) return { verdict: 'fail', observed: `task: ${seen(t)} ${JSON.stringify(fields(t))}` };
      await sweep(); await sweep();
      const items = data<{ items: Array<{ messageId: string; message: string }> }>(await as(f.token, 'bell').get('/notifications')).items.filter((i) => i.messageId === 'DSH-11');
      return { verdict: verdict(items.length === 1 && items[0]!.message.startsWith('Follow-up with Call Kavya is due at ')), observed: items.map((i) => i.message).join(' | ') || 'no reminder' };
    },
  },
  {
    id: 'p10-bell', title: 'AC-P10-1/3: the count equals unread items; opening one marks it read and gives its record',
    expect: 'count 1 → open → link TASK, count 0',
    async run() {
      const f = await fixtureAdvisor();
      const at = inMinutes(10);
      const t = data<{ id: string }>(await addTask(f, { dueDate: at.date, dueTime: at.time }));
      await sweep();
      const before = data<{ unread: number }>(await as(f.token, 'bell count').get('/notifications/count')).unread;
      const item = data<{ items: Array<{ id: string }> }>(await as(f.token, 'bell').get('/notifications')).items[0];
      const opened = item ? data<{ link: { type: string; id: string } | null; unread: number }>(await as(f.token, 'open item').post(`/notifications/${item.id}/open`, {})) : null;
      const ok = before === 1 && opened?.link?.type === 'TASK' && opened.link.id === t.id && opened.unread === 0;
      return { verdict: verdict(ok), observed: `before ${before}; link ${JSON.stringify(opened?.link)}; after ${opened?.unread}` };
    },
  },
  {
    id: 'p10-isolation', title: 'P-10: another user cannot see or open these bell items',
    expect: 'other advisor: list empty; open → 404 GEN-11',
    async run() {
      const f = await fixtureAdvisor();
      const at = inMinutes(10);
      await addTask(f, { dueDate: at.date, dueTime: at.time });
      await sweep();
      const item = data<{ items: Array<{ id: string }> }>(await as(f.token, 'bell').get('/notifications')).items[0];
      const o = await fixtureAdvisor();
      const list = data<{ items: unknown[] }>(await as(o.token, 'other bell').get('/notifications')).items;
      const open = await as(o.token, 'other opens item').post(`/notifications/${item?.id ?? 'ntf_x'}/open`, {});
      return { verdict: verdict(list.length === 0 && open.res.status === 404), observed: `their list ${list.length}; open ${seen(open)}` };
    },
  },
  {
    id: 'p09-short', title: 'AC-P09-1: fewer than CFG-24 characters gets DSH-02',
    expect: '"Pr" → 400 "Type at least 3 characters to search."',
    async run() {
      const f = await fixtureAdvisor();
      const r = await as(f.token, 'search "Pr"').get('/search?q=Pr');
      return { verdict: verdict(r.res.status === 400 && JSON.stringify(r.json).includes('Type at least 3 characters to search.')), observed: seen(r) };
    },
  },
  {
    id: 'p09-mobile', title: 'AC-P09-2: the last 4 digits of a mobile find the customer; family members open the Family tab',
    expect: 'customer found by its last 4 digits; a family member result opens CUSTOMER with tab family',
    async run() {
      const f = await fixtureAdvisor();
      const mobile = randomMobile();
      const cus = data<{ id: string }>(await as(f.token, 'create customer').post('/customers', { name: 'Zoya Fernandes', mobile }));
      await as(f.token, 'add family member').post(`/customers/${cus.id}/family`, { name: 'Zubin Fernandes', relationship: 'Son' });
      const byDigits = data<{ groups: Array<{ group: string; items: Array<{ id: string }> }> }>(await as(f.token, 'search digits').get(`/search?q=${mobile.slice(-4)}`));
      const fam = data<{ groups: Array<{ group: string; items: Array<{ open: { type: string; id: string; tab?: string } }> }> }>(await as(f.token, 'search family').get('/search?q=zubin'));
      const famItem = fam.groups.find((g) => g.group === 'FAMILY_MEMBERS')?.items[0];
      const ok = byDigits.groups.find((g) => g.group === 'CUSTOMERS')!.items.some((i) => i.id === cus.id) && famItem?.open.type === 'CUSTOMER' && famItem.open.id === cus.id && famItem.open.tab === 'family';
      return { verdict: verdict(ok), observed: `by digits: ${byDigits.groups[1]?.items.length}; family opens ${JSON.stringify(famItem?.open)}` };
    },
  },
  {
    id: 'p09-isolation', title: 'AC-P09-3: no result comes from another account',
    expect: 'another advisor searching the same name finds nothing (DSH-03)',
    async run() {
      const f = await fixtureAdvisor();
      await as(f.token, 'create customer').post('/customers', { name: 'Xavier Quentin', mobile: randomMobile() });
      const o = await fixtureAdvisor();
      const r = data<{ count: number; messageId?: string }>(await as(o.token, 'other searches').get('/search?q=xavier quentin'));
      return { verdict: verdict(r.count === 0 && r.messageId === 'DSH-03'), observed: `count ${r.count} ${r.messageId ?? ''}` };
    },
  },
  {
    id: 'p08-counts', title: 'AC-P08-1/2: dashboard counts match the records and include only this account',
    expect: '2 leads, 1 customer → open leads 2, active customers 1; another advisor sees 0',
    async run() {
      const f = await fixtureAdvisor();
      const pipeline = data<Array<{ id: string }>>(await as(f.token, 'pipelines').get('/pipelines'))[0]!.id;
      for (const n of ['Lead One', 'Lead Two']) await as(f.token, 'add lead').post('/leads', { pipelineId: pipeline, name: n, mobile: randomMobile(), source: 'Walk-in or personal contact' });
      await as(f.token, 'add customer').post('/customers', { name: 'Customer One', mobile: randomMobile() });
      const leads = data<{ count: number }>(await as(f.token, 'open leads').get('/dashboard/open-leads')).count;
      const cust = data<{ count: number }>(await as(f.token, 'active customers').get('/dashboard/active-customers')).count;
      const o = await fixtureAdvisor();
      const other = data<{ count: number }>(await as(o.token, 'other open leads').get('/dashboard/open-leads')).count;
      return { verdict: verdict(leads === 2 && cust === 1 && other === 0), observed: `open leads ${leads}, active customers ${cust}; other account ${other}` };
    },
  },
];