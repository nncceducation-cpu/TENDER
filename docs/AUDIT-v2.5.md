# Review of TENDER 2.4.0-draft

Reviewed 4 October 2026 against the source as published. Five findings, all
confirmed by executing the engine functions rather than by reading alone. No
clinical value was changed: every fix either enforces something the protocol
data already declared, or states something the code already knew and discarded.

The tests grew from 159 to 185. The pre-existing 159 all still pass, with one
assertion replaced for a stated reason (§6).

---

## 1. Escalation discarded the withdrawal score whenever the pain score was missing

**Severity: high. This is the finding that matters.**

`decideEscalation` returned early when `correctedNpass` was null:

```ts
if (correctedNpass === null) {
  return { urgency: 'low', headline: 'No current pain score', actions: [...], drivers: [] };
}
```

That return sits above every WAT-1 test, so the withdrawal arm was never
evaluated. Measured on the real function:

| Input | Before | After |
|---|---|---|
| WAT-1 11/12, 9 days exposure, **no N-PASS** | `low` — "No current pain score", withdrawal not mentioned | `high` — "Rescue dose indicated" |
| WAT-1 11/12, 9 days exposure, **N-PASS 0** | `high` — "Rescue dose indicated" | `high` — unchanged |

So recording a *reassuring* pain score made the tool escalate, and recording
nothing made it advise continuing. The bolus threshold for WAT-1 is 6; an 11 is
severe iatrogenic withdrawal in an infant at nine days of exposure, which is
exactly the population the pathway's WAT-1 trigger exists for.

This is the same defect class as the one `AUDIT-deeprelief.md` §1 identifies as
"the most consequential defect in either codebase, because it fails in the
direction that withholds analgesia". It had been reintroduced on a different
axis: not a failure path rendering as comfort, but a missing input suppressing a
scored one.

**Fixed.** The two arms are evaluated independently and urgency is whichever is
higher. A missing N-PASS becomes a driver — "the pain side of this decision is
currently blind" — mirroring the note that already existed for a missing WAT-1.
The reassuring "Continue the current plan" headline is now reachable only when
everything applicable has been scored and is settled; otherwise the headline
names the outstanding assessment.

**Tested.** Nine tests, including the invariant that urgency is identical
whether the pain score is absent or zero, swept across every WAT-1 value from 0
to 12. An N-PASS of 0 contributes nothing, so replacing it with "not scored"
must not change what the withdrawal arm concludes.

## 2. A declared absolute exclusion could never fire

**Severity: high.**

`ELIGIBILITY.exclusions` declares two absolute exclusions from the standard
pathway: neuromuscular blockade and hepatic dysfunction. `checkEligibility`
tested only the first. It could not have tested the second: `PatientContext` had
no field for it, and `ConsciousnessModifier` is
`'none' | 'therapeutic_hypothermia' | 'neuromuscular_blockade' | 'encephalopathy' | 'deep_sedation'`
with no hepatic member. There was no way to express hepatic dysfunction
anywhere in the application, so every infant screened eligible on that
criterion.

`REVIEW_FLAGS['hepatic-flag-unused-for-acetaminophen']` stated that hepatic
dysfunction "is collected and used only to exclude the infant from the pathway".
Neither half was true. A reviewer working from that flag would have believed the
exclusion was at least being applied.

**Fixed.** `hepaticDysfunction` added to `PatientContext`, deliberately separate
from `modifiers` (those are consciousness states that blunt behavioural pain
expression; this is not one), collected on the context screen, and enforced in
`checkEligibility`. The review flag now states the actual situation.

**This changes behaviour**: an infant with the flag set is now off the standard
pathway, and the Orders screen shows its existing "Off the standard pathway"
callout. That is what the protocol data has always said should happen.

**Tested**, including an assertion that the set of enforced exclusion keys
equals the set `ELIGIBILITY` declares — so a future declared exclusion that is
never wired up fails rather than passing silently.

## 3. The dosing warnings channel was declared, never filled, and never rendered

**Severity: medium.**

`DosingResult` carries `warnings: string[]`. `calculateInitialDoses` never
pushed to it, and `OrdersWeanScreens` rendered `doses.errors` but not
`doses.warnings`, so anything warned about would have been computed and
discarded anyway. The converter screen does render its warnings; the orders
screen did not.

In the middle of the function sat an empty block:

```ts
if (ctx.modifiers.length > 0 && errors.length === 0) {
  // Nothing to add here; hepatic dysfunction is handled below via context.
}
```

