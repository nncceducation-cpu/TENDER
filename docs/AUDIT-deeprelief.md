# Review: DeepRelief AI, and what was carried into TENDER

Reviewed 16 August 2026 against the source in `deeprelief-ai/`: `App.tsx`,
`types.ts`, `services/geminiService.ts`, and the `LiveMonitor`, `StaticAnalysis`
and `Layout` components.

DeepRelief is a Google AI Studio app that sends stills and video frames of an
infant's face to Gemini and displays a pain score from 0 to 100 with a severity
label, a confidence figure, a list of detected features and a clinical
recommendation. It has three screens: a dashboard, single-image analysis, and a
live webcam monitor with a running trend and PDF, CSV and text export.

The interaction design is good and most of it was kept. The problems are in what
it claims, what it transmits, and what it does when it fails.

---

## 1. The failure path renders as a comfortable infant

Every `catch` block in `geminiService.ts` returns the same object:

```ts
return {
  painScore: 0,
  severity: PainSeverity.NO_PAIN,
  confidence: 0,
  features: ["Analysis unavailable - check API connection"],
  clinicalRecommendation: "Perform manual assessment.",
  timestamp: new Date().toLocaleTimeString()
};
```

`StaticAnalysis.tsx` then renders `PainSeverity.NO_PAIN` through
`severityColor()` as `text-green-600 bg-green-50`, and the pie chart reads 0%.

An expired API key, a rate limit, a dropped connection and a malformed response
all produce a green "No Pain" panel with a 0% score. The explanatory string is
buried among the feature chips, where it reads as a clinical observation rather
than an error. This is the most consequential defect in either codebase, because
it fails in the direction that withholds analgesia.

**In TENDER.** `assessImage` returns a typed `VisionAssessment` with a `status` of
`ok`, `not_configured`, `abstained` or `error`, and `facialTension` is `null` in
every case but the first. The panel renders nothing clinical unless the status is
`ok`. Seven tests in `visionModel.test.ts` assert that no failure path can produce
a scored result, including a loop over five distinct failure modes.

## 2. The stated architecture is not the implemented one

The dashboard in `App.tsx` says:

> Utilizes ResNet-18 and LSTM architectures to detect subtle micro-expressions
> often missed by human observation.

There is no ResNet and no LSTM anywhere in the codebase. The dependency list is
React, `@google/genai`, lucide, recharts and jsPDF. All analysis is a prompt sent
to `gemini-3-flash-preview` or `gemini-3-pro-preview`.

The same screen claims the system provides "objective, consistent pain scoring
24/7". A general-purpose language model reading a photograph is not an objective
measurement, and without a fixed temperature it is not a consistent one either.
The original set no temperature.

**In TENDER.** The model card names the model, states that it was not trained on
neonatal pain data, and records that no performance figure has been measured.
Temperature is fixed at 0 so the same frame scores the same way twice.

## 3. PFECIC does not cover neonates

The system prompt opens:

> You are DeepRelief, a specialized neonatal medical AI assistant. Your analysis
> algorithm is enhanced by the **PFECIC (Pain Facial Expression of Critically Ill
> Children)** framework.

PFECIC is real and the paper is sound. It is also the wrong population. The
dataset comprises **53 critically ill Chinese children aged 1 to 18 years**,
collected in the PICU and CICU of Children's Hospital of Fudan University over
December 2022 to January 2023, across seven painful procedures. It contains 119
videos and 6,951 annotated images, triple-annotated by six nurses from the
hospital pain team. The paper explicitly concerns children beyond the neonatal
period.

The 88.3% accuracy the framing implies belongs to a Swin Transformer trained on
that dataset. DeepRelief does not use a Swin Transformer and is not trained on
anything.

What PFECIC does contribute, and what is worth keeping, is its facial expression
rating: the five-level facial tension item of the **COMFORT behaviour scale**.
That item is not new to TENDER. It is already implemented, with the same anchors,
as `facial_tension` in COMFORTneo, an instrument validated in neonates from 24 to
42 weeks.

**In TENDER.** The PFECIC framing was removed at your direction. The five-level
scale remains, presented as what it is: the COMFORT behaviour facial tension item.
The model is asked to score that item, and the result is proposed against
COMFORTneo rather than converted into a number with no referent.

> Construction and validation of a pain facial expressions dataset for critically
> ill children. *Sci Rep.* 2025;15. doi:10.1038/s41598-025-02247-w

