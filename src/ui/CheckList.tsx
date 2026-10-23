import { useState } from 'react';
import { session } from '../api/client';
import { Button } from './Button';

/**
 * Live verification checks shared by every module screen. Each check calls the real API and compares the
 * actual response with what the Business Process Document requires (the expected message IDs).
 *   verdict 'blocked' = a precondition was missing (for example the wrong role), so nothing was tested.
 */
export interface CheckResult { verdict: 'pass' | 'fail' | 'blocked'; observed: string; endsSession?: string }
export interface Check { id: string; title: string; expect: string; destructive?: string; run(): Promise<CheckResult> }

type State = 'idle' | 'running' | CheckResult['verdict'];
const edge: Record<State, string> = { idle: 'border-l-transparent', running: 'border-l-transparent', pass: 'border-l-ok', fail: 'border-l-bad', blocked: 'border-l-warn' };
const color: Record<State, string> = { idle: 'text-muted', running: 'text-muted', pass: 'text-ok', fail: 'text-bad', blocked: 'text-warn' };
const text: Record<State, string> = { idle: 'Not run', running: 'Running…', pass: 'Pass', fail: 'Fail', blocked: 'Not ready' };

export function CheckList({ checks, title = 'Backend checks', intro }: { checks: Check[]; title?: string; intro?: string }) {
  const [results, setResults] = useState<Record<string, CheckResult | 'running'>>({});

  async function run(check: Check) {
    setResults((r) => ({ ...r, [check.id]: 'running' }));
    let result: CheckResult;
    try { result = await check.run(); }
    catch (e) { result = { verdict: 'fail', observed: e instanceof Error ? e.message : 'Check crashed' }; }
    setResults((r) => ({ ...r, [check.id]: result }));
    if (result.endsSession) session.lost(result.endsSession);
  }

  async function runSafe() {
    for (const c of checks) if (!c.destructive) await run(c);
  }

  const counts = Object.values(results).reduce((a, r) => (r === 'running' ? a : { ...a, [r.verdict]: (a[r.verdict] ?? 0) + 1 }), {} as Record<string, number>);
  return (
    <section className="max-w-[880px] border-t border-rule py-6">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h2 className="text-lg leading-tight font-semibold">{title}</h2>
        <span className="text-[0.8125rem] text-muted">{counts.pass ?? 0} pass · {counts.fail ?? 0} fail</span>
        <Button onClick={runSafe}>Run safe checks</Button>
      </div>
      {intro && <p className="mb-3 max-w-[68ch] text-[0.875rem] text-ink-soft">{intro}</p>}
      <ol className="m-0 list-none p-0">
        {checks.map((c) => {
          const r = results[c.id];
          const state: State = r === undefined ? 'idle' : r === 'running' ? 'running' : r.verdict;
          return (
            <li key={c.id} className={`flex justify-between gap-4 border-b border-l-[3px] border-b-rule py-3.5 pl-3.5 ${edge[state]}`}>
              <div className="grid gap-[3px]">
                <strong>{c.title}</strong>
                <span className="text-[0.8125rem] text-muted">Expected: {c.expect}</span>
                {c.destructive && <span className="text-[0.8125rem] text-warn">{c.destructive}</span>}
                {r && r !== 'running' && <span className="text-[0.8125rem]">Observed: <span className="font-mono text-[0.92em]">{r.observed}</span></span>}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`min-w-16 text-right text-[0.8125rem] font-semibold ${color[state]}`}>{text[state]}</span>
                <Button onClick={() => run(c)} disabled={state === 'running'}>Run</Button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
