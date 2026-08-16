# Safety and code audit: PainWise NICU v1

Reviewed 15 August 2026 against the source exported from Google AI Studio: `App.tsx`,
`constants.ts`, `types.ts`, `services/calculatorService.ts` and the five step
components. 1,659 lines.

This is not a critique of the clinical protocol. The protocol values in v1 are
carried into v2 unchanged. What follows are defects in how the software handles
those values, ranked by how directly they could reach a patient.

---

## High severity

### 1. Two parts of the tool disagree about the breakthrough dose by roughly fivefold

`StepPostOp.tsx` orders fentanyl **1 mcg/kg q3h PRN**. `calculateOpioidConversion`
derives a PRN dose as 10% of the total daily dose:

```ts
const prnRatio = 0.10;
const prnFent = equivFentMcg * prnRatio;
```

On the protocol's own starting infusion of 2 mcg/kg/hr, a 3 kg infant receives
144 mcg of fentanyl a day. Ten percent of that is **14.4 mcg**, against a protocol
bolus of **3 mcg**. A clinician moving between the Orders tab and the Converter tab
sees two numbers 4.8 times apart, with nothing in the interface indicating that
they are different rules rather than different situations.

*v2:* both figures are computed, the ratio is displayed, and the conflict is raised
as a warning on the converter screen. The tool does not choose; it refuses to hide
the disagreement. Covered by `opioid.test.ts`.

### 2. The gestational-age correction is missing from N-PASS, and the input field forbids it

`StepAssessment.tsx` caps N-PASS entry at 10:

```tsx
<input type="number" min="0" max="10" value={data.npassScore} ... />
```

N-PASS adds a prematurity correction to the pain score, using the same gestational
age bands as PIPP: +3 below 28 weeks, +2 from 28 to 31, +1 from 32 to 35, 0 at term.
The corrected range is 0 to 13, not 0 to 10.

Escalation in `assessPainScores` then compares the **uncorrected** number against
thresholds of 4 and 7. For an infant under 28 weeks, an observed raw score of 4 is a
corrected 7: the difference between "complete the checklist" and "give a rescue
dose". The systematic effect is to under-treat the most premature infants, which is
the population in whom repeated untreated pain matters most.

*v2:* the correction is applied in the scale definition, escalation reads the
corrected score, and the working is printed with every total.

### 3. Blank input and a genuinely comfortable infant produce the same recommendation

Every numeric read in `calculatorService.ts` follows this pattern:

```ts
const npass = parseInt(data.npassScore) || 0;
const exposureDays = parseInt(data.opioidExposureDays) || 0;
const weight = parseFloat(data.weight) || 0;
```

An empty field, a typo, and a true zero are indistinguishable. A blank N-PASS yields
"CONTINUE recommended weaning plan". A blank weight yields a fentanyl order of
0 mcg/hr and, in the converter, division by zero.

*v2:* `scoreAssessment` throws `IncompleteAssessmentError` naming every unscored
item, and dosing functions return a typed failure listing what is missing.

### 4. Division by zero reaches the dose display

```ts
const rateMs = totalIvmeMcg / 24 / weight;
```

With `weight` parsed to 0, this is `Infinity`, rendered into the UI beside the word
mcg/kg/hr. No guard exists anywhere in the conversion path.

*v2:* weight is validated as positive and within a neonatal range before any
arithmetic runs; a regression test asserts that no non-finite value can appear in
the result object.

### 5. The oral conversion has an unresolved unit ambiguity

The source comments argue with themselves and then guess:

```ts
// Note: Input PO doses assumed to be mg in UI? No, class usually takes Mcg.
// ... I will treat `currentPoMs` and `currentPoHm` as MCG in the calculation
const totalPoMsEquiv = poMsFromIv + (input.currentPoMs * 1000) + ...
```

The comment concludes mcg; the code multiplies by 1000, which only makes sense for
mg. Whichever the UI supplies, one of the two is wrong by a factor of a thousand,
in an oral opioid dose.

*v2:* every oral input carries an explicit unit selected by the user, conversion is
a single `toMcg` function, and the mg/mcg distinction is asserted in tests.

### 6. No dose ceilings

`fentanylInfusion = 2 * weight` has no upper bound. A weight typed as 35 instead of
3.5 produces an order for 70 mcg/hr with no warning.

*v2:* configurable ceilings that bind inside the accepted weight range, so they
catch a mistyped weight or an edited protocol constant rather than sitting
unreachable behind another check.

