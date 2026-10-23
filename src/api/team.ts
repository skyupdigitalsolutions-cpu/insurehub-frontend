import { api, apiFull } from './client';

export interface TeamUser {
  id: string; name: string; mobile: string; role: string; roleLabel: string; status: 'INVITED' | 'ACTIVE' | 'DISABLED';
  invitedAt: string | null; activatedAt: string | null; lastLoginAt: string | null; version: number;
  recentActions?: Array<{ at: string; action: string; entity: string; entityRef: string | null }>;
}
const step = (token: string) => ({ 'X-Step-Up-Token': token });

export const teamApi = {
  assistants: () => api<{ items: TeamUser[]; limit: number; planAllows: boolean }>('GET', '/assistants'),
  addAssistant: (b: { name: string; mobile: string }, stepUpToken: string, key: string) =>
    apiFull<TeamUser>('POST', '/assistants', b, { label: 'Add assistant', headers: step(stepUpToken), idempotencyKey: key }),
  setAssistant: (id: string, enable: boolean, version: number) =>
    apiFull<TeamUser>('POST', `/assistants/${id}/${enable ? 'enable' : 'disable'}`, { version }, { label: enable ? 'Enable assistant' : 'Disable assistant' }),
  staff: () => api<TeamUser[]>('GET', '/staff'),
  addStaff: (b: { name: string; mobile: string; role: 'STF' | 'ADM' }, stepUpToken: string, key: string) =>
    apiFull<TeamUser>('POST', '/staff', b, { label: 'Add SkyUp user', headers: step(stepUpToken), idempotencyKey: key }),
  setStaffRole: (id: string, role: 'STF' | 'ADM', version: number, stepUpToken: string) =>
    apiFull<TeamUser>('POST', `/staff/${id}/role`, { role, version }, { label: 'Change role', headers: step(stepUpToken) }),
  setStaff: (id: string, enable: boolean, version: number, stepUpToken: string) =>
    apiFull<TeamUser>('POST', `/staff/${id}/${enable ? 'enable' : 'disable'}`, { version }, { label: enable ? 'Enable user' : 'Disable user', headers: step(stepUpToken) }),
};
