# Review of the on-device AI layer

Reviewed 4 October 2026, against `src/ai/*` and the capture screens that consume
it, at protocol version 2.5.0-draft. Nine findings, every one produced by
executing the real function on synthetic MediaPipe-shaped inputs rather than by
reading code. Seven were fixed, two were recorded for the protocol owner.

**No clinical threshold, dose, band breakpoint or scoring constant changed.**
Every fix either corrects arithmetic, makes an abstention happen where the
module already said it should, or corrects a claim the code did not honour.

Tests grew from 185 to 257. `tsc` clean, `oxlint` unchanged.

This review did not touch scoring accuracy and could not: there are no labelled
images or recordings in the repository, so nothing here was validated against a
patient. What it establishes is that the layer fails in the stated direction
when its inputs are poor, which is a different and weaker claim than accuracy.

---

## 1. A window the camera never saw read the same as a calm infant

**Severity: high. This is the finding that matters.**

`TransparentIndex.infer` tested only whether `input.facial` was present. A
window in which the face was never usable arrives as a real summary object with
`secondsUsable: 0`, so the facial arm contributed its full weight 0.5 at value 0
and recorded no abstention, because the object was truthy.

| Window | secondsUsable | index value | confidence | facial abstention |
|---|---|---|---|---|
| Face never usable, 10 s | 0 | **0.000** | 0.200 | **none** |
| Settled infant, 10 usable s | 10 | **0.000** | 0.500 | none |

A blind measurement and a measured calm infant produced the same number, and the
only thing separating them was a confidence value sitting beside it.

This is the defect class `AUDIT-deeprelief.md` calls the most consequential,
and the same one the escalation arms carried in `AUDIT-v2.5.md`: a measurement
that could not be taken rendering as a reassuring one.

What makes it clearly a defect rather than a judgement call is that
`suggestions.ts` has always done this correctly — `windowConfidence` folds
temporal coverage into its number and withholds facial suggestions below 0.35
with an explicit abstention. The index had simply diverged from the author's own
stated rule.

**Fixed.** The facial arm abstains when no second was usable, naming the reason:
"This is a blind spot, not a reassuring reading." `contributions` is empty rather
than carrying a zero. Confidence now also multiplies by window coverage, so two
usable seconds of a thirty-second window no longer report the confidence of a
fully coded one.

**Tested**, including the invariant that a blind window and a calm window must
differ in what the output *says*, not only in a number beside it.

## 2. Both NFCS sums were divided by the instrument's nominal range

**Severity: high.**

`nfcsP3Sum` and `nfcs7Sum` are counts of seconds, so their ceiling is set by how
many seconds were actually coded. The index divided by a hardcoded 30, and two
screens printed `/30`. Measured with all three pain actions present in *every*
usable second — a maximal facial signal:

| usable s | nfcsP3Sum | reachable max | true fraction | value used before | after |
|---|---|---|---|---|---|
| 1 | 3 | 3 | 1.00 | **0.100** | 1.000 |
| 2 | 6 | 6 | 1.00 | **0.200** | 1.000 |
| 4 | 12 | 12 | 1.00 | **0.400** | 1.000 |
| 10 | 30 | 30 | 1.00 | 1.000 | 1.000 |

The facial arm carries weight 0.5, the largest in the index, so a partly
unusable window pulled the whole index down in proportion to how much of it the
camera missed. `StillAnalysis.tsx` and both gauges already scaled correctly by
`usableCount * 3`; the index, the clip audit line and the capture screen's stat
did not.

**Fixed.** `summariseWindow` now reports `nfcsP3AchievableMax` and
`nfcs7AchievableMax` and every consumer divides by those. The penalty for a
short window moved into confidence, where it belongs: the value says what the
face was doing, the confidence says how much of the window we saw.

## 3. A short window could not reach the published threshold, and said nothing

**Severity: high.**

NFCS-P-3 is defined in this repository as a 10-second epoch scored 0–30 with a
published clinical threshold at 9/30. Because items are counts of seconds, a
two-second window has a ceiling of 6 — it **cannot** reach 9 however distressed
the infant is. Measured before the fix, a two-second window with all three
actions present in every second:

- items filled as 2 / 2 / 2, total **6**
- confidence **1.00**, because `windowConfidence` sees full coverage of a short
  window as complete coverage
- the scale's own banding then reports "Below the published clinical threshold"