Nothing below handled hepatic dysfunction, and no context field existed to
handle. The comment asserted a safety behaviour that did not exist.

**Fixed.** Empty block removed. When hepatic dysfunction is recorded the engine
warns that the acetaminophen figures are the unmodified protocol doses, that the
pathway specifies no reduction and the tool does not invent one, and that
acetaminophen is the drug hepatic dysfunction most directly affects. The orders
screen renders warnings. Tests assert the dose figures are identical with and
without the flag: the gap is reported, not papered over with a fabricated
reduction.

## 4. The oral arm silently skipped the cross-tolerance choice

**Severity: medium.**

The IV rotation returns `unreduced` and `reduced` targets and declines to pick
between them, which is the right design. The oral schedules were derived from
the unreduced total only, and the converter screen displayed just that one
figure. A rotation to oral morphine therefore received no incomplete
cross-tolerance reduction while the equivalent IV rotation offered one, for no
stated reason.

**Fixed.** `oral.reduced` added alongside the existing unreduced schedules, so
no current caller changes meaning, and surfaced in the converter screen next to
the straight figures. The reduction is applied to the dose being rotated off IV
only and not to an oral dose the infant is already taking and tolerant to; that
choice is stated in the returned assumptions rather than left implicit.

## 5. Breakthrough disagreement was flagged in one direction only

**Severity: medium.**

`conflictsWithProtocolBolus` was raised when the derived dose exceeded the
protocol bolus by more than half. A derived dose far *below* the protocol bolus
is equally two rules disagreeing in front of the same clinician, and
under-dosing breakthrough analgesia is not the safe direction. Now flagged
whenever the ratio falls outside 0.67 to 1.5, naming the direction.

## 6. Smaller items

- **`countConsecutiveElevated` counts runs that mix instruments.** An elevated
  N-PASS followed by an elevated WAT-1 counts as two. Measured, the count is
  *not* reached sooner than for a same-instrument run — both a mixed pair and
  two N-PASS readings return 2 — so there is no asymmetry in the number. What
  differs is what the number means: the two instruments measure different
  things, so a mixed pair reaches the pause step without either pain or
  withdrawal having been elevated twice in a row. Pausing the wean
  is the conservative direction, so the behaviour was **not** changed; it is
  documented in the function, pinned by a test, and raised as
  `REVIEW_FLAGS['consecutive-elevated-mixed-instruments']` for the protocol
  owner. This is a question about what the pathway's "elevated scores
  q 30-60 min x 2" note counts, not a defect for code to settle.
- **`classifySurgery`'s comment contradicted its code**, claiming unrecognised
  text returns `unclassified` "for the clinician to resolve". It returns
  `major`, which applies the full protocol and is the conservative default;
  only an empty entry returns `unclassified`. Comment corrected, behaviour
  unchanged, and the open question already sits in
  `REVIEW_FLAGS['minor-surgery-substring-match']`.
- **Non-finite guards.** `decideEscalation` now tolerates a non-finite exposure
  figure without inventing a withdrawal verdict.
- **Pull requests ran no checks.** `deploy.yml` runs typecheck, lint and test,
  but only on push to `main`, so a pull request reached review unchecked and a
  regression surfaced at deploy time. `ci.yml` added, running the same gate plus
  the production build on every branch and pull request.
- **One assertion replaced.** A transparency test pinned `assumptions` to
  exactly four entries. That fails whenever any unrelated assumption is added
  and says nothing about transparency, so it now asserts each of the four ratios
  is disclosed by content.
- **README said 73 tests.** It is 185.

---

## What this review did not do

No clinical value was changed: no threshold, ratio, dose, band breakpoint or
taper percentage. Every open question in `REVIEW_FLAGS` remains open, including
the two the README flags as concerning opioid dosing, and one was added.

Nothing here was validated against a patient, and the facial coding layer was
not reviewed at all beyond confirming its tests still pass. The standing
position in `README.md` under Status and safety is unchanged: this is
pre-clinical software that has not been validated at any site or reviewed by a
research ethics board or a regulator.

The production build and the React screens were not executed during this review.
The sandbox it was performed in deadlocks on the child processes Vite requires,
so `vitest` and `vite build` could not run; the 185 tests were executed by
transpiling the TypeScript in-process and running the suites under plain Node,
and the UI changes are covered by `tsc` and review only. Run `npm run verify`
locally before merging.
