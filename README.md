# TENDER

**T**ool for **E**valuating **N**eonatal **D**istress, **E**scalation and **R**esponse.

**Live: https://nncceducation-cpu.github.io/TENDER/**

On-device clinical decision support for neonatal pain assessment, post-operative
analgesia and opioid weaning. Successor to PainWise NICU, rebuilt around the
Alberta Children's Hospital NICU protocol.

> **Pre-release.** Not validated at any site, not reviewed by a research ethics
> board or a regulator, and carrying open questions about opioid dosing. Nothing
> it produces should be used to treat an infant. See Status and safety below.

Two things distinguish it from the version it replaces. The pain instruments are
implemented as instruments, with their contextual rules, gestational-age
corrections and applicability conditions, rather than as numbers a clinician types
from memory. And the facial coding that those instruments already specify is
performed by a model that runs entirely in the browser, proposes values, and never
commits them.

---

## Quick start

```bash
npm install
npm run fetch:models     # stages MediaPipe WASM and the pinned face landmarker
npm run dev
```

Verify everything:

```bash
npm run verify           # typecheck, lint, 73 tests, production build
```

The camera requires a secure context. `npm run dev` serves over `localhost`, which
counts; anything else needs HTTPS.

---

## What it does

**Context.** Gestational age at birth, postmenstrual age, weight, respiratory
support, opioid exposure, surgery, and the states that suppress behavioural pain
expression: neuromuscular blockade, therapeutic hypothermia, encephalopathy, deep
sedation. No name, no MRN, no date of birth.

**Assess.** Choose what you are measuring — acute procedural, postoperative,
prolonged, or sedation adequacy — and the tool ranks the instruments against that
construct and this infant, with reasons. Score the instrument item by item. It will
not produce a total from a partially completed scale.

**Facial coding.** Record a settled baseline for this infant, then open an
observation window. The model codes the NFCS facial actions per second, reports the
proportion of the window each was present, and proposes PIPP-R or NFCS-P-3 item
values with the measured proportion attached as the rationale. Nothing is
auto-accepted; the audit trail records which items came from the model.

**Orders.** Post-operative fentanyl and acetaminophen from the protocol, with dose
ceilings and a stated daily maximum.

**Wean.** The taper rule from cumulative exposure, the reduction per step, the
number of steps to zero, and whether WAT-1 is indicated.

**Convert.** Opioid equianalgesic conversion with explicit units, both the straight
and the cross-tolerance-reduced targets, the ratios used, and a warning when the
derived breakthrough dose conflicts with the protocol's own bolus rule.

**Trend.** Scores over the session, the hash-chained audit log, and a de-identified
JSON export.

**Protocol.** The version in force, the changelog, the full instrument library with
caveats and references, and the open questions that need the protocol owner's
answer.

---

## Instruments

| Instrument | Range | Construct | Notes |
| --- | --- | --- | --- |
| NIPS | 0-7 | Acute procedural | No gestational-age correction |
| PIPP-R | 0-21 | Acute procedural, postoperative | Contextual indicators suppressed when core is zero |
| N-PASS | -10 to +13 | Prolonged, postoperative, sedation | Prematurity correction on the pain arm only |
| COMFORTneo | 6-30 | Prolonged, postoperative, sedation | Ventilator item or crying item, never both |
| EDIN | 0-15 | Prolonged | Observed across a shift |
| NFCS-P-3 | 0-30 | Acute procedural | Per-second coding, clinical threshold 9/30 |
| WAT-1 | 0-12 | Withdrawal | Eleven items in four observation groups |

Sources, validation populations and caveats for each are in
[`docs/EVIDENCE.md`](docs/EVIDENCE.md) and are also shown in the app.

---

## Architecture

```
src/
  domain/types.ts        Clinical constructs. No logic.
  data/scales/           Each instrument as data: items, anchors, bands,
                         transforms, caveats, references.
  data/protocol/ach.ts   The ACH protocol as versioned configuration, plus
                         REVIEW_FLAGS: the open questions found on porting.
  engine/                Generic, unit-tested, framework-free.
    scoring.ts           Applicability, validation, transforms, context warnings
    scaleSelector.ts     Ranks instruments against construct and patient
    protocolEngine.ts    Eligibility, dosing, weaning, escalation
    opioid.ts            Equianalgesic conversion with guards
  ai/                    On-device only.
    faceLandmarker.ts    MediaPipe wrapper, frame quality gate
    nfcsFeatures.ts      Blendshapes to NFCS actions, per-infant calibration
    cry.ts               Web Audio, F0 restricted to the neonatal cry band
    painModel.ts         PainModel interface, TransparentIndex, ONNX slot
    suggestions.ts       Facial coding to scale item proposals
  state/                 In-memory session, hash-chained audit log
  components/            React UI
```

Two rules hold the design together. **Clinical values are data, never code**, so a
protocol change is a configuration change with a version bump and a changelog line.
And **the engine never touches React**, so every clinical rule is testable without
rendering anything.

---

## The AI layer, in one paragraph

The published multimodal models predict a pain label and report about 0.90 AUC on
45 infants at a single centre. TENDER does not ship a model like that, because that
result has no established transfer and shipping it would invite exactly the
over-reliance that regulators are trying to prevent. Instead the model performs the
measurement the instrument already defines: PIPP-R's facial items are literally the
proportion of the observation window during which brow bulge, eye squeeze and
nasolabial furrow are present, which is a thing no human at a bedside can measure
and a per-second coder can measure exactly. Actions are coded against a baseline
recorded for that individual infant, not against a population threshold derived
from adult faces. The model abstains when the face is too small, too oblique, or
present for too little of the window, and it reports `taut_tongue` as unmeasurable
rather than inventing a value. An `OnnxPainModel` slot exists for a model the unit
trains and validates on its own data; it loads lazily so a unit that never uses it
never pays the 27 MB.

Full rationale in [`docs/EVIDENCE.md §4`](docs/EVIDENCE.md).

---

## Status and safety

This is **pre-clinical software**. It has not been validated at any site and has not
been reviewed by a research ethics board or a regulator.

Before any patient use:

1. Answer the items in `REVIEW_FLAGS`, visible in the app's Protocol screen and in
   [`docs/AUDIT-v1.md`](docs/AUDIT-v1.md). Two of them concern opioid dosing.
2. Settle the REB position on on-device video processing, per
   [`docs/PRIVACY-AND-REGULATORY.md`](docs/PRIVACY-AND-REGULATORY.md).
3. Record instrument licences in `docs/INSTRUMENT_LICENCES.md`.
4. Decide whether the facial layer is enabled for clinical use at all, or only
   under a research protocol.

The facial coding component is very likely a device function under FDA's CDS
criteria, because criterion 1 excludes software that processes a medical image or a
signal from a signal acquisition system. Treat it as investigational.

---

## Documentation

- [`docs/AUDIT-v1.md`](docs/AUDIT-v1.md) — fifteen findings from the previous version, ranked by how directly they could reach a patient
- [`docs/EVIDENCE.md`](docs/EVIDENCE.md) — the literature behind every design decision
- [`docs/PRIVACY-AND-REGULATORY.md`](docs/PRIVACY-AND-REGULATORY.md) — HIA, FDA CDS criteria, Health Canada, security posture
- [`docs/VALIDATION-PLAN.md`](docs/VALIDATION-PLAN.md) — how to actually test whether the facial coding works at ACH
- [`docs/INSTRUMENT_LICENCES.md`](docs/INSTRUMENT_LICENCES.md) — to be completed locally

---

## Licence

Not yet licensed. Add one before this leaves the unit.