So a maximal facial pain response, recorded competently, was reported as
subclinical with full confidence.

**Fixed.** Items are withheld when the reachable total sits below the threshold
the scale itself publishes, with an abstention naming the ceiling and asking for
a full epoch. A three-second window has a ceiling of exactly 9 and is still
scored. The numbers come from `NFCS_P3` in the scale definition, not from a
judgement made in the AI layer.

Whether withholding is the right response, or whether a short window should be
scored as a proportion of its own ceiling, is recorded as
`REVIEW_FLAGS['nfcs-short-window-items-withheld']`.

## 4. A conversation at the bedside produced the maximum cry-pain signal

**Severity: high.**

`detectF0` searched autocorrelation lags corresponding to 300–750 Hz. The module
stated that this "keeps adult speech in the room from being picked up as the
infant's cry: an adult voice at 110-200 Hz falls outside the searched lag range
entirely." Restricting the lag search guarantees only that the *answer* is in
band, which is a much weaker property. Measured:

| true Hz | before | after | why |
|---|---|---|---|
| 120 (adult voice) | **750** | null | peak pinned at the shortest lag searched |
| 150 (adult voice) | **750** | null | same |
| 280 | **300** | null | clamped to the band edge |
| 310–700 | 310–696 | unchanged | in band, error ≤ 0.6% |
| 800 | **400** | null | correlates at twice its true period |
| 900 | **449** | null | same |
| 1000 | **500** | null | same |

750 Hz is the top of the band, and the index scales cry pitch across 350–600 Hz
before clamping, so a misread adult voice delivered the **maximum possible**
cry-pitch pain contribution. The octave errors run the other way, halving a
genuinely high-pitched cry.

**Fixed** with two guards, both properties of the signal rather than clinical
thresholds: a correlation peak pinned against either end of the searched range
is rejected, and a peak whose half-lag correlates as strongly is rejected as an
octave error. Validated against tones from 60 to 1400 Hz, and against cry with a
strong second harmonic, which must still read its fundamental — 450 Hz with
harmonic amplitudes of 0.3, 0.6 and 0.9 all read 449 Hz.

**Stated cost:** a cry at exactly 300 or 750 Hz is now declined. 310 and 700 Hz
read correctly, so the usable band is open rather than closed at its ends.

Refuted by measurement: I expected the whole-buffer energy normaliser to
systematically reject low-frequency cries. It does not — the normalised peak is
0.924 at 310 Hz against 0.968 at 740 Hz, both far above the 0.30 threshold.

## 5. A photograph judged unmeasurable still displayed a COMFORT level

**Severity: medium.**

`stillAnalysis` carries a comment recording that this bug was already found and
fixed once: "The quality gate existed and was never applied here." The fix was
incomplete. The small-face penalty was applied *after* the gate, so the gate
tested `q.quality` while the frame was stored with a lower number.

| image | faceBoxPx | gate saw | stored as | assessment before | after |
|---|---|---|---|---|---|
| 1280×960 | 512 | 1.000 | 1.000 | level 2 | level 2 |
| 400×300 | 160 | 0.600 | **0.436** | **level 2** | null |
| 320×240 | 128 | 0.600 | **0.349** | **level 2** | null |
| 260×200 | 104 | 0.600 | **0.284** | **level 2** | null |

`codeStills` skipped such a frame correctly, but `describeStills` has no quality
filter and surfaced its level anyway.

**Fixed** by applying the penalty first and gating on the number the frame is
actually stored with. Filtering `describeStills` would have fixed one caller;
this fixes every caller, present and future.

## 6. The usability gate was half inert

**Severity: medium.**

`faceDetected` was the literal `true` in `codeFrame`, `applyCalibration` and the
stills-as-window path — including for a result with `faceLandmarks: []`.
`summariseWindow` filters on `faceDetected && quality >= 0.45`, so only the
quality term ever did anything. **Fixed**: the flag now reports what the
landmarker returned, and a test asserts the gate excludes a frame on that basis
alone.

## 7. The quality gate documented a check it cannot perform

**Severity: medium.**

`assessFrameQuality` receives the landmark result and the frame dimensions —
never the pixels. No luminance can be computed from those inputs, yet both its
own comment and `stillAnalysis`'s described it as rejecting a face "too dark" to
measure. Measured, a well-framed frontal face scores 1.000 at any exposure.

