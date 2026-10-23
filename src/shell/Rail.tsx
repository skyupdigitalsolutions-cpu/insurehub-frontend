import { MODULES } from './modules';
import { useAuth } from '../auth/AuthProvider';

export function Rail({ active, onSelect }: { active: string; onSelect: (key: string) => void }) {
  const { user } = useAuth();
  const row = (current: boolean, built: boolean) => `grid w-full grid-cols-[24px_1fr_auto] items-baseline gap-1.5 rounded px-2 py-[7px] text-left text-[0.8125rem]
    ${built ? 'text-white' : 'text-rail-muted'} ${current ? 'bg-white/10 shadow-[inset_3px_0_0_var(--color-rail-accent)]' : ''}`;
  return (
    <nav aria-label="Modules" className="flex flex-col overflow-y-auto bg-ink px-3.5 py-5 text-rail-text">
      <div className="flex items-center gap-2.5 px-1.5 pb-5">
        <span aria-hidden className="grid size-[34px] place-items-center rounded-full border-[1.5px] border-rail-text text-[0.8125rem] font-bold">BY</span>
        <span><strong className="block text-lg text-white">Bimayantra</strong><small className="text-[#9FB0BA]">API test console · BPD v3.2</small></span>
      </div>
      <ol className="m-0 list-none p-0">
        {MODULES.map((m, i) => {
          const built = m.state === 'built';
          const content = (
            <>
              <span className="text-right tabular-nums text-rail-num">{i + 1}</span>
              <span>{m.name}<span className="block text-[0.68rem] text-rail-muted">{m.ref}</span></span>
              {m.state === 'next' && <span className="text-[0.72rem] text-rail-tag">Next</span>}
            </>
          );
          return (
            <li key={m.key}>
              {built && user
                ? <button onClick={() => onSelect(m.key)} aria-current={m.key === active ? 'page' : undefined} className={`${row(m.key === active, true)} cursor-pointer hover:bg-white/5`}>{content}</button>
                : <div className={row(false, built)}>{content}</div>}
            </li>
          );
        })}
      </ol>
      <button onClick={() => onSelect('dev')} aria-current={active === 'dev' ? 'page' : undefined}
        className={`mt-3 cursor-pointer rounded border border-dashed border-white/20 px-2 py-[7px] text-left text-[0.8125rem] text-rail-tag hover:bg-white/5 ${active === 'dev' ? 'bg-white/10' : ''}`}>
        Test tools (dev only)
      </button>
      {user && (
        <footer className="mt-auto border-t border-white/10 px-2 pt-4">
          <strong className="block text-white">{user.name}</strong>
          <small className="text-[#9FB0BA]">{user.roleLabel}{user.advisorName ? ` · ${user.advisorName}` : ''}</small>
        </footer>
      )}
    </nav>
  );
}
