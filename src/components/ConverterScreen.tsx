import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useStore } from '../state/store';
import { Callout, Card, Field, Stat, inputClass } from './ui';
import { convertOpioids, type ConversionInput, type Unit } from '../engine/opioid';

const num = (v: string): number | undefined => (v === '' ? undefined : Number(v));

export const ConverterScreen = () => {
  const weightKg = useStore((s) => s.ctx.weightKg);
  const [form, setForm] = useState({
    morphineInfusion: '',
    morphineBolus: '',
    morphineBolusFreq: '',
    fentanylInfusion: '',
    fentanylBolus: '',
    fentanylBolusFreq: '',
    hydromorphoneInfusion: '',
    hydromorphoneBolus: '',
    hydromorphoneBolusFreq: '',
    oralMorphine: '',
    oralMorphineUnit: 'mg' as Unit,
    oralHydromorphone: '',
    oralHydromorphoneUnit: 'mg' as Unit,
  });

  const input: ConversionInput = {
    weightKg: weightKg ?? Number.NaN,
    ivMorphine: {
      infusionPerKgPerHour: num(form.morphineInfusion),
      bolusPerKg: num(form.morphineBolus),
      bolusesPerDay: num(form.morphineBolusFreq),
      unit: 'mcg',
    },
    ivFentanyl: {
      infusionPerKgPerHour: num(form.fentanylInfusion),
      bolusPerKg: num(form.fentanylBolus),
      bolusesPerDay: num(form.fentanylBolusFreq),
      unit: 'mcg',
    },
    ivHydromorphone: {
      infusionPerKgPerHour: num(form.hydromorphoneInfusion),
      bolusPerKg: num(form.hydromorphoneBolus),
      bolusesPerDay: num(form.hydromorphoneBolusFreq),
      unit: 'mcg',
    },
    oralMorphineDaily:
      form.oralMorphine === ''
        ? undefined
        : { amount: Number(form.oralMorphine), unit: form.oralMorphineUnit },
    oralHydromorphoneDaily:
      form.oralHydromorphone === ''
        ? undefined
        : { amount: Number(form.oralHydromorphone), unit: form.oralHydromorphoneUnit },
  };

  const result = convertOpioids(input);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  const DrugRow = ({
    name,
    infusionKey,
    bolusKey,
    freqKey,
  }: {
    name: string;
    infusionKey: keyof typeof form;
    bolusKey: keyof typeof form;
    freqKey: keyof typeof form;
  }) => (
    <div className="grid sm:grid-cols-4 gap-3 items-end border-b border-slate-100 pb-4">
      <p className="text-sm font-semibold text-slate-700 sm:pb-2">{name}</p>
      <Field label="Infusion (mcg/kg/hr)">
        <input type="number" step="0.01" min="0" className={inputClass} value={form[infusionKey] as string} onChange={set(infusionKey)} />
      </Field>
      <Field label="Bolus (mcg/kg)">
        <input type="number" step="0.01" min="0" className={inputClass} value={form[bolusKey] as string} onChange={set(bolusKey)} />
      </Field>
      <Field label="Boluses per day">
        <input type="number" step="1" min="0" className={inputClass} value={form[freqKey] as string} onChange={set(freqKey)} />
      </Field>
    </div>
  );

  return (
    <div className="space-y-5">
      <Card title="Opioid conversion" icon={<ArrowLeftRight className="w-5 h-5 text-sky-700" />}>
        <div className="space-y-4">
          <Callout tone="warn" title="This screen calculates, it does not prescribe">
            Equianalgesic tables are approximations derived largely from adult data. Confirm every
            figure against your unit's own reference before it reaches an order.
          </Callout>

          {weightKg === null && (
            <Callout tone="danger">Enter a weight on the context screen before converting.</Callout>
          )}

          <DrugRow name="IV morphine" infusionKey="morphineInfusion" bolusKey="morphineBolus" freqKey="morphineBolusFreq" />
          <DrugRow name="IV fentanyl" infusionKey="fentanylInfusion" bolusKey="fentanylBolus" freqKey="fentanylBolusFreq" />
          <DrugRow name="IV hydromorphone" infusionKey="hydromorphoneInfusion" bolusKey="hydromorphoneBolus" freqKey="hydromorphoneBolusFreq" />

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Existing oral morphine, total per day" hint="Choose the unit deliberately">
              <div className="flex gap-2">
                <input type="number" step="0.01" min="0" className={inputClass} value={form.oralMorphine} onChange={set('oralMorphine')} />
                <select
                  className={inputClass}
                  value={form.oralMorphineUnit}
                  onChange={(e) => setForm({ ...form, oralMorphineUnit: e.target.value as Unit })}
                >
                  <option value="mg">mg</option>
                  <option value="mcg">mcg</option>
                </select>
              </div>
            </Field>
            <Field label="Existing oral hydromorphone, total per day">
              <div className="flex gap-2">
                <input type="number" step="0.01" min="0" className={inputClass} value={form.oralHydromorphone} onChange={set('oralHydromorphone')} />
                <select
                  className={inputClass}
                  value={form.oralHydromorphoneUnit}
                  onChange={(e) => setForm({ ...form, oralHydromorphoneUnit: e.target.value as Unit })}
                >
                  <option value="mg">mg</option>
                  <option value="mcg">mcg</option>
                </select>
              </div>
            </Field>
          </div>
        </div>
      </Card>

      {!result.ok ? (
        <Callout tone="danger" title="Cannot convert">
          <ul className="list-disc list-inside space-y-1">
            {result.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Callout>
      ) : (
        <>
          {result.warnings.map((w) => (
            <Callout key={w} tone="warn">
              {w}
            </Callout>
          ))}

          <Card title="Total daily dose, as IV morphine equivalent">
            <div className="grid sm:grid-cols-3 gap-3">
              <Stat
                label="IV morphine equivalent"
                value={(result.totalIvMorphineEquivalentMcg / 1000).toFixed(3)}
                unit="mg/day"
              />
              {result.contributions.map((c) => (
                <Stat
                  key={c.drug}
                  label={c.drug}
                  value={`${(c.share * 100).toFixed(0)}%`}
                  unit={`${(c.ivMorphineEquivalentMcg / 1000).toFixed(3)} mg`}
                />
              ))}
            </div>
          </Card>

          <Card title="Rotation targets">
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Two columns, deliberately. The left is the straight equianalgesic conversion. The
                right applies a {result.rotation.reductionPercent}% reduction for incomplete
                cross-tolerance, which is standard practice on rotation. This tool will not choose
                between them for you.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                    <th className="py-2">Target</th>
                    <th className="py-2 text-right">Straight conversion</th>
                    <th className="py-2 text-right">
                      Reduced by {result.rotation.reductionPercent}%
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {(
                    [
                      ['Morphine (mcg/kg/hr)', 'morphineMcgPerKgPerHour'],
                      ['Fentanyl (mcg/kg/hr)', 'fentanylMcgPerKgPerHour'],
                      ['Hydromorphone (mcg/kg/hr)', 'hydromorphoneMcgPerKgPerHour'],
                    ] as const
                  ).map(([label, key]) => (
                    <tr key={key} className="border-b border-slate-100">
                      <td className="py-2 text-slate-700">{label}</td>
                      <td className="py-2 text-right">{result.rotation.unreduced[key].toFixed(3)}</td>
                      <td className="py-2 text-right font-medium">
                        {result.rotation.reduced[key].toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Oral conversion and methadone">
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Oral morphine</p>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Per day" value={result.oral.morphine.dailyMg.toFixed(3)} unit="mg" />
                  <Stat label="q6h" value={(result.oral.morphine.q6hDoseMcg / 1000).toFixed(3)} unit="mg" />
                  <Stat label="q4h" value={(result.oral.morphine.q4hDoseMcg / 1000).toFixed(3)} unit="mg" />
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Oral hydromorphone</p>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Per day" value={result.oral.hydromorphone.dailyMg.toFixed(3)} unit="mg" />
                  <Stat label="q6h" value={(result.oral.hydromorphone.q6hDoseMcg / 1000).toFixed(3)} unit="mg" />
                  <Stat label="q4h" value={(result.oral.hydromorphone.q4hDoseMcg / 1000).toFixed(3)} unit="mg" />
                </div>
              </div>
            </div>
            <div className="mt-4">
              <Stat
                label={`Methadone, initial dose ${result.methadone.frequency}`}
                value={result.methadone.initialDoseMg.toFixed(3)}
                unit="mg"
              />
            </div>
          </Card>

          <Card title="Breakthrough dosing">
            <div className="grid sm:grid-cols-3 gap-3">
              <Stat label="Morphine" value={result.breakthrough.morphineMcg.toFixed(1)} unit="mcg" />
              <Stat label="Fentanyl" value={result.breakthrough.fentanylMcg.toFixed(1)} unit="mcg" />
              <Stat
                label="Hydromorphone"
                value={result.breakthrough.hydromorphoneMcg.toFixed(1)}
                unit="mcg"
              />
            </div>
            <p className="mt-3 text-xs text-slate-600">
              Calculated as {(result.breakthrough.fractionOfDailyDose * 100).toFixed(0)}% of the total
              daily dose.
            </p>
          </Card>

          <Card title="Ratios used">
            <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
              {result.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
};
