import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { clearWire, wireStore, type WireEntry } from '../api/wire';
import { devApi, type SmsMessage } from '../api/dev';
import { Button } from '../ui/Button';

const tone = (s: number) => (s === 0 || s >= 500 ? 'text-bad' : s >= 400 ? 'text-warn' : 'text-ok');

function Entry({ e }: { e: WireEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="receipt-edge border border-rule bg-sheet p-2.5 text-[0.78rem]">
      <button className="grid w-full cursor-pointer grid-cols-[auto_1fr_auto] gap-2 text-left" onClick={() => setOpen(!open)}>
        <span className="font-mono font-semibold">{e.method}</span>
        <span className="truncate font-mono">{e.path}</span>
        <span className={`font-mono font-semibold ${tone(e.status)}`}>{e.status || 'ERR'} · {e.ms}ms</span>
      </button>
      {e.label && <div className="mt-0.5 text-muted">{e.label}</div>}
      {open && (
        <div className="mt-2 grid gap-2">
          {e.requestId && <div className="font-mono text-muted">X-Request-Id {e.requestId}</div>}
          {e.requestBody !== undefined && <pre className="overflow-x-auto rounded bg-tray p-2 font-mono text-[0.72rem]">{JSON.stringify(e.requestBody, null, 2)}</pre>}
          {e.responseBody !== undefined && <pre className="max-h-80 overflow-auto rounded bg-tray p-2 font-mono text-[0.72rem]">{JSON.stringify(e.responseBody, null, 2)}</pre>}
        </div>
      )}
    </li>
  );
}

/** Test inbox for OTP SMS (SMS_PROVIDER=dev). Not available when the API runs without DEV_TOOLS. */
function SmsInbox() {
  const [messages, setMessages] = useState<SmsMessage[] | null>(null);
  const [failing, setFailing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { const r = await devApi.sms(); setMessages(r.messages); setFailing(r.failing); setError(null); }
    catch { setError('Test tools are off (DEV_TOOLS=false) or the API is not reachable.'); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(load, 2000); return () => clearInterval(t); }, [load]);

  return (
    <div className="grid gap-2.5">
      <p className="text-[0.78rem] text-[#9FB0BA]">SMS the API would send (dev only). Newest first.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={async () => { await devApi.clearSms(); await load(); }}>Clear</Button>
        <Button variant={failing ? 'danger' : 'default'} onClick={async () => { await devApi.setSmsFailing(!failing); await load(); }}>
          {failing ? 'SMS provider: failing' : 'Simulate SMS failure'}
        </Button>
      </div>
      {error && <p className="text-[0.8rem] text-rail-tag">{error}</p>}
      <ol className="m-0 grid list-none gap-2 p-0">
        {messages?.map((m, i) => (
          <li key={i} className="rounded border border-white/15 bg-white/5 p-2.5 text-[0.8rem] text-rail-text">
            <div className="flex justify-between gap-2 font-mono text-[0.72rem] text-[#9FB0BA]"><span>{m.to}</span><span>{new Date(m.at).toLocaleTimeString()}</span></div>
            <div className="mt-1">{m.text}</div>
            {m.kind === 'OTP' && (
              <button className="mt-1 cursor-pointer text-[0.75rem] text-rail-accent underline" onClick={() => navigator.clipboard?.writeText(m.text.slice(0, m.text.indexOf(' ')))}>Copy code</button>
            )}
          </li>
        ))}
        {messages?.length === 0 && <li className="text-[0.8rem] text-[#9FB0BA]">No messages yet.</li>}
      </ol>
    </div>
  );
}

export function WireLog() {
  const entries = useSyncExternalStore(wireStore.subscribe, wireStore.snapshot);
  const [tab, setTab] = useState<'traffic' | 'sms'>('sms');
  return (
    <aside className="flex flex-col overflow-hidden border-l border-rule bg-ink-soft max-[1100px]:border-t max-[1100px]:border-l-0" aria-label="Test panel">
      <div className="flex items-center gap-4 border-b border-white/10 px-4 pt-3">
        {([['sms', 'SMS inbox'], ['traffic', `API traffic (${entries.length})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px cursor-pointer border-b-2 pb-2 text-[0.85rem] ${tab === k ? 'border-rail-accent text-white' : 'border-transparent text-[#9FB0BA]'}`}>{label}</button>
        ))}
        {tab === 'traffic' && <button onClick={clearWire} className="ml-auto cursor-pointer pb-2 text-[0.78rem] text-[#9FB0BA] underline">Clear</button>}
      </div>
      <div className="overflow-y-auto p-3.5">
        {tab === 'sms' ? <SmsInbox /> : (
          <ol className="m-0 grid list-none gap-2.5 p-0">{entries.map((e) => <Entry key={e.id} e={e} />)}</ol>
        )}
      </div>
    </aside>
  );
}
