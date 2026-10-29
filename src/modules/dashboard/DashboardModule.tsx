import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { errorText, fieldErrors } from '../../api/client';
import { dashboardApi, tasksApi, type TaskTab, type TaskView } from '../../api/workday';
import { useAuth } from '../../auth/AuthProvider';
import { openRecord, useOpenRecord } from '../../shell/nav';
import { Button } from '../../ui/Button';
import { CheckList } from '../../ui/CheckList';
import { Field, Tabs, fmtDateTime, inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';
import { WORKDAY_CHECKS } from './checks';

// ── Dashboard (P-08): every widget loads on its own ─────────────────────────

function Widget<T>({ path, title, refresh, children }: { path: string; title: string; refresh: number; children: (d: T) => ReactNode }) {
  const [d, setD] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => { setFailed(false); setD(null); dashboardApi.widget(path).then((x) => setD(x as T), () => setFailed(true)); }, [path]);
  useEffect(load, [load, refresh]);
  return (
    <section className="rounded border border-rule bg-sheet p-4">
      <h3 className="mb-2 text-[0.8125rem] font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {failed ? (
        <div className="text-[0.875rem]"><p className="mb-2 text-bad">Could not load this section. Select Retry.</p><Button onClick={load}>Retry</Button></div>
      ) : d === null ? <p className="text-[0.875rem] text-muted">Loading…</p> : children(d)}
    </section>
  );
}

type CountW = { count: number; available?: boolean; arrivesWith?: string; emptyMessage?: string; opens?: { list: string; filter: Record<string, unknown> } };
const Count = ({ d, label }: { d: CountW; label: string }) => d.available === false
  ? <p className="text-[0.875rem] text-muted">Arrives with {d.arrivesWith}.</p>
  : <button type="button" className="text-left" onClick={() => d.opens && (d.opens.list === 'LEADS' || d.opens.list === 'CUSTOMERS') && openRecord({ type: 'LIST', list: d.opens.list, filter: d.opens.filter })}>
      <span className="block text-[2rem] leading-none font-bold">{d.count}</span>
      <span className="text-[0.8125rem] text-muted">{d.count === 0 && d.emptyMessage ? d.emptyMessage : label}</span>
    </button>;

const ACTION_TEXT: Record<string, string> = {
  LEAD_CREATED: 'Lead added', LEAD_STATUS_CHANGED: 'Lead status changed', LEAD_REOPENED: 'Lead reopened', LEAD_CONVERTED: 'Lead converted to a customer',
  LEAD_CONTACT_LOGGED: 'Contact logged', CUSTOMER_CREATED: 'Customer added', CUSTOMER_DEACTIVATED: 'Customer deactivated', CUSTOMER_REACTIVATED: 'Customer reactivated',
  FAMILY_MEMBER_ADDED: 'Family member added', DOCUMENT_UPLOADED: 'Document uploaded', DOCUMENT_CONFIRMED: 'Document confirmed', VEHICLE_ADDED: 'Vehicle added',
  VEHICLE_MARKED_SOLD: 'Vehicle marked sold', VEHICLE_REACTIVATED: 'Vehicle active again', TASK_CREATED: 'Task added', TASK_DONE: 'Task done',
  KYC_SUBMITTED: 'KYC submitted', KYC_RESUBMITTED_AFTER_VERIFIED: 'KYC submitted again', KYC_VERIFIED: 'KYC verified', KYC_REJECTED: 'KYC not accepted',
  INSURER_MAPPING_ADDED: 'Insurer added', ASSISTANT_ADDED: 'Assistant added',
};

