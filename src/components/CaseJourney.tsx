import { ArrowLeft, ArrowRight, Presentation } from 'lucide-react';
import { EMPTY_CONTEXT, useStore, type Screen } from '../state/store';

const STEPS: { screen: Screen; label: string; cue: string }[] = [
  { screen: 'context', label: 'Case', cue: 'Introduce the surgery, weight, maturity and opioid exposure. Check pathway eligibility.' },
  { screen: 'image', label: 'Observe', cue: 'Review the face and explain the provisional facial item. A photo does not complete a pain assessment.' },
  { screen: 'assess', label: 'Assess', cue: 'Record a complete instrument using the case observations. Show the score and escalation reasoning.' },
  { screen: 'comfort', label: 'Comfort', cue: 'Demonstrate first-line comfort measures and document what was provided.' },
  { screen: 'orders', label: 'Manage pain', cue: 'Review the weight-based protocol figures and monitoring schedule. These are research calculations for clinician review.' },
  { screen: 'wean', label: 'Wean', cue: 'Check readiness before discussing the taper. Review exposure, recent up-titration and WAT-1 monitoring.' },
  { screen: 'trend', label: 'Review', cue: 'Show the recorded assessments and export the session for QI or research.' },
];

export function CaseJourney({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const s = useStore();
  const index = STEPS.findIndex(step => step.screen === s.screen);
  const step = index >= 0 ? STEPS[index] : null;
  const pristine = JSON.stringify(s.ctx) === JSON.stringify(EMPTY_CONTEXT) && !s.surgeryType && !s.clinician && s.assessments.length === 0 && s.facialReadings.length === 0 && s.visualResearchRecords.length === 0 && s.comfortEvents.length === 0 && s.opioidExposureDays === 0 && s.opioidExposureDaysAtEntry === 0 && s.hoursSincePostOp === null && s.currentInfusionMcgPerKgPerHour === null && !s.recentUptitration && s.postmenstrualAgeWeeks === 0 && !s.calibration && !s.latestAiEvidence && s.rawFrames.length === 0;
  const loadExample = () => {
    if (!pristine) return;
    void s.audit.append('demonstration', 'demo.case.loaded', 'Fictional TEF repair case loaded for rehearsal. No real patient, assessment scores or administered orders.');
    useStore.setState({ ctx: { ...EMPTY_CONTEXT, localId: 'DEMO-FICTIONAL', gestationalAgeAtBirth: { weeks: 39, days: 0 }, postnatalAgeDays: 5, weightKg: 3.2, postOpDay: 2, ventilation: 'invasive_ventilation' }, surgeryType: 'tracheoesophageal fistula', postmenstrualAgeWeeks: 39.7, hoursSincePostOp: 48, opioidExposureDays: 2, opioidExposureDaysAtEntry: 0, construct: 'postoperative', selectedScale: 'N_PASS', screen: 'context' });
  };
  return <section aria-label="Guided post-surgical case" className="mb-5 rounded-2xl border border-teal-200 bg-white shadow-sm overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-gradient-to-r from-teal-950 to-slate-900 text-white">
      <div><p className="text-xs uppercase tracking-widest text-teal-200">TENDER · case journey</p><h2 className="text-lg font-semibold">From post-operative pain to opioid weaning</h2></div>
      <button onClick={onToggle} className="rounded-lg border border-white/40 px-4 py-2 font-semibold text-sm flex items-center gap-2"><Presentation size={18}/>{active ? 'Exit guided presentation' : 'Start guided presentation'}</button>
    </div>
    {active && <>
      <div className="px-4 pt-4 flex flex-wrap items-center gap-3"><button disabled={!pristine} onClick={loadExample} className="rounded-lg border border-teal-300 px-4 py-2 text-sm font-semibold text-teal-900 disabled:opacity-40">Load fictional surgical case</button><p className="text-xs text-slate-600">Optional rehearsal: term infant, 3.2 kg, TEF repair, 48 hours post-op. Available only in an empty session; no scores or orders are recorded.</p></div>
      <nav aria-label="Case journey steps" className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 p-3">
        {STEPS.map((item, i) => <button key={item.screen} onClick={() => s.setScreen(item.screen)} aria-current={s.screen === item.screen ? 'step' : undefined} className={`rounded-xl p-3 text-left border transition ${s.screen === item.screen ? 'bg-teal-700 text-white border-teal-700' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-teal-50'}`}><span className="block text-xs opacity-80">STEP {i + 1}</span><span className="font-semibold text-sm">{item.label}</span></button>)}
      </nav>
      <div className="px-4 pb-4 flex flex-wrap gap-2 text-sm text-slate-700" aria-label="Case summary">
        {[s.ctx.localId || 'Case not entered', s.surgeryType || 'Surgery not entered', s.ctx.weightKg === null ? 'Weight not entered' : `${s.ctx.weightKg} kg`, `${s.opioidExposureDays} days opioid exposure`, `${s.assessments.length} recorded assessments`].map((text, i) => <span key={i} className="rounded-full bg-slate-100 px-3 py-1">{text}</span>)}
      </div>
      <div className="border-t border-slate-200 bg-teal-50 p-4 flex flex-wrap items-center gap-3">
        <p className="flex-1 min-w-48 text-sm text-teal-950"><strong>{step ? `${index + 1} / ${STEPS.length} · ${step.label}. ` : 'Choose a step. '}</strong>{step?.cue || 'The numbered buttons open each part of the case directly.'}</p>
        <button disabled={index <= 0} onClick={() => s.setScreen(STEPS[index - 1].screen)} className="p-2 rounded-lg border border-teal-200 disabled:opacity-40" aria-label="Previous case step"><ArrowLeft size={20}/></button>
        <button disabled={index === STEPS.length - 1} onClick={() => s.setScreen(STEPS[index + 1].screen)} className="rounded-lg bg-teal-700 px-4 py-2 text-white font-semibold flex items-center gap-2 disabled:opacity-40">{index < 0 ? 'Begin case' : 'Next step'}<ArrowRight size={18}/></button>
      </div>
      <details className="px-4 py-3 border-t text-sm text-slate-600"><summary className="cursor-pointer font-semibold">Stage cue for 3efreet</summary><p className="mt-2">“Drive this post-surgical case in TENDER. Follow the numbered case journey, enter only the details and observations I provide, explain each score and protocol calculation, and stop for my review before any clinical decision. Finish with readiness, opioid taper and withdrawal monitoring.”</p><p className="mt-2">The journey provides navigation; your dot uses its existing browser controls. Moving to the next screen does not confirm completion or approve an order.</p></details>
    </>}
  </section>;
}