Face size and pose gates do work as documented: quality 0.667 at a face
fraction of 0.12, 0.444 and unusable at 0.08, 0.350 and unusable at 45° yaw.

**Corrected rather than implemented.** Adding a luminance term means choosing a
threshold, and no neonatal data exists here to set one from, so the gate now
returns a `notAssessed` list naming the gap instead of implying a complete
check. `REVIEW_FLAGS['frame-exposure-not-assessed']` asks for photographs
spanning the lighting actually used at the bedside so a threshold can be
measured.

## 8. The 7-action total cannot reach its published maximum

**Severity: medium.**

`taut_tongue` has no signal in a general face landmarker and is listed in
`UNAVAILABLE_ACTIONS`, so six of seven actions are codeable and a fully coded
10-second window reaches **60**, not the 0–70 the type comment claimed. The
extractor stated the partial total "is flagged incomplete whenever it is
requested" — true in `buildSuggestions`, but nothing on the data said so, and
`painModel`'s feature vector passed `nfcs7_sum` straight out.

**Fixed**: the summary carries `nfcs7AchievableMax`, `actionsUnavailable` and
`nfcs7Complete`; the type comment states the real ceiling; the ONNX feature
vector gained window-independent `nfcs_p3_fraction` and `nfcs7_fraction`
alongside the raw sums, which were window-length dependent and would have made a
model trained on 30-second windows misread 10-second ones. Whether a 6-action
sum should be offered under a 7-action name at all is
`REVIEW_FLAGS['nfcs7-total-cannot-reach-70']`.

## 9. The presence threshold existed three times

**Severity: medium.**

`codeFrame`, `codeStills` and `applyCalibration` each re-implemented
`max(median + k × robustSd, median + 0.05)`. Only one used the named
`MIN_THRESHOLD_MARGIN`; the other two hardcoded the floor. Only one excluded
`UNAVAILABLE_ACTIONS`, and the other two were correct solely because the one
unavailable action happens to carry `NaN`. **Fixed**: one `actionThreshold` and
one `codeAction`, which returns `null` for "not codeable" so that collapsing it
to absent is a decision a caller makes visibly rather than inherits.

---

## Recorded, not changed

**The eye-squeeze cap is a discontinuity, not a ceiling.** Holding the brow fully
lowered and the mouth wide open and varying only eye aperture:

| aperture | overall tension | level |
|---|---|---|
| 0.075 | 0.647 | **4** |
| 0.080 | 0.308 | **2** |

A change of 0.005 in aperture moves the reading two levels and skips level 3
entirely, and nothing in the output tells a reader how close the reading sat to
the boundary. The rule itself is sound and deliberate — eye squeeze is the
discriminating action in NFCS, and the cap fixed three false positives out of
three. But the false-negative rate is still unmeasured, and this is a sharper
edge than the existing flag described. Added to
`REVIEW_FLAGS['eye-squeeze-gate']`, behaviour unchanged.

## Confirmed sound

The privacy design holds, and it is worth recording so nobody has to re-derive
it:

- **No egress beyond the one declared path.** No `fetch`, `XMLHttpRequest`,
  `WebSocket` or `sendBeacon` anywhere in `src/`, and no storage API at all —
  no `localStorage`, `sessionStorage`, `indexedDB` or `caches`. The only remote
  URL in the source tree is a citation link.
- **The Gemini gate is real.** `assessImage` returns
  `unavailable('not_configured')` before any call when the key is absent or the
  public-demo flag is set, and the key can only come from a build-time `VITE_`
  variable the Pages workflow never defines.
- **Consent is enforced, not assumed.** `VisionAssist` requires a separate
  labelled action, shows a warn callout, and writes a `vision.transmitted` audit
  entry before the call rather than after it.

## What was not done

The production build and every React screen were not executed. The sandbox this
review ran in deadlocks on the child processes Vite requires, so neither
`vitest` nor `vite build` could run; the 257 tests were executed by transpiling
the TypeScript in-process and running the suites under plain Node. The real
MediaPipe landmarker, the camera path and the audio capture path were never
exercised — only the pure functions they feed, on synthetic inputs.

Nothing here measures accuracy. No sensitivity, specificity or AUC is claimed,
because none was measured, and the standing position in `README.md` under Status
and safety is unchanged: this is pre-clinical software that has not been
validated at any site or reviewed by a research ethics board or a regulator.

Run `npm run verify` locally before merging.
