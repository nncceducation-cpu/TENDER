import { Baby, ShieldAlert } from 'lucide-react';
import { useStore } from '../state/store';
import { Button, Callout, Card, Field, inputClass } from './ui';
import { checkEligibility, classifySurgery } from '../engine/protocolEngine';
import { MAJOR_SURGERIES, MINOR_SURGERIES } from '../data/protocol/ach';
import type { ConsciousnessModifier, VentilationStatus } from '../domain/types';

const MODIFIERS: { id: ConsciousnessModifier; label: string; note: string }[] = [
  {
    id: 'neuromuscular_blockade',
    label: 'Neuromuscular blockade',
    note: 'Behavioural scales become uninterpretable.',
  },
  {
    id: 'therapeutic_hypothermia',
    label: 'Therapeutic hypothermia',
    note: 'Cooling suppresses behavioural expression.',
  },
  { id: 'encephalopathy', label: 'Encephalopathy', note: 'Reduced behavioural repertoire.' },
  { id: 'deep_sedation', label: 'Deep sedation', note: 'Sedation depresses pain expression.' },
];

const VENTILATION: { id: VentilationStatus; label: string }[] = [
  { id: 'spontaneous', label: 'Spontaneous, room air' },
  { id: 'nasal_cannula', label: 'Nasal cannula' },
  { id: 'nippv_cpap', label: 'CPAP or NIPPV' },
  { id: 'invasive_ventilation', label: 'Invasive ventilation' },
  { id: 'hfov', label: 'High-frequency oscillation' },
];

export const ContextScreen = () => {
  const s = useStore();
  const eligibility = checkEligibility(s.ctx, s.opioidExposureDaysAtEntry);
  const surgeryClass = classifySurgery(s.surgeryType);

  return (
    <div className="space-y-5">
      <Card title="Infant context" icon={<Baby className="w-5 h-5 text-sky-700" />}>
        <div className="space-y-5">
          <Callout tone="info" title="No identifiers">
            Use a bed number or study code. This tool does not ask for a name, a medical record number
            or a date of birth, and nothing entered here is written to disk.
          </Callout>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Local identifier" hint="Bed or study code, not an MRN">
              <input
                className={inputClass}
                value={s.ctx.localId}
                onChange={(e) => s.patchContext({ localId: e.target.value })}
                placeholder="e.g. NICU-14"
              />
            </Field>

            <Field label="Gestational age at birth">
              <div className="flex gap-2">
                <input
                  type="number"
                  min={20}
                  max={44}
                  className={inputClass}
                  value={s.ctx.gestationalAgeAtBirth.weeks || ''}
                  onChange={(e) =>
                    s.patchContext({
                      gestationalAgeAtBirth: {
                        ...s.ctx.gestationalAgeAtBirth,
                        weeks: Number(e.target.value),
                      },
                    })
                  }
                  placeholder="weeks"
                />
                <input
                  type="number"
                  min={0}
                  max={6}
                  className={inputClass}
                  value={s.ctx.gestationalAgeAtBirth.days || ''}
                  onChange={(e) =>
                    s.patchContext({
                      gestationalAgeAtBirth: {
                        ...s.ctx.gestationalAgeAtBirth,
                        days: Number(e.target.value),
                      },
                    })
                  }
                  placeholder="days"
                />
              </div>
            </Field>

            <Field label="Postmenstrual age (weeks)" hint="Drives acetaminophen dosing">
              <input
                type="number"
                className={inputClass}
                value={s.postmenstrualAgeWeeks || ''}
                onChange={(e) => s.setField('postmenstrualAgeWeeks', Number(e.target.value))}
              />
            </Field>

            <Field label="Weight (kg)">
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={s.ctx.weightKg ?? ''}
                onChange={(e) =>
                  s.patchContext({ weightKg: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </Field>

            <Field label="Respiratory support" hint="Changes which COMFORTneo item applies">
              <select
                className={inputClass}
                value={s.ctx.ventilation}
                onChange={(e) => s.patchContext({ ventilation: e.target.value as VentilationStatus })}
              >
                {VENTILATION.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Total opioid exposure to date (days)"
              hint="Selects the taper rule and triggers WAT-1 beyond 5 days"
            >
              <input
                type="number"
                min={0}
                className={inputClass}
                value={s.opioidExposureDays || ''}
                onChange={(e) => s.setField('opioidExposureDays', Number(e.target.value))}
              />
            </Field>

            <Field
              label="Opioid exposure on arrival from OR (days)"
              hint="Eligibility screening only. Asked once, and not the running total"
            >
              <input
                type="number"
                min={0}
                className={inputClass}
                value={s.opioidExposureDaysAtEntry || ''}
                onChange={(e) => s.setField('opioidExposureDaysAtEntry', Number(e.target.value))}
              />
            </Field>

            <Field label="Surgery">
              <select
                className={inputClass}
                value={s.surgeryType}
                onChange={(e) => s.setField('surgeryType', e.target.value)}
              >
                <option value="">Not applicable</option>
                <optgroup label="Minor">
                  {MINOR_SURGERIES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Major">
                  {MAJOR_SURGERIES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </Field>

            <Field label="Post-operative day">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={s.ctx.postOpDay ?? ''}
                onChange={(e) =>
                  s.patchContext({ postOpDay: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </Field>

            <Field label="Assessing clinician" hint="Recorded against every score in the audit trail">
              <input
                className={inputClass}
                value={s.clinician}
                onChange={(e) => s.setClinician(e.target.value)}
                placeholder="Initials or staff code"
              />
            </Field>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">States that suppress behaviour</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {MODIFIERS.map((m) => {
                const on = s.ctx.modifiers.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex gap-3 items-start p-3 rounded-lg border cursor-pointer transition ${
                      on ? 'border-amber-300 bg-amber-50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={on}
                      onChange={(e) =>
                        s.patchContext({
                          modifiers: e.target.checked
                            ? [...s.ctx.modifiers, m.id]
                            : s.ctx.modifiers.filter((x) => x !== m.id),
                        })
                      }
                    />
                    <span className="text-sm">
                      <span className="font-medium text-slate-800">{m.label}</span>
                      <span className="block text-xs text-slate-600">{m.note}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={s.recentUptitration}
              onChange={(e) => s.setField('recentUptitration', e.target.checked)}
            />
            Opioid up-titration in the last 24 hours
          </label>
        </div>
      </Card>

      {surgeryClass === 'minor' && (
        <Callout tone="ok" title="Minor surgery">
          Strict adherence to the full weaning protocol is not required. Fentanyl may be stopped
          immediately post-operatively based on comfort scoring and clinical judgement.
        </Callout>
      )}

      {!eligibility.eligible && (
        <Callout tone="danger" title="Off the standard pathway">
          <ul className="space-y-2">
            {eligibility.exclusions.map((x) => (
              <li key={x.key}>
                <span className="font-semibold">{x.label}.</span> {x.reason}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            The weaning and orders screens stay available for reference, but they are marked as
            off-pathway and require pain service or attending input.
          </p>
        </Callout>
      )}

      {eligibility.notes.map((n) => (
        <Callout key={n} tone="warn">
          {n}
        </Callout>
      ))}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => s.reset()}>
          Clear session
        </Button>
        <Button onClick={() => s.setScreen('assess')} disabled={!s.ctx.gestationalAgeAtBirth.weeks}>
          <ShieldAlert className="w-4 h-4" /> Continue to assessment
        </Button>
      </div>
    </div>
  );
};