function Dashboard() {
  const [refresh, setRefresh] = useState(0);
  const [period, setPeriod] = useState<'THIS_MONTH' | 'LAST_3_MONTHS' | 'THIS_YEAR'>('THIS_MONTH');
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setRefresh((n) => n + 1)}>Refresh</Button>
        <Button variant="primary" onClick={() => openRecord({ type: 'LIST', list: 'LEADS', filter: { create: true } })}>+ Lead</Button>
        <Button variant="primary" onClick={() => openRecord({ type: 'LIST', list: 'CUSTOMERS', filter: { create: true } })}>+ Customer</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Widget<CountW> path="open-leads" title="Open leads" refresh={refresh}>{(d) => <Count d={d} label="open leads" />}</Widget>
        <Widget<CountW> path="active-customers" title="Active customers" refresh={refresh}>{(d) => <Count d={d} label="active customers" />}</Widget>
        <Widget<CountW> path="open-quotations" title="Open quotations" refresh={refresh}>{(d) => <Count d={d} label="open quotations" />}</Widget>
        <Widget<CountW> path="policies-in-force" title="Policies in force" refresh={refresh}>{(d) => <Count d={d} label="policies" />}</Widget>
        <Widget<CountW> path="renewals-due" title="Renewals due" refresh={refresh}>{(d) => <Count d={d} label="renewals" />}</Widget>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Widget<{ created: number; converted: number; emptyMessage?: string; bars: Array<{ status: string; count: number }> }> path={`funnel?period=${period}`} title="Lead funnel" refresh={refresh}>
          {(d) => (
            <div>
              <select className={`${inputClass} mb-3 max-w-[200px]`} value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
                <option value="THIS_MONTH">This month</option><option value="LAST_3_MONTHS">Last 3 months</option><option value="THIS_YEAR">This year</option>
              </select>
              {d.created === 0 ? <p className="text-[0.875rem] text-muted">{d.emptyMessage}</p> : (
                <>
                  {d.bars.map((b) => (
                    <div key={b.status} className="mb-1.5 flex items-center gap-2 text-[0.8125rem]">
                      <span className="w-[90px] text-muted">{b.status.replace('_', '-').toLowerCase()}</span>
                      <span className="h-3 rounded bg-ok" style={{ width: `${Math.max(2, (b.count / d.created) * 100)}%` }} />
                      <span>{b.count}</span>
                    </div>
                  ))}
                  <p className="mt-2 text-[0.8125rem] text-muted">{d.created} created, {d.converted} converted</p>
                </>
              )}
            </div>
          )}
        </Widget>
        <Widget<{ tasks: TaskView[]; emptyMessage?: string }> path="todays-tasks" title="Today's tasks" refresh={refresh}>
          {(d) => d.tasks.length === 0 ? <p className="text-[0.875rem] text-muted">{d.emptyMessage}</p> : (
            <ul className="text-[0.875rem]">{d.tasks.map((t) => (
              <li key={t.id} className="flex justify-between gap-3 border-b border-rule py-1.5">
                <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => openRecord({ type: 'TASK', id: t.id })}>{t.title}</button>
                <span className={t.overdue ? 'text-bad' : 'text-muted'}>{t.overdue ? 'Overdue · ' : ''}{t.dueShown.slice(11)}</span>
              </li>
            ))}</ul>
          )}
        </Widget>
        <Widget<{ events: Array<{ id: string; entity: string; entityId: string; ref: string | null; action: string; at: string }>; emptyMessage?: string }> path="recent-activity" title="Recent activity" refresh={refresh}>
          {(d) => d.events.length === 0 ? <p className="text-[0.875rem] text-muted">{d.emptyMessage}</p> : (
            <ul className="text-[0.875rem]">{d.events.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 border-b border-rule py-1.5">
                {e.entity === 'lead' || e.entity === 'customer'
                  ? <button type="button" className="text-left hover:underline" onClick={() => openRecord(e.entity === 'lead' ? { type: 'LEAD', id: e.entityId } : { type: 'CUSTOMER', id: e.entityId })}>{ACTION_TEXT[e.action] ?? e.action}{e.ref ? ` · ${e.ref}` : ''}</button>
                  : <span>{ACTION_TEXT[e.action] ?? e.action}{e.ref ? ` · ${e.ref}` : ''}</span>}
                <span className="text-muted">{fmtDateTime(e.at)}</span>
              </li>
            ))}</ul>
          )}
        </Widget>
        <Widget<{ hidden: boolean; percent?: number; message?: string | null }> path="profile-card" title="Your profile" refresh={refresh}>
          {(d) => d.hidden ? <p className="text-[0.875rem] text-muted">Your profile is complete.</p> : (
            <div className="text-[0.875rem]">
              <div className="mb-2 h-2 overflow-hidden rounded-full bg-rule"><div className="h-full bg-ok" style={{ width: `${d.percent}%` }} /></div>
              <p className="mb-2">{d.message}</p>
              <Button onClick={() => openRecord({ type: 'PROFILE' })}>Complete my profile</Button>
            </div>
          )}
        </Widget>
      </div>
    </>
  );
}

