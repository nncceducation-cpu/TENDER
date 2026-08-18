# Pathway conformance check

Source document: **Acute Post-Operative Pain Management and Opioid Weaning
Pathway, Alberta Children's Hospital NICU, 24 February 2025.**

Checked line by line against the code on 16 August 2026. This file records what
matched, what did not, and what the pathway does not say. It is the audit trail for
`PROTOCOL_VERSION` 2.4.0-draft.

---

## What already matched

Every one of these was in the code before the pathway document was supplied, and
every one is unchanged after the check.

| Pathway element | Where it lives |
| --- | --- |
| Eligibility and exclusions | `ELIGIBILITY` |
| Stop pre-operative dexmedetomidine | `POSTOP_DOSING.stopPreopDexmedetomidine` |
| Fentanyl 2 mcg/kg/hr infusion | `POSTOP_DOSING.fentanyl.infusionMcgPerKgPerHour` |
| Fentanyl 1 mcg/kg q3h PRN | `POSTOP_DOSING.fentanyl.bolusMcgPerKg`, `bolusInterval` |
| Acetaminophen IV q6h for 72 hours, by postmenstrual age | `POSTOP_DOSING.acetaminophen.ivByPma` |
| Acetaminophen PO or PR 10 to 15 mg/kg q6h for 48 hours | `oralMgPerKgRange`, `oralDurationHours` |
| N-PASS q3h for 48 hours, then q6h | `ASSESSMENT_SCHEDULE` |
| No weaning in the first 24 hours | `POSTOP_DOSING.noWeaningFirstHours` |
| Wean 25% q12h at 5 days exposure or less | `WEAN_RULES[0]` |
| Wean 20% q24h at 6 to 10 days | `WEAN_RULES[1]` |
| Wean 10% q24h at 11 days or more | `WEAN_RULES[2]` |
| WAT-1 q12h at 08:00 and 20:00, only beyond 5 days | `ASSESSMENT_SCHEDULE.wat1` |
| WAT-1 continues 72 hours after the opioid stops | `wat1.continueHoursAfterOpioidStopped` |
| Escalation bands 0-3, 4-6, 7-10 | `ESCALATION.npassChecklistThreshold`, `npassBolusThreshold` |
| WAT-1 bands 0-2, 3-5, 6-12 | `ESCALATION.wat1ChecklistThreshold`, `wat1BolusThreshold` |
| PRN indicated for N-PASS above 3 and/or WAT-1 above 2 | `decideEscalation` |

## First pass: what the pathway specifies and the code did not do

Three gaps. All three are now implemented, with tests.

### 1. The 24-hour mark is a gate, not a start signal

The pathway does not begin weaning at 24 hours. At 24 hours it asks a question with
two parts: is the N-PASS in the 0 to 3 band, and has the opioid been left alone for
24 hours. Fail either and the pathway loops back to three-hourly reassessment
rather than proceeding.

The code had both facts separately, as `noWeaningFirstHours` and a
`recentUptitration` flag, and combined them nowhere. An infant 30 hours
post-operatively scoring 6 was shown a weaning schedule the pathway does not
authorise.

Now `WEANING_READINESS` in `ach.ts` and `checkWeaningReadiness` in
`protocolEngine.ts`. The weaning screen leads with the gate, names which conditions
are satisfied and which are not, and marks the schedule below it as planning only
until the gate opens. Where a condition cannot be judged, because the hours since
return to the unit or the N-PASS score has not been entered, the gate says so
rather than assuming.

### 2. Elevated scores are counted, and the second one is the one that acts

The pathway carries the note "elevated scores q 30-60 min x 2" before the
pause-the-wean step. The reading that fits the flow is that one elevated score buys
a comfort checklist and a rescore at 30 to 60 minutes; two consecutive elevated
scores buy the PRN dose and the pause.

The previous implementation paused on the first score, which over-treats, and it
had no concept of a run at all.

Now `ESCALATION.consecutiveElevatedBeforePause`, `countConsecutiveElevated` and a
`consecutiveElevated` parameter on `decideEscalation`. The assessment screen derives
the run from the session's own N-PASS and WAT-1 history, so the nurse does not count
it by hand. Scores from other instruments do not break or extend the run.

### 3. "Original dose" needed defining where the number is entered

Reductions are a percentage of the rate on return from OR, not of the current
rate, which is why the infusion reaches zero in a fixed number of steps rather than
approaching it forever. The field was labelled "current infusion", which invites the
wrong number on day three of a taper. It is now labelled original, and
`ORIGINAL_DOSE_DEFINITION` is printed under it.

---

## Second pass, same document

The first pass looked for things the pathway specifies that the code did not do.
The second looked for the opposite: things the code does that the pathway does not
support. It found two, both of which made the application stricter than the
protocol.