## 4. A 0 to 100 pain probability corresponds to nothing

`geminiService.ts` maps the five-point assessment onto a continuous score:

```
Level 1-2 -> 0-20% (No Pain)
Level 3   -> 21-50% (Mild Pain)
Level 4   -> 51-80% (Moderate Pain)
Level 5   -> 81-100% (Severe Pain)
```

The mapping is invented, and the resulting number is not a probability of
anything. It cannot be compared against a published threshold, entered in a chart
alongside a PIPP-R or an N-PASS, or trended against another instrument. The
`severity` enum also collapses four levels into three by omitting a moderate
category, so a Level 4 assessment and a Level 5 assessment both surface as
"Severe Pain" while carrying scores 30 points apart.

**In TENDER.** The model returns the instrument level, 1 to 5, and nothing is
derived from it that the instrument does not define.

## 5. The confidence figure is decorative

The schema asks the model for a "Confidence score of the AI 0.0 to 1.0" and the
interface prints it to one decimal place as a percentage. A language model asked
for its confidence produces a plausible number, not a calibrated one. Printing
"AI Confidence: 87.3%" in a bold panel next to a pain score gives it an authority
it has not earned.

**In TENDER.** No confidence number is requested from the model or displayed for
the cloud path. What is displayed instead is the model's own judgement of whether
the image is assessable, and the degree of occlusion, both of which are things it
can actually observe.

## 6. The API key ships in the browser

`geminiService.ts` reads `process.env.API_KEY`, which Vite substitutes at build
time. In a client-only application the key is therefore in the deployed bundle
and extractable by anyone who opens the network tab.

Had this gone up on the public GitHub Pages site alongside TENDER, the key would
have been publicly readable and billable.

**In TENDER.** The key is read from `VITE_GEMINI_API_KEY`, set only in a local
`.env.local` that is gitignored. The Pages workflow never defines it, and
`isConfigured()` additionally returns false whenever the public-demo flag is set.
On the deployed site the panel appears, disabled, with the reason stated.

## 7. Identifiable infant images leave the device

This is the deepest difference between the two tools. TENDER's facial coding runs
in the browser precisely so that video of an identifiable infant in an Alberta
NICU never becomes a transmission. DeepRelief's core function is that
transmission.

Both positions are defensible; they are not defensible silently. The original
sends the image the moment "Run Assessment" is pressed, with no statement that
anything is leaving the machine.

**In TENDER.** The panel is titled "Cloud second opinion" and carries a standing
warning that it is the only part of the application that transmits. Selecting an
image does nothing; a separately labelled action sends it. Both the transmission
and the result are written to the hash-chained audit log. The on-device coder
remains the default path and is unaffected.

## 8. Live monitoring at interval, without a baseline

`LiveMonitor.tsx` runs `setInterval` over the webcam feed and plots a trend. The
idea is right and is where this technology should end up. Two things make the
current implementation unsafe to trend on: there is no per-infant baseline, so
every frame is scored against a population prior derived from adult and older
child faces, and each frame is scored independently, so what is plotted is
model variance as much as infant state.

**In TENDER.** Continuous coding is the on-device path, which calibrates against a
settled baseline recorded for that infant and collapses frames into one-second
bins so the score does not depend on frame rate. The cloud assessor is
deliberately single-frame and is offered as a second opinion rather than a
monitor.

---

## What was carried across

- **The PDF report.** DeepRelief's best idea. A clinician who has just assessed an
  infant wants something for the chart. `src/state/report.ts` produces one, but it
  prints the instrument, the item-level scores, which items came from a model, the
  workings behind each total, the protocol version and the audit chain. It does
  not print a machine-generated treatment recommendation.
- **Upload for retrospective review**, which is genuinely useful for teaching and
  for building an annotated set. It was extended rather than copied: DeepRelief
  could only upload to the cloud, so uploading meant transmitting. TENDER runs the
  on-device coder over an uploaded clip, which needs no key, sends nothing, and
  works on the public site.
- **The five-level facial tension scale**, restored to its actual identity as the
  COMFORT behaviour item.
- **The idea of a second opinion**, kept, but placed alongside the instrument
  rather than in front of it.

## What was not

- The 0 to 100 pain probability.
- The model-generated clinical recommendation. A model should not print treatment
  advice on a document that goes in a chart.
- The confidence percentage.
- The ResNet and LSTM claims.
- The PFECIC framing.
- Continuous cloud monitoring of a live feed.
