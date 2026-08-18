import { Clock, Pill } from 'lucide-react';
import { useStore } from '../state/store';
import { Callout, Card, Field, Stat, inputClass } from './ui';
import {
  calculateInitialDoses,
  checkEligibility,
  checkWeaningReadiness,
  classifySurgery,
  planWeaning,
} from '../engine/protocolEngine';
import {
  ASSESSMENT_SCHEDULE,
  ORIGINAL_DOSE_DEFINITION,
  POSTOP_DOSING,
  WEANING_READINESS,
} from '../data/protocol/ach';

export const OrdersScreen = () => {
  const s = useStore();
  const doses = calculateInitialDoses(s.ctx.weightKg ?? Number.NaN, s.postmenstrualAgeWeeks, s.ctx);
  const surgeryClass = classifySurgery(s.surgeryType);
  const eligibility = checkEligibility(s.ctx, s.opioidExposureDaysAtEntry);

  return (
    <div className="space-y-5">
      {!eligibility.eligible && (
        <Callout tone="danger" title="Off the standard pathway">
          These figures are the protocol defaults and do not account for{' '}
          {eligibility.exclusions.map((e) => e.label.toLowerCase()).join(' or ')}. Do not prescribe
          from this screen without individualised review.
        </Callout>
      )}

      {surgeryClass === 'unclassified' && s.surgeryType === '' && (
        <Callout tone="info">
          No surgery selected. These orders assume a post-operative indication.
        </Callout>
      )}

      <Card title="Post-operative orders" icon={<Pill className="w-5 h-5 text-sky-700" />}>
        {!doses.ok ? (
          <Callout tone="danger" title="Cannot calculate">
            <ul className="list-disc list-inside space-y-1">
              {doses.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Callout>
        ) : (
          <div className="space-y-5">
            {surgeryClass === 'minor' ? (
              <Callout tone="ok" title="Minor surgery">
                Consider stopping fentanyl immediately post-operatively based on comfort scoring. The
                acetaminophen course below still applies.
              </Callout>
            ) : (
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Fentanyl</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Stat
                    label={`Infusion (${POSTOP_DOSING.fentanyl.infusionMcgPerKgPerHour} mcg/kg/hr)`}
                    value={doses.fentanyl!.infusionMcgPerHour.toFixed(2)}
                    unit="mcg/hr"
                  />
                  <Stat
                    label={`Bolus (${POSTOP_DOSING.fentanyl.bolusMcgPerKg} mcg/kg, ${doses.fentanyl!.bolusInterval})`}
                    value={doses.fentanyl!.bolusMcg.toFixed(2)}
                    unit="mcg"
                  />
                </div>
                {POSTOP_DOSING.stopPreopDexmedetomidine && (
                  <p className="mt-2 text-sm text-slate-600">
                    Stop dexmedetomidine if it was started pre-operatively.
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-600">
                  Opioids reduce PIPP and NIPS modestly and give no benefit beyond the
                  procedure itself. Watch for apnoea, respiratory depression, hypotension
                  and chest wall rigidity with fentanyl.
                </p>
              </div>
            )}

            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Acetaminophen</p>
              <div className="grid sm:grid-cols-3 gap-3">
                <Stat
                  label={`IV, ${doses.acetaminophen!.ivMgPerKg} mg/kg ${doses.acetaminophen!.ivInterval}`}
                  value={doses.acetaminophen!.ivMgPerDose.toFixed(1)}
                  unit="mg"
                />
                <Stat
                  label="Maximum in 24 hours"
                  value={doses.acetaminophen!.maxDailyMg.toFixed(1)}
                  unit="mg"
                />
                <Stat
                  label={`Oral or rectal, ${doses.acetaminophen!.oralInterval}`}
                  value={`${doses.acetaminophen!.oralMgPerDoseLow.toFixed(1)}-${doses.acetaminophen!.oralMgPerDoseHigh.toFixed(1)}`}
                  unit="mg"
                />
              </div>
              <p className="mt-2 text-xs text-slate-600">
                IV for {doses.acetaminophen!.ivDurationHours} hours, then oral or rectal for{' '}
                {doses.acetaminophen!.oralDurationHours} hours, a{' '}
                {POSTOP_DOSING.acetaminophenTotalCourseDays}-day scheduled course. The daily
                maximum is shown because the protocol specifies a per-dose amount only.
              </p>
              {/*
                Where the pathway uses acetaminophen is exactly where the evidence
                supports it, and nowhere else. Worth saying on the screen that
                prints the dose, because the same drug on the same shelf is the
                wrong answer for a heel lance.
              */}
              <Callout tone="info" title="Post-operative only">
                Acetaminophen has no procedural benefit and is inferior to glucose or
                sucrose for procedures, where it may worsen the later response. Its role
                here is opioid-sparing after surgery, which is how this pathway uses it.
                For a heel lance or venepuncture, use the comfort checklist.
              </Callout>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Assessment schedule</p>
              <ul className="text-sm text-slate-700 list-disc list-inside space-y-1">
                <li>
                  N-PASS every {ASSESSMENT_SCHEDULE.intensiveIntervalHours} hours for{' '}
                  {ASSESSMENT_SCHEDULE.intensiveDurationHours} hours, then every{' '}
                  {ASSESSMENT_SCHEDULE.maintenanceIntervalHours} hours.
                </li>
                <li>No opioid weaning for the first {POSTOP_DOSING.noWeaningFirstHours} hours.</li>
                {s.opioidExposureDays > ASSESSMENT_SCHEDULE.wat1.triggerExposureDays && (
                  <li>
                    WAT-1 every {ASSESSMENT_SCHEDULE.wat1.intervalHours} hours at{' '}
                    {ASSESSMENT_SCHEDULE.wat1.clockTimes.join(' and ')}.
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export const WeanScreen = () => {
  const s = useStore();
  const plan = planWeaning(s.opioidExposureDays, s.currentInfusionMcgPerKgPerHour);
  const latestNpass = [...s.assessments].reverse().find((a) => a.scaleId === 'N_PASS');
  const readiness = checkWeaningReadiness({
    hoursSincePostOp: s.hoursSincePostOp,
    correctedNpass: latestNpass?.total ?? null,
    recentUptitration: s.recentUptitration,
  });

  return (
    <div className="space-y-5">
      <Card title="May weaning start?" icon={<Clock className="w-5 h-5 text-sky-700" />}>
        <div className="space-y-4">
          <Field
            label="Hours since return to the unit"
            hint={`The pathway holds the rate for the first ${WEANING_READINESS.earliestHoursPostOp} hours`}
          >
            <input
              type="number"
              step="1"
              min="0"
              className={inputClass}
              value={s.hoursSincePostOp ?? ''}
              onChange={(e) =>
                s.setField('hoursSincePostOp', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </Field>

          <Callout
            tone={readiness.ready ? 'ok' : readiness.recheckInHours === null ? 'info' : 'warn'}
            title={readiness.headline}
          >
            {readiness.blockers.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide">
                  What is stopping it
                </p>
                <ul className="mt-1 list-disc list-inside space-y-1">
                  {readiness.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </>
            )}
            {readiness.satisfied.length > 0 && (
              <>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {readiness.ready ? 'Conditions met' : 'Already satisfied'}
                </p>
                <ul className="mt-1 list-disc list-inside space-y-1 text-slate-600">
                  {readiness.satisfied.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </>
            )}
          </Callout>
        </div>
      </Card>

      <Card title="Opioid weaning" icon={<Clock className="w-5 h-5 text-sky-700" />}>
        <div className="space-y-5">
          <Field
            label="Original fentanyl infusion (mcg/kg/hr)"
            hint={ORIGINAL_DOSE_DEFINITION}
          >
            <input
              type="number"
              step="0.1"
              min="0"
              className={inputClass}
              value={s.currentInfusionMcgPerKgPerHour ?? ''}
              onChange={(e) =>
                s.setField(
                  'currentInfusionMcgPerKgPerHour',
                  e.target.value === '' ? null : Number(e.target.value),
                )
              }
            />
          </Field>

          {!readiness.ready && (
            <Callout tone="warn" title="Schedule shown for planning only">
              The readiness gate above is not satisfied, so no step should be taken today. The
              schedule below is what will apply once it is.
            </Callout>
          )}

          {plan.offPathway && (
            <Callout tone="danger" title="Beyond the standard pathway">
              Exposure of {s.opioidExposureDays} days exceeds what this protocol covers. The schedule
              below is reference only.
            </Callout>
          )}

          <div className="grid sm:grid-cols-4 gap-3">
            <Stat label="Rule" value={plan.rule.reductionPercent} unit="%" />
            <Stat label="Interval" value={plan.rule.frequencyLabel} />
            <Stat
              label="Reduce by"
              value={plan.reductionPerStep === null ? '-' : plan.reductionPerStep.toFixed(2)}
              unit="mcg/kg/hr"
            />
            <Stat label="Steps to zero" value={plan.stepsToZero ?? '-'} />
          </div>

          <p className="text-sm text-slate-700">{plan.rule.label}</p>

          <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
            {plan.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>

          {/*
            The reason to get the taper right is not tidiness. Long or high
            cumulative exposure is where the outcome signal stops sitting near the
            null, so the number on this screen is the one that matters.
          */}
          {s.opioidExposureDays > 7 && (
            <Callout tone="warn" title={`Cumulative exposure is ${s.opioidExposureDays} days`}>
              Short courses of 7 days or less show no clear neurodevelopmental
              impairment, at very low certainty. Prolonged or high cumulative exposure is
              associated with lower motor scores and possible cognitive and language
              deficits, confounded by illness severity and ventilation, and high
              cumulative fentanyl with reduced cerebellar growth in observational work.
              Neither finding argues for under-treating pain; both argue for finishing
              the taper rather than drifting on it.
            </Callout>
          )}

          {plan.wat1Required ? (
            <Callout tone="warn" title="WAT-1 required">
              {plan.wat1Schedule}. Score it on the assessment screen as a full instrument, not as a
              remembered number.
            </Callout>
          ) : (
            <Callout tone="ok" title="WAT-1 not indicated">
              Exposure is at or below {ASSESSMENT_SCHEDULE.wat1.triggerExposureDays} days. Start WAT-1
              if exposure extends.
            </Callout>
          )}

          {s.recentUptitration && (
            <Callout tone="warn">
              An up-titration was recorded in the last 24 hours. Hold today's taper step.
            </Callout>
          )}
        </div>
      </Card>
    </div>
  );
};