### 4. The 10-day exposure limit is an entry criterion, not a running one

The eligibility box reads "neonates admitted to ACH NICU immediately post-operative
AND no paralysis AND 10 days opioid exposure or less AND no known hepatic
dysfunction". Every one of those is a question asked once, on arrival from theatre.

The code applied the 10-day limit to cumulative exposure, which is a different
quantity that grows every day the infant stays on the protocol. An infant who
entered eligible on day 8 was declared off-pathway on day 11, and the eligibility
banner told the clinician not to prescribe from the orders screen. That is not what
the document says, and it fires on exactly the infant who most needs the protocol
followed.

Exposure is now two fields. `opioidExposureDaysAtEntry` screens once and feeds
`checkEligibility`. `opioidExposureDays` is the running total and feeds the taper
rule and the WAT-1 trigger, which are the two places the pathway actually uses
cumulative exposure.

### 5. The 11-or-more-day taper is inside the pathway

The flowchart prints "11+ days: decrease opioid dose 10% of original dose q24h"
inside the standard weaning box, downstream of eligibility and alongside the 6 to
10 day rule. It is reachable by any infant who entered eligible and stayed on
opioid.

The code had it marked `withinStandardPathway: false`, on the reasoning that
eligibility capped exposure at 10 days so the branch was unreachable. That
reasoning was wrong, for the reason in finding 4, and the consequence was a
red "beyond the standard pathway, reference only" banner over a schedule the
pathway prints as standard. Now marked as within the pathway.

### 6. The middle band says CONSIDER, and now so does the app

After two elevated scores the middle band reads: CONSIDER pausing wean for 12h,
CONTINUE multisensorial checklist, CONSIDER PRN opioid. The upper band reads PAUSE
and GIVE. That verb is the entire clinical difference between the two bands.

The app had rendered the middle band as "give the PRN dose and pause the wean",
which is upper-band language. Both bands now also print the return cadence the
pathway specifies, N-PASS q3-6h with WAT-1 q12h if indicated.

### 7. The comfort checklist the pathway names but never enumerates

The escalation column instructs "COMPLETE multisensorial checklist" in the 4 to 6
band and again in the 7 to 10 band. The document never says what is on it.

The application repeated that instruction faithfully and also never said, which
turned the most evidence-backed step in the whole pathway into a prompt to do
something unspecified at the moment a nurse most needs to act. It is now a screen
with the interventions enumerated, each carrying the stage of the nociceptive
pathway it acts on and its reported magnitude, and completing it is recorded to the
session, the audit trail, the PDF report and the JSON export. The middle band's
instruction is "comfort measures first, then rescore", and a chart that cannot show
the first half cannot support the second.

Contents are from the unit's own teaching reference rather than invented. Where the
pathway is silent on which measures, that is the source used, and it is named.

---

## What the pathway does not say

Recorded here rather than guessed at in code.

**The bands do not accommodate the prematurity correction.** The printed N-PASS
bands are 0 to 3, 4 to 6 and 7 to 10, topping out at 10, which is exactly the
maximum of an *uncorrected* N-PASS pain score. With the gestational-age correction
of up to +3, the maximum is 13, and the pathway has no band for 11 to 13. Read
plainly, the document does not contemplate the correction at all.

TENDER applies the bands to the corrected score and treats anything above 10 as the
top band, because the alternative systematically under-escalates the most preterm
infants, who are the ones least able to mount a behavioural response. This is the
single most consequential interpretation in the application and it is a clinical
decision, not a coding one. It is carried as `REVIEW_FLAGS['npass-uncorrected']` and
needs an answer before any patient use.

**The pause duration in the middle band.** The pathway shows 12 to 24 hours at the
top band and is less explicit in the middle. TENDER uses 12 hours for a middle-band
pause and the full 12 to 24 hour range for the top band, as
`ESCALATION.pauseWeanHoursMidBand`.

**The acetaminophen course is five days total**, per the document's own footnote,
and that is encoded as `POSTOP_DOSING.acetaminophenTotalCourseDays`.

**The acetaminophen dose bands are not in the document.** The pathway prints IV 7.5
to 15 mg/kg/dose q6h, "dose based on postmenstrual age / CGA", and stops there. The
three breakpoints in use, 7.5 mg/kg under 32 weeks, 10 under 37, and 15 at 37 and
above, together with the daily maxima, were carried over from the PainWise NICU
source and have no support in this document. Carried as
`REVIEW_FLAGS['acetaminophen-pma-bands']`.

**The breakthrough dose conflict is unchanged by this document.** The pathway
specifies fentanyl 1 mcg/kg q3h PRN. The opioid converter derives a breakthrough
dose as 10% of the total daily dose, which is roughly five times larger. The pathway
does not address the converter, so the conflict stands as
`REVIEW_FLAGS['prn-dose-conflict']`.
