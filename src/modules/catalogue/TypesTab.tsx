import { useCallback, useEffect, useState } from 'react';
import { errorText, fieldErrors, warningsOf } from '../../api/client';
import { catalogueApi, DATA_TYPES, GROUPS, SOURCES, type Factor, type Feature, type InsType, type Question, type Template } from '../../api/catalogue';
import { Button } from '../../ui/Button';
import { inputClass } from '../../ui/form';
import { Notice } from '../../ui/Notice';

const th = 'border-b border-rule py-2 pr-2 text-left text-[0.8125rem] font-semibold text-muted';
const td = 'border-b border-rule py-1.5 pr-2 align-top';
const cell = `${inputClass} py-1 text-[0.8125rem]`;
const move = <T,>(a: T[], i: number, d: number) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j]!, b[i]!]; return b; };

/** "18-35, 36-45" ↔ bands; "Zone A, Zone B" ↔ values. */
const bandsText = (b: Factor['bands']) => b.map((x) => `${x.from}-${x.to}`).join(', ');
const parseBands = (s: string) => s.split(',').map((p) => p.trim()).filter(Boolean).map((p) => { const [a, b] = p.split('-').map((x) => Number(x.trim())); return { from: a ?? NaN, to: b ?? NaN }; });

/** P-21 step 2: the table editor for one DRAFT template version. */
function TemplateEditor({ id, typeName, onClose }: { id: string; typeName: string; onClose: (m?: string) => void }) {
  const [t, setT] = useState<Template | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [factors, setFactors] = useState<Array<Factor & { bandsText: string; valuesText: string }>>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    const x = await catalogueApi.template(id);
    setT(x); setFeatures(x.features); setQuestions(x.questions);
    setFactors(x.factors.map((f) => ({ ...f, bandsText: bandsText(f.bands), valuesText: f.values.join(', ') })));
  }, [id]);
  useEffect(() => { load().catch((e) => setError(errorText(e))); }, [load]);
  if (!t) return error ? <Notice tone="error">{error}</Notice> : <p className="text-muted">Loading…</p>;
  const editable = t.status === 'DRAFT';
  const body = () => ({
    rev: t.rev, features: features.map((f, i) => ({ ...f, order: i + 1 })), questions,
    factors: factors.map(({ bandsText: bt, valuesText: vt, ...f }) => ({ ...f, bands: f.kind === 'BAND' ? parseBands(bt) : [], values: f.kind === 'VALUE' ? vt.split(',').map((v) => v.trim()).filter(Boolean) : [] })),
  });
  async function save(andSubmit: boolean) {
    setErrors({}); setError(null); setMessage(null);
    try {
      const saved = await catalogueApi.saveTemplate(id, body());
      if (!andSubmit) { setMessage('Draft saved.'); await load(); return; }
      const r = await catalogueApi.submitTemplate(id, saved.data.rev);
      onClose(r.meta.message);
    } catch (e) { setErrors(fieldErrors(e)); setError(errorText(e)); await load().catch(() => undefined); }
  }
  const rowErr = (prefix: string) => Object.entries(errors).filter(([k]) => k === prefix || k.startsWith(`${prefix}.`)).map(([, v]) => v);
  return (
    <section className="mb-6 rounded border border-rule bg-sheet p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h3 className="text-[1.1rem] font-semibold">{typeName}: template version {t.number}</h3>
        <span className="text-[0.8125rem] text-muted">{t.status.replace('_', ' ')}</span>
      </div>
      {t.rejectReason && editable && <div className="mb-3"><Notice tone="error">Rejected: {t.rejectReason}</Notice></div>}
      {!editable && <div className="mb-3"><Notice>This version is {t.status.replace('_', ' ').toLowerCase()} and cannot be edited.</Notice></div>}

      <h4 className="mt-2 mb-1 font-semibold">Features</h4>
      {errors.features && <p className="mb-1 text-[0.8125rem] text-bad">{errors.features}</p>}
      <div className="overflow-x-auto"><table className="w-full">
        <thead><tr><th className={th}>Feature</th><th className={th}>Group</th><th className={th}>Data type</th><th className={th}>Required to publish</th><th className={th}>Help text</th><th className={th} /></tr></thead>
        <tbody>{features.map((f, i) => (
          <tr key={i}>
            <td className={td}><input className={cell} disabled={!editable} value={f.name} onChange={(e) => setFeatures(features.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />{rowErr(`features.${i}`).map((m) => <p key={m} className="text-[0.75rem] text-bad">{m}</p>)}</td>
            <td className={td}><select className={cell} disabled={!editable} value={f.group} onChange={(e) => setFeatures(features.map((x, j) => (j === i ? { ...x, group: e.target.value } : x)))}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select></td>
            <td className={td}><select className={cell} disabled={!editable} value={f.dataType} onChange={(e) => setFeatures(features.map((x, j) => (j === i ? { ...x, dataType: e.target.value } : x)))}>{DATA_TYPES.map((g) => <option key={g}>{g}</option>)}</select></td>
            <td className={td}><input type="checkbox" disabled={!editable} checked={f.requiredToPublish} onChange={(e) => setFeatures(features.map((x, j) => (j === i ? { ...x, requiredToPublish: e.target.checked } : x)))} /></td>
            <td className={td}><input className={cell} disabled={!editable} value={f.help ?? ''} onChange={(e) => setFeatures(features.map((x, j) => (j === i ? { ...x, help: e.target.value || null } : x)))} /></td>
            <td className={`${td} whitespace-nowrap`}>{editable && <><button type="button" className="px-1" aria-label="Move up" onClick={() => setFeatures(move(features, i, -1))}>↑</button><button type="button" className="px-1" aria-label="Move down" onClick={() => setFeatures(move(features, i, 1))}>↓</button><button type="button" className="px-1 text-bad" onClick={() => setFeatures(features.filter((_, j) => j !== i))}>Remove</button></>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {editable && <Button onClick={() => setFeatures([...features, { name: '', group: 'Coverage', dataType: 'Yes/No', requiredToPublish: false }])}>+ Feature</Button>}

      <h4 className="mt-5 mb-1 font-semibold">Rating factors</h4>
      {errors.factors && <p className="mb-1 text-[0.8125rem] text-bad">{errors.factors}</p>}
      <div className="overflow-x-auto"><table className="w-full">
        <thead><tr><th className={th}>Factor</th><th className={th}>Kind</th><th className={th}>Filled from</th><th className={th}>Bands (18-35, 36-45) or values (Zone A, Zone B)</th><th className={th} /></tr></thead>
        <tbody>{factors.map((f, i) => (
          <tr key={i}>
            <td className={td}><input className={cell} disabled={!editable} value={f.name} onChange={(e) => setFactors(factors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /></td>
            <td className={td}><select className={cell} disabled={!editable} value={f.kind} onChange={(e) => setFactors(factors.map((x, j) => (j === i ? { ...x, kind: e.target.value as 'BAND' | 'VALUE' } : x)))}><option value="BAND">Band</option><option value="VALUE">Value</option></select></td>
            <td className={td}><select className={cell} disabled={!editable} value={f.source} onChange={(e) => setFactors(factors.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))}>{SOURCES.map((g) => <option key={g}>{g}</option>)}</select></td>
            <td className={td}>
              {f.kind === 'BAND'
                ? <input className={cell} disabled={!editable} value={f.bandsText} onChange={(e) => setFactors(factors.map((x, j) => (j === i ? { ...x, bandsText: e.target.value } : x)))} />
                : <input className={cell} disabled={!editable} value={f.valuesText} onChange={(e) => setFactors(factors.map((x, j) => (j === i ? { ...x, valuesText: e.target.value } : x)))} />}
              {Object.entries(errors).filter(([k]) => k.startsWith(`factors.${i}.`)).map(([k, m]) => <p key={k} className="text-[0.75rem] text-bad">{/bands\.(\d+)/.test(k) ? `Band ${Number(/bands\.(\d+)/.exec(k)![1]) + 1}: ` : ''}{m}</p>)}
            </td>
            <td className={`${td} whitespace-nowrap`}>{editable && <button type="button" className="px-1 text-bad" onClick={() => setFactors(factors.filter((_, j) => j !== i))}>Remove</button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {editable && <Button onClick={() => setFactors([...factors, { name: '', kind: 'BAND', source: 'Age of the eldest insured person', bands: [], values: [], bandsText: '', valuesText: '' }])}>+ Rating factor</Button>}

      <h4 className="mt-5 mb-1 font-semibold">Quotation questions</h4>
      <div className="overflow-x-auto"><table className="w-full">
        <thead><tr><th className={th}>Question</th><th className={th}>Data type</th><th className={th}>Required</th><th className={th} /></tr></thead>
        <tbody>{questions.map((q, i) => (
          <tr key={i}>
            <td className={td}><input className={cell} disabled={!editable} value={q.label} onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></td>
            <td className={td}><select className={cell} disabled={!editable} value={q.dataType} onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, dataType: e.target.value } : x)))}>{DATA_TYPES.map((g) => <option key={g}>{g}</option>)}</select></td>
            <td className={td}><input type="checkbox" disabled={!editable} checked={q.required} onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /></td>
            <td className={td}>{editable && <button type="button" className="px-1 text-bad" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>Remove</button>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {editable && <Button onClick={() => setQuestions([...questions, { label: '', dataType: 'Yes/No', required: false }])}>+ Question</Button>}

      <div className="mt-5 flex flex-wrap gap-2">
        {editable && <><Button onClick={() => void save(false)}>Save draft</Button><Button variant="primary" onClick={() => void save(true)}>Submit for approval</Button></>}
        <Button variant="link" onClick={() => onClose()}>Close</Button>
      </div>
      {message && <div className="mt-3"><Notice>{message}</Notice></div>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
    </section>
  );
}

/** Admin → Catalogue → Insurance types (P-21). */
export function TypesTab({ admin }: { admin: boolean }) {
  const [rows, setRows] = useState<InsType[] | null>(null);
  const [editing, setEditing] = useState<{ id: string; typeName: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setRows(await catalogueApi.types()); } catch (e) { setError(errorText(e)); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function open(t: InsType) {
    setError(null); setMessage(null);
    try { setEditing({ id: t.openTemplate?.id ?? (await catalogueApi.startDraft(t.id)).id, typeName: t.name }); void load(); } catch (e) { setError(errorText(e)); }
  }
  async function add() {
    setError(null);
    try { const r = await catalogueApi.createType(newName.trim()); setNewName(''); setEditing({ id: r.template.id, typeName: newName.trim() }); void load(); } catch (e) { setError(errorText(e)); }
  }
  async function deactivate(t: InsType) {
    try { await catalogueApi.deactivateType(t.id, t.version); }
    catch (e) {
      const w = warningsOf(e)[0];
      if (w?.messageId === 'CAT-09' && window.confirm(w.message)) {
        try { await catalogueApi.deactivateType(t.id, t.version, ['CAT-09']); setMessage(`${t.name} deactivated.`); } catch (e2) { setError(errorText(e2)); }
      } else if (w?.messageId !== 'CAT-09') setError(errorText(e));
      void load();
    }
  }
  return (
    <>
      {editing && <TemplateEditor key={editing.id} id={editing.id} typeName={editing.typeName} onClose={(m) => { setEditing(null); if (m) setMessage(m); void load(); }} />}
      {message && <div className="mb-4"><Notice>{message}</Notice></div>}
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <div className="mb-4 flex flex-wrap gap-2">
        <input className={`${inputClass} max-w-[280px]`} placeholder="New insurance type name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button variant="primary" disabled={!newName.trim()} onClick={() => void add()}>+ Type</Button>
      </div>
      {!rows ? <p className="text-muted">Loading…</p> : (
        <table className="w-full text-[0.875rem]">
          <thead><tr><th className={th}>Type</th><th className={th}>Status</th><th className={th}>Live template</th><th className={th}>Being changed</th><th className={th} /></tr></thead>
          <tbody>{rows.map((t) => (
            <tr key={t.id}>
              <td className={`${td} font-medium`}>{t.name}</td>
              <td className={td}>{t.status}</td>
              <td className={td}>{t.activeTemplate ? `Version ${t.activeTemplate.number}` : <span className="text-muted">none yet</span>}</td>
              <td className={td}>{t.openTemplate ? `Version ${t.openTemplate.number}: ${t.openTemplate.status.replace('_', ' ').toLowerCase()}${t.openTemplate.rejectReason ? ' (rejected)' : ''}` : '—'}</td>
              <td className={`${td} whitespace-nowrap`}>
                <Button onClick={() => void open(t)}>{t.openTemplate ? 'Open draft' : 'Edit template'}</Button>
                {admin && (t.status === 'ACTIVE'
                  ? <Button variant="link" onClick={() => void deactivate(t)}>Deactivate</Button>
                  : <Button variant="link" onClick={() => void catalogueApi.activateType(t.id, t.version).then(() => load(), (e) => setError(errorText(e)))}>Activate</Button>)}
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </>
  );
}