// ── Tasks (P-11) ─────────────────────────────────────────────────────────

const TAB_LABEL: Record<TaskTab, string> = { OVERDUE: 'Overdue', TODAY: 'Today', UPCOMING: 'Upcoming', DONE: 'Done' };
/** Due date as DD-MM-YYYY and time as hh:mm AM from "DD-MM-YYYY hh:mm AM". */
const split = (shown: string) => ({ date: shown.slice(0, 10), time: shown.slice(11) });

function TaskForm({ task, onSaved, onCancel }: { task?: TaskView; onSaved: (m: string) => void; onCancel: () => void }) {
  const init = task ? split(task.dueShown) : { date: '', time: '' };
  const [f, setF] = useState({ title: task?.title ?? '', dueDate: init.date, dueTime: init.time, notes: task?.notes ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setErrors({}); setError(null);
    try {
      const r = task ? await tasksApi.edit(task.id, { version: task.version, ...f, notes: f.notes || null }) : await tasksApi.create({ ...f, ...(f.notes ? {} : { notes: undefined }) });
      onSaved(r.meta.message ?? 'Task saved.');
    } catch (e) { setErrors(fieldErrors(e)); setError(errorText(e)); }
  }
  return (
    <div className="mb-4 rounded border border-rule bg-sheet p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2"><Field label="Title" required error={errors.title}><input className={inputClass} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field></div>
        <Field label="Due date" required error={errors.dueDate} hint="DD-MM-YYYY"><input className={inputClass} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} placeholder="DD-MM-YYYY" /></Field>
        <Field label="Due time" required error={errors.dueTime} hint="10:30 AM"><input className={inputClass} value={f.dueTime} onChange={(e) => setF({ ...f, dueTime: e.target.value })} placeholder="10:30 AM" /></Field>
        <div className="sm:col-span-4"><Field label="Notes" error={errors.notes}><input className={inputClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
      </div>
      <div className="mt-3 flex gap-2"><Button variant="primary" onClick={() => void save()}>Save</Button><Button variant="link" onClick={onCancel}>Cancel</Button></div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </div>
  );
}

function Tasks({ focus }: { focus: string | null }) {
  const [tab, setTab] = useState<TaskTab>('TODAY');
  const [data, setData] = useState<{ tasks: TaskView[]; counts: Record<TaskTab, number> } | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (t: TaskTab) => { try { setData(await tasksApi.list(t)); } catch (e) { setError(errorText(e)); } }, []);
  useEffect(() => { void load(tab); }, [tab, load]);
  const done = (m: string) => { setAdding(false); setEditing(null); setMessage(m); void load(tab); };
  async function act(t: TaskView, action: 'done' | 'reopen' | 'cancel') {
    if (action === 'cancel' && !window.confirm(`Cancel the task "${t.title}"?`)) return;
    setError(null);
    try { const r = await tasksApi.status(t.id, action, t.version); done(r.meta.message ?? 'Saved.'); } catch (e) { setError(errorText(e)); void load(tab); }
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(Object.keys(TAB_LABEL) as TaskTab[]).map((t) => (
          <Button key={t} variant={tab === t ? 'primary' : 'default'} onClick={() => { setTab(t); setMessage(null); }}>{TAB_LABEL[t]}{data ? ` (${data.counts[t]})` : ''}</Button>
        ))}
        <span className="flex-1" />
        <Button variant="primary" onClick={() => { setAdding(true); setMessage(null); }}>+ Task</Button>
      </div>
      {adding && <TaskForm onSaved={done} onCancel={() => setAdding(false)} />}
      {message && <div className="mb-3"><Notice>{message}</Notice></div>}
      {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}
      {!data ? <p className="text-muted">Loading…</p> : data.tasks.length === 0 ? <p className="text-muted">No tasks here.</p> : (
        <ul className="divide-y divide-rule rounded border border-rule bg-sheet">
          {data.tasks.map((t) => editing === t.id ? <li key={t.id} className="p-2"><TaskForm task={t} onSaved={done} onCancel={() => setEditing(null)} /></li> : (
            <li key={t.id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 text-[0.875rem] ${focus === t.id ? 'bg-warn-tint' : ''}`}>
              <div className="min-w-[200px] flex-1">
                <div className="font-medium">{t.title}</div>
                <div className={t.overdue ? 'text-bad' : 'text-muted'}>{t.overdue ? 'Overdue · ' : ''}{t.dueShown}{t.linked ? ` · ${t.linked.type === 'LEAD' ? 'Lead' : 'Customer'}: ` : ''}
                  {t.linked && <button type="button" className="underline" onClick={() => openRecord(t.linked!.type === 'LEAD' ? { type: 'LEAD', id: t.linked!.id } : { type: 'CUSTOMER', id: t.linked!.id })}>{t.linked.name}</button>}
                  {t.linked?.status && !/^(ACTIVE|NEW|CONTACTED|QUALIFIED|FOLLOW_UP)$/.test(t.linked.status) && ` (${t.linked.status})`}</div>
                {t.notes && <div className="text-muted">{t.notes}</div>}
              </div>
              {t.status === 'OPEN' && <><Button variant="primary" onClick={() => void act(t, 'done')}>Mark done</Button><Button onClick={() => setEditing(t.id)}>Edit</Button><Button variant="link" onClick={() => void act(t, 'cancel')}>Cancel task</Button></>}
              {t.status === 'DONE' && <Button onClick={() => void act(t, 'reopen')}>Reopen</Button>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function DashboardModule() {
  const { can } = useAuth();
  const advisor = can('dashboard.view');
  const [tab, setTab] = useState<'dashboard' | 'tasks' | 'checks'>(advisor ? 'dashboard' : 'checks');
  const [focus, setFocus] = useState<string | null>(null);
  useOpenRecord((t) => t.type === 'TASK' || (t.type === 'LIST' && t.list === 'TASKS'), (t) => { setTab('tasks'); setFocus(t.type === 'TASK' ? t.id ?? null : null); });
  return (
    <main className="overflow-y-auto px-[clamp(20px,4vw,56px)] pt-7 pb-16">
      <header className="mb-5 max-w-[68ch]">
        <h1 className="text-[1.9rem] leading-tight font-bold tracking-[-0.01em]">Dashboard and tasks</h1>
        <p className="mt-2 text-ink-soft">P-08 to P-11. Search and the bell are in the top bar. Each dashboard widget loads on its own; a reminder arrives {30} minutes before each task.</p>
      </header>
      <Tabs tabs={[...(advisor ? [['dashboard', 'Dashboard'], ['tasks', 'Tasks']] as Array<['dashboard' | 'tasks', string]> : []), ['checks', 'Backend checks']]} active={tab} onChange={setTab} />
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'tasks' && <Tasks focus={focus} />}
      {tab === 'checks' && <CheckList checks={WORKDAY_CHECKS} intro="Each check uses a throwaway advisor. The reminder check runs the minute sweep straight away (dev tools)." />}
    </main>
  );
}