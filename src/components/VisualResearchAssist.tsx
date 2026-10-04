import { useState } from 'react';
import { PHOTO_LIMITATION, REVIEW_PROMPT_VERSION, validateVisualFinding, visualRecordsToCsv, type VisualResearchRecord } from '../ai/visualResearch';
import { useStore } from '../state/store';
import { downloadText } from '../state/rawExport';
import { Button, Callout, Card, Field, inputClass } from './ui';

export const VisualResearchAssist = () => {
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
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
  return <Card title="AI photo description and research score">
    <div className="space-y-4">
      <Callout tone="warn" title="Investigational photo review">
        Describe visible expression and suggest a facial tension item without a baseline. This is not a complete pain score or a validated neonatal pain detector. No clinical accuracy percentage has been established.
      </Callout>
      <details>
        <summary className="cursor-pointer font-medium">Connect your visual server</summary>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <Field label="Trusted server address"><input className={inputClass} type="url" placeholder="https://your-service.onrender.com" value={endpoint} disabled={busy} onChange={e => setEndpoint(e.target.value)} /></Field>
          <Field label="Demo access code" hint="Use your server access code here. Keep the OpenAI API key in Render settings."><input className={inputClass} type="password" autoComplete="off" value={token} disabled={busy} onChange={e => setToken(e.target.value)} /></Field>
        </div>
      </details>
      <Field label="Choose one photo"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { void pick(e.target.files?.[0]); }} /></Field>
      {image && <img src={image} alt="Selected photo for visual review" className="max-h-80 rounded-lg object-contain" />}
      <p className="text-sm text-slate-600">Pressing Send transmits this photo through the server above to OpenAI. Use public demonstration images or appropriately authorized images. The server does not save photos; provider data handling applies. No baseline is required.</p>
      <Button disabled={busy || !file || !endpoint || !token} onClick={() => { void send(); }}>{busy ? 'Reviewing photo…' : 'Send photo to OpenAI for review'}</Button>
      {error && <Callout tone="danger" title="No score produced">{error}</Callout>}
      {finding && <div className="space-y-3 border rounded-lg p-4">
        <p className="font-medium">{finding.summary}</p>
        <ul className="list-disc pl-5">{finding.observations.map((text, i) => <li key={i}>{text}</li>)}</ul>
        <p>Eyes: {finding.eyes} · Brow: {finding.brow} · Mouth: {finding.mouth}</p>
        <p className="text-xl font-semibold">{finding.facialTension === null ? 'Facial score withheld' : `Provisional facial tension: ${finding.facialTension}/5`}</p>
        <p>{finding.scoreRationale || finding.reason}</p>
        <p className="text-sm text-slate-600">{PHOTO_LIMITATION}</p>
        <p className="text-xs text-slate-500">Model: {result?.modelVersion} · Prompt: {result?.promptVersion}. Model output is separate from clinician scoring.</p>
        <Field label="Your separate facial item rating" hint="This review is not blinded because the model suggestion is visible. Do not use it as an independent accuracy reference."><select className={inputClass} value={result?.reviewerScore ?? ''} onChange={e => review(e.target.value ? Number(e.target.value) : null)}><option value="">Not reviewed</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}/5</option>)}</select></Field>
      </div>}
      {records.length > 0 && <div className="space-y-2">
        <Button variant="ghost" onClick={() => downloadText('tender-visual-research.csv', visualRecordsToCsv(records))}>Export {records.length} visual review record(s)</Button>
        <p className="text-sm text-slate-600">Includes image hash, observations, provisional item, model and prompt versions, raw response and failed reviews. These are model observations, not measured muscle activity. Session JSON also includes these records. Export before closing this tab.</p>
      </div>}
    </div>
  </Card>;
};
