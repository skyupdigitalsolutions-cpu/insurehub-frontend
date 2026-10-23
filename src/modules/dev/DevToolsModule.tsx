import { useCallback, useEffect, useState } from 'react';
import { errorText } from '../../api/client';
import { devApi, type CfgRow } from '../../api/dev';
import { loadReference } from '../../api/reference';
import { Button } from '../../ui/Button';
import { inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';

const th = 'border-b border-rule py-2 pr-3 text-left font-semibold text-muted';
const td = 'border-b border-rule py-2 pr-3 align-top';

function CfgEditor({ row, onSaved, onError }: { row: CfgRow; onSaved: () => void; onError: (m: string) => void }) {
  const [value, setValue] = useState(JSON.stringify(row.value));
  useEffect(() => setValue(JSON.stringify(row.value)), [row.value]);
  async function save() {
    try { await devApi.setConfig(row.id, JSON.parse(value)); onSaved(); }
    catch (e) { onError(e instanceof SyntaxError ? `${row.id}: not valid JSON` : errorText(e)); }
  }
  return (
    <tr>
      <td className={`${td} font-mono`}>{row.id}</td>
      <td className={td}>{row.label}{row.unit && <span className="text-muted"> ({row.unit})</span>}<div className="text-[0.72rem] text-muted">Default {JSON.stringify(row.default)} · change by {row.change}</div></td>
      <td className={td}><input className={`${inputClass} font-mono text-[0.8rem] ${row.overridden ? 'border-warn' : ''}`} value={value} onChange={(e) => setValue(e.target.value)} /></td>
      <td className={`${td} whitespace-nowrap`}>
        <Button onClick={save}>Set</Button>{' '}
        {row.overridden && <Button variant="link" onClick={async () => { await devApi.resetConfig(row.id); onSaved(); }}>Reset</Button>}
      </td>
    </tr>
  );
}

/**
 * Test tools (NFR-13 test clock, CFG overrides). They exist only when the API runs with DEV_TOOLS=true,
 * which it refuses in production. Overrides here skip the P-49 maker-checker flow on purpose.
 */
export function DevToolsModule() {
  const [clock, setClock] = useState<{ offsetMs: number; ist: string } | null>(null);
  const [cfg, setCfg] = useState<CfgRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setClock(await devApi.clock()); setCfg(await devApi.config()); setError(null); }
    catch { setError('Test tools are not available: start the API with DEV_TOOLS=true (non-production only).'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const move = async (b: { advanceMinutes?: number; reset?: boolean }, label: string) => { setClock(await devApi.setClock(b)); setMessage(label); };

  return (
    <main className="overflow-y-auto px-[clamp(20px,4vw,56px)] pt-9 pb-16">
      <header className="mb-6 max-w-[68ch]">
        <h1 className="text-[1.9rem] leading-tight font-bold tracking-[-0.01em]">Test tools</h1>
        <p className="mt-2 text-ink-soft">Non-production helpers for testing date rules and limits. Never available in production.</p>
      </header>
      {message && <Notice>{message}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <section className="max-w-[880px] border-t border-rule py-6">
        <h2 className="mb-2 text-lg font-semibold">Test clock</h2>
        <p className="mb-3 text-[0.875rem] text-ink-soft">Moves the API's "now" for OTP expiry (CFG-02), idle and longest session (CFG-07, CFG-08), trial end and read-only mode (CFG-78, GR-33). Moving it past 30 minutes ends idle sessions, including yours.</p>
        {clock && <p className="mb-3 font-mono text-[0.875rem]">API now: {clock.ist} IST · offset {Math.round(clock.offsetMs / 60000)} min</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => move({ advanceMinutes: 6 }, 'Clock moved 6 minutes: open OTPs have expired.')}>+6 minutes</Button>
          <Button onClick={() => move({ advanceMinutes: 31 }, 'Clock moved 31 minutes: idle sessions end on their next request.')}>+31 minutes</Button>
          <Button onClick={() => move({ advanceMinutes: 24 * 60 }, 'Clock moved 1 day.')}>+1 day</Button>
          <Button onClick={() => move({ advanceMinutes: 8 * 24 * 60 }, 'Clock moved 8 days: a new trial account is now past its trial (read-only).')}>+8 days</Button>
          <Button variant="danger" onClick={() => move({ reset: true }, 'Clock back to real time.')}>Reset clock</Button>
        </div>
      </section>

      <section className="max-w-[880px] border-t border-rule py-6">
        <h2 className="mb-2 text-lg font-semibold">Limits and providers</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={async () => { const r = await devApi.resetLimits(); setMessage(`Cleared ${r.counters} rate counters and ${r.otpLocks} OTP locks.`); }}>Reset rate limits and OTP locks</Button>
          <Button onClick={async () => { const r = await devApi.sms(); await devApi.setSmsFailing(!r.failing); setMessage(r.failing ? 'SMS provider working again.' : 'SMS provider now fails: Send OTP shows AUTH-13.'); }}>Toggle SMS provider failure</Button>
        </div>
      </section>

      <section className="max-w-[1000px] border-t border-rule py-6">
        <h2 className="mb-2 text-lg font-semibold">Configuration values (CFG)</h2>
        <p className="mb-3 text-[0.875rem] text-ink-soft">Every business number comes from here (Section 3.4–3.6). Values are JSON: <code>5</code>, <code>true</code>, <code>["a","b"]</code>, <code>{'{"min":2,"max":200}'}</code>. In production a SkyUp Admin changes them through P-49 with a second admin's approval (not built yet).</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[0.8125rem]">
            <thead><tr><th className={th}>ID</th><th className={th}>Setting</th><th className={th}>Value</th><th className={th} /></tr></thead>
            <tbody>{cfg.map((r) => <CfgEditor key={r.id} row={r} onError={setError} onSaved={async () => { setMessage(`${r.id} saved.`); await loadReference(true); await load(); }} />)}</tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
