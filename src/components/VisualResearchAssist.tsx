import { useState } from 'react';
import { PHOTO_LIMITATION, REVIEW_PROMPT_VERSION, validateVisualFinding, visualRecordsToCsv, type VisualResearchRecord } from '../ai/visualResearch';
import { useStore } from '../state/store';
import { downloadText } from '../state/rawExport';
import { Button, Callout, Card, Field, inputClass } from './ui';
import { savePresentationConnection, clearPresentationConnection, type VisualConnection } from '../state/presentationConnection';
import { FacialScoreGraphic } from './viz/FacialScoreGraphic';

export const VisualResearchAssist = () => {
  const { endpoint, token, remember } = useStore(s => s.visualConnection);
  const [settingsInitiallyOpen] = useState(() => !useStore.getState().visualConnection.token);
  const connection = (patch: Partial<VisualConnection>) => {
    const store = useStore.getState();
    const next = { ...store.visualConnection, ...patch };
    store.setField('visualConnection', next);
    if (!savePresentationConnection(next) && next.remember) setError('This browser could not remember access. The current session still works.');
  };
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VisualResearchRecord | null>(null);
  const records = useStore(s => s.visualResearchRecords);
  const save = (record: VisualResearchRecord) => {
    const store = useStore.getState();
    store.setField('visualResearchRecords', [...store.visualResearchRecords, record]);
    setResult(record);
  };
  const pick = async (chosen: File | undefined) => {
    setFile(null); setImage(''); setResult(null); setError('');
    if (!chosen) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(chosen.type) || chosen.size > 4_000_000) {
      setError('Choose a JPEG, PNG or WebP smaller than 4 MB.'); return;
    }
    const reader = new FileReader();
    reader.onload = () => { setFile(chosen); setImage(String(reader.result)); };
    reader.onerror = () => setError('The photo could not be read.');
    reader.readAsDataURL(chosen);
  };
  const send = async () => {
    if (!file || !image || busy) return;
    let url: URL;
    try {
      url = new URL(endpoint);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
      url.pathname = '/review';
    } catch { setError('Enter your trusted HTTPS visual server address.'); return; }
    setBusy(true); setError(''); setResult(null);
    const started = performance.now();
    const record: VisualResearchRecord = {
      id: crypto.randomUUID(), sampleId: file.name, imageSha256: '', imageBytes: file.size,
      capturedAt: new Date().toISOString(), status: 'error', modelVersion: 'unknown',
      promptVersion: REVIEW_PROMPT_VERSION, finding: null, rawResponse: null,
      reviewerScore: null, reviewer: '', reviewedAt: null, error: null, latencyMs: 0,
    };
    try {
      const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      record.imageSha256 = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
      const store = useStore.getState();
      void store.audit.append(store.clinician || 'unattributed', 'visual.transmitted', 'Selected photo sent through the configured visual server to OpenAI.');
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-Token': token },
        body: JSON.stringify({ image }), signal: AbortSignal.timeout(90000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Visual service unavailable.');
      record.finding = validateVisualFinding(data.finding);
      record.rawResponse = typeof data.rawResponse === 'string' ? data.rawResponse : null;
      record.modelVersion = typeof data.modelVersion === 'string' ? data.modelVersion : 'unknown';
      record.promptVersion = typeof data.promptVersion === 'string' ? data.promptVersion : REVIEW_PROMPT_VERSION;
      record.status = record.finding.facialTension === null ? 'abstained' : 'ok';
    } catch (e) {
      record.error = e instanceof Error ? e.message : 'Review failed. No score was produced.';
      setError(record.error);
    } finally {
      record.latencyMs = Math.round(performance.now() - started);
      save(record); setBusy(false);
    }
  };
  const finding = result?.finding;
  const review = (score: number | null) => {
    if (!result) return;
    const store = useStore.getState();
    const updated = { ...result, reviewerScore: score, reviewer: store.clinician || 'unattributed', reviewedAt: new Date().toISOString() };
    store.setField('visualResearchRecords', store.visualResearchRecords.map(r => r.id === result.id ? updated : r));
    setResult(updated);
  };
  return <Card title="Photo assessment">
    <div className="space-y-4">
      <p className="text-sm text-slate-600">AI-assisted research preview · No baseline needed · Provisional facial item, not a complete pain assessment.</p>
      <details open={settingsInitiallyOpen}>
        <summary className="cursor-pointer font-medium">Connection settings</summary>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <Field label="Trusted server address"><input className={inputClass} type="url" placeholder="https://your-service.onrender.com" value={endpoint} disabled={busy} onChange={e => connection({ endpoint: e.target.value })} /></Field>
          <Field label="Demo access code" hint="Excluded from research exports."><input className={inputClass} type="password" autoComplete="off" value={token} disabled={busy} onChange={e => connection({ token: e.target.value })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={Boolean(remember)} disabled={busy} onChange={e => connection({ remember: e.target.checked })} />Remember access in this tab for the presentation</label>
        <p className="text-xs text-slate-500 mt-1">Enter once before your talk. Access survives refresh in this tab and stays out of the public website code. Use End presentation to clear it.</p>
      </details>
      {remember && token && <div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium text-emerald-700">Presentation access ready</span><Button variant="ghost" disabled={busy} onClick={() => { clearPresentationConnection(); connection({ token: '', remember: false }); }}>End presentation</Button></div>}
      <Field label="Choose one photo"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { void pick(e.target.files?.[0]); }} /></Field>
      {image && <img src={image} alt="Selected photo for visual review" className="max-h-80 rounded-lg object-contain" />}
      <p className="text-sm text-slate-600">Cloud review starts only when you press Review photo. Use public or appropriately authorized images.</p>
      <Button disabled={busy || !file || !endpoint || !token} onClick={() => { void send(); }}>{busy ? 'Reviewing photo…' : 'Review photo'}</Button>
      <details className="text-sm text-slate-600"><summary className="cursor-pointer">Privacy and method</summary><p className="mt-2">This photo is sent through the configured server to OpenAI. The server does not save photos; provider data handling applies. This general-purpose visual model is not a validated neonatal pain detector. No clinical accuracy percentage has been established. Keep the API key in private server settings.</p></details>
      {error && <Callout tone="danger" title="No score produced">{error}</Callout>}
      {finding && <div className="space-y-3 border rounded-lg p-4">
        <FacialScoreGraphic score={finding.facialTension} />
        <p className="font-medium">{finding.summary}</p>
        <ul className="list-disc pl-5">{finding.observations.map((text, i) => <li key={i}>{text}</li>)}</ul>
        <p>Eyes: {finding.eyes} · Brow: {finding.brow} · Mouth: {finding.mouth}</p>
        <p>{finding.scoreRationale || finding.reason}</p>
        <p className="text-sm text-slate-600">{PHOTO_LIMITATION}</p>
        <details><summary className="cursor-pointer text-sm">Research details and reviewer rating</summary>
        <p className="text-xs text-slate-500 mt-2">Model: {result?.modelVersion} · Prompt: {result?.promptVersion}. Model output is separate from clinician scoring.</p>
        <Field label="Your separate facial item rating" hint="This review is not blinded because the model suggestion is visible. Do not use it as an independent accuracy reference."><select className={inputClass} value={result?.reviewerScore ?? ''} onChange={e => review(e.target.value ? Number(e.target.value) : null)}><option value="">Not reviewed</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}/5</option>)}</select></Field>
        </details>
      </div>}
      {records.length > 0 && <div className="space-y-2">
        <Button variant="ghost" onClick={() => downloadText('tender-visual-research.csv', visualRecordsToCsv(records))}>Export {records.length} visual review record(s)</Button>
        <p className="text-sm text-slate-600">Includes image hash, observations, provisional item, model and prompt versions, raw response and failed reviews. These are model observations, not measured muscle activity. Session JSON also includes these records. Export before closing this tab.</p>
      </div>}
    </div>
  </Card>;
};
