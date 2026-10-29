import { api, apiFull } from './client';

/** Module 7: tasks (P-11), bell (P-10), dashboard widgets (P-08), search (P-09). */
export type TaskTab = 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'DONE';
export interface TaskView {
  id: string; kind: 'GENERAL' | 'LEAD_FOLLOW_UP'; title: string; dueAt: string; dueShown: string; status: 'OPEN' | 'DONE' | 'CANCELLED';
  notes: string | null; overdue: boolean; version: number; doneAt: string | null;
  linked: { type: 'LEAD' | 'CUSTOMER'; id: string; name: string | null; status: string | null } | null;
}
export interface BellItem { id: string; messageId: string; message: string; createdAt: string; read: boolean; link: { type: string; id: string } | null }
export interface Count { unread: number; shown: string }
export interface SearchItem { type: string; id: string; title: string; subtitle: string; status: string; open: { type: string; id: string; tab?: string } }
export interface SearchResult { text: string; count: number; groups: Array<{ group: string; items: SearchItem[]; more: boolean; available?: boolean }>; messageId?: string; message?: string }
export interface Widget { count: number; opens?: { list: string; filter: Record<string, unknown> }; available?: boolean; arrivesWith?: string; emptyMessage?: string }

export const tasksApi = {
  list: (tab: TaskTab) => api<{ tab: TaskTab; tasks: TaskView[]; counts: Record<TaskTab, number> }>('GET', `/tasks?tab=${tab}`),
  create: (b: { title: string; dueDate: string; dueTime: string; notes?: string; linkedType?: string; linkedId?: string }) => apiFull<TaskView>('POST', '/tasks', b, { label: 'Add task' }),
  edit: (id: string, b: { version: number; title?: string; dueDate?: string; dueTime?: string; notes?: string | null }) => apiFull<TaskView>('PATCH', `/tasks/${id}`, b, { label: 'Edit task' }),
  status: (id: string, action: 'done' | 'reopen' | 'cancel', version: number) => apiFull<TaskView>('POST', `/tasks/${id}/${action}`, { version }, { label: action === 'done' ? 'Mark task done' : action === 'reopen' ? 'Reopen task' : 'Cancel task' }),
};
export const bellApi = {
  count: () => api<Count>('GET', '/notifications/count', undefined, { label: 'Bell count' }),
  list: () => api<{ items: BellItem[]; more: boolean } & Count>('GET', '/notifications', undefined, { label: 'Bell' }),
  open: (id: string) => api<{ link: { type: string; id: string } | null } & Count>('POST', `/notifications/${id}/open`, {}, { label: 'Open notification', idempotencyKey: false }),
  readAll: () => api<{ marked: number } & Count>('POST', '/notifications/read-all', {}, { label: 'Mark all as read', idempotencyKey: false }),
};
export const dashboardApi = {
  widget: (path: string) => api<Widget & Record<string, unknown>>('GET', `/dashboard/${path}`, undefined, { label: `Dashboard: ${path}` }),
};
export const searchApi = {
  search: (q: string) => api<SearchResult>('GET', `/search?q=${encodeURIComponent(q)}`, undefined, { label: 'Search' }),
};