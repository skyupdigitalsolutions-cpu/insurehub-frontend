// Build order, following the module sections of the Business Process Document v3.2.
// Each module unlocks here as its backend passes the Build → Run → Test → Correct → Verify gate.
export type ModuleState = 'built' | 'next' | 'pending';
export const MODULES: Array<{ key: string; name: string; ref: string; state: ModuleState }> = [
  { key: 'auth', name: 'Access and sessions', ref: '§5 P-01–P-04', state: 'built' },
  { key: 'team', name: 'Team and access', ref: '§3.2 P-48 P-53', state: 'built' },
  { key: 'leads', name: 'Leads and pipelines', ref: '§7 P-12–P-14', state: 'built' },
  { key: 'customers', name: 'Customers, family, consent', ref: '§8 P-15–P-17 P-19', state: 'built' },
  { key: 'profile', name: 'Advisor profile, KYC, agent codes', ref: '§5 P-05–P-07', state: 'next' },
  { key: 'documents', name: 'Document vault and vehicles', ref: 'P-18 P-54', state: 'pending' },
  { key: 'dashboard', name: 'Dashboard, search, bell, tasks', ref: '§6 P-08–P-11', state: 'pending' },
  { key: 'catalogue', name: 'Insurance catalogue', ref: '§9 P-20–P-25 P-58', state: 'pending' },
  { key: 'bestfit', name: 'Best-fit ranking', ref: '§10 P-26', state: 'pending' },
  { key: 'quotes', name: 'Quotations and comparisons', ref: '§11 P-27–P-30', state: 'pending' },
  { key: 'payments', name: 'Payments and proposals', ref: '§12 P-31 P-32 P-55', state: 'pending' },
  { key: 'policies', name: 'Policies and nominees', ref: '§13 P-33–P-36', state: 'pending' },
  { key: 'renewals', name: 'Renewals', ref: '§14 P-37 P-38', state: 'pending' },
  { key: 'comms', name: 'Communications and WhatsApp', ref: '§15 P-39–P-43 P-56', state: 'pending' },
  { key: 'referrals', name: 'Referral app', ref: '§16 P-44–P-46', state: 'pending' },
  { key: 'admin', name: 'Plans, admin, audit, support', ref: '§17 P-47 P-49–P-52 P-57', state: 'pending' },
];