### 7. Hepatic dysfunction is collected and then ignored where it matters

`hasHepaticDysfunction` appears once, in `checkEligibility`, as an exclusion. It has
no effect on acetaminophen dosing, which is the drug it most directly affects, and
the app orders acetaminophen q6h for 72 hours regardless.

*v2:* raised as an open question for the protocol owner rather than silently
patched, because the right answer is a clinical decision. See
`REVIEW_FLAGS['hepatic-flag-unused-for-acetaminophen']`.

### 8. Identifiable health information written to shared-workstation storage

```ts
localStorage.setItem('painWiseData', JSON.stringify(patientData));
```

`patientData` includes `allergies`, `currentMedications` and `pastMedicalHistory`.
This is health information under Alberta's Health Information Act, written
unencrypted to a browser profile on what is in practice a shared NICU workstation,
under a fixed key, with no expiry and no clearing.

*v2:* no persistence at all. Session state is in memory and is lost on close;
what belongs in the chart is produced by an explicit export.

### 9. The eligibility gate does not gate anything

`handleCheck` advances only when eligible, but the stepper header in `App.tsx` lets
any step be clicked directly:

```tsx
<button key={step.id} onClick={() => setCurrentStep(step.id)}>
```

An infant excluded for paralysis or hepatic dysfunction can be given a full weaning
schedule and a set of orders without ever seeing the exclusion notice.

*v2:* navigation stays open, deliberately, but every downstream screen renders the
exclusion banner and marks its output as off-pathway.

---

## Medium severity

### 10. The slow-wean branch is unreachable

`calculateWeaningSchedule` handles 11 or more days of exposure, but
`checkEligibility` refuses any patient beyond 10 days. Through the guided flow the
branch can never display. It reads as guidance and behaves as dead code.

*v2:* retained and marked `withinStandardPathway: false`, shown explicitly as
off-pathway reference requiring pain service input.

### 11. Surgery classification by substring match

```ts
MINOR_SURGERIES.some(surgery => surgeryType.toLowerCase().includes(surgery))
```

Any label containing a minor-surgery substring downgrades the pathway. "Laparotomy
after failed minor exploratory" classifies as minor. Free text matching nothing
falls through to the standard protocol with no prompt.

*v2:* exact match against the curated list; unrecognised input returns
`unclassified` for the clinician to resolve. Covered by test.

### 12. Exposure days never advance

`opioidExposureDays` is typed once and never derived from a start date. An infant
entered on day 4 stays on the fast-wean rule indefinitely and never crosses the
5-day threshold that triggers WAT-1.

*v2:* raised as an open question; the field remains manual but the consequence is
documented in the review panel.

### 13. WAT-1 is a free number, not an instrument

```tsx
<input type="number" min="0" max="12" value={data.wat1Score} />
```

An 11-item observational tool with a defined sequence, a 2-minute pre-stimulus
observation, a 1-minute stimulus and a timed recovery is reduced to a remembered
integer. Inter-rater drift is unmanaged and unmeasurable.

*v2:* WAT-1 is a fully scored instrument with all 11 items in their observation
groups.

### 14. No audit trail, no scorer, no protocol version

Nothing records who scored, when, under which protocol version, or whether a
recommendation was followed. The version is a hard-coded string in JSX:

```tsx
<p className="text-slate-500">Updated Feb 2025</p>
```

*v2:* hash-chained audit log, clinician recorded against every assessment, protocol
version stamped into every score and every export.

### 15. Blocking `alert()` dialogs for save and load

Modal dialogs that must be dismissed before the interface responds are a poor fit
for a bedside tool that may be open during an unstable period.

*v2:* inline status and callouts.

---

## What v1 got right

Worth stating, because it shaped v2. The step decomposition matches how the
protocol is actually used. The separation of eligibility from orders from weaning
from assessment is the correct set of screens. The minor-surgery exception, the
24-hour no-weaning window and the WAT-1 trigger at 5 days are encoded faithfully.
The opioid converter covers the drugs and routes that a neonatal unit needs. v2
keeps all of that structure; what changed is that the arithmetic now refuses to
proceed on bad input, and the instruments are instruments rather than numbers.

---

## Verification

73 tests across four suites cover the scoring engine, the protocol engine, the
opioid converter and the facial-coding pipeline. Every defect above that was fixed
in code has a test asserting the fixed behaviour. Run `npm run verify`.
