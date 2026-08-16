# Validation plan

A draft study design for establishing whether TENDER's facial coding does what it
claims at Alberta Children's Hospital. Written to be argued with, not followed.

The framing matters. TENDER does not claim to detect pain. It claims to perform a
defined measurement — per-second coding of NFCS facial actions, and the proportion
of an observation window during which each was present — that PIPP-R and NFCS
already specify and that human raters currently approximate. That is a narrower
claim than the published models make, and it is testable in a single unit with a
sample size that is actually achievable.

---

## Study 1: agreement with trained human coders

**Question.** Does the automated coding agree with trained human NFCS coders well
enough to substitute for the facial items of PIPP-R?

**Design.** Prospective observational, single centre.

**Population.** Infants 24 to 42 weeks corrected gestational age undergoing a
clinically indicated heel lance or venipuncture. Stratify enrolment by gestational
age band (under 28, 28 to 31, 32 to 35, 36 and above) so that performance can be
reported by band rather than pooled. The extremely preterm band is the one where
existing tools are weakest and where a null result would matter most.

**Procedure.** Record a 30-second settled baseline, then video from 15 seconds
before the procedure to 30 seconds after. Two trained coders, blind to each other
and to the automated output, code NFCS per second from the video. The application
codes the same epochs from the same recordings.

**Primary endpoint.** Agreement between automated and consensus human coding for
each of brow bulge, eye squeeze and nasolabial furrow, reported as Cohen's kappa
per second and as intraclass correlation on the proportion-present per window.

**Secondary endpoints.**

- Agreement on the derived PIPP-R facial item band (0 to 3), reported as weighted
  kappa. This is the quantity that actually reaches a clinical decision.
- Agreement on the total PIPP-R score when facial items are automated versus
  human-coded.
- Proportion of windows in which the model abstained, and why, by gestational age
  band and by respiratory support. A tool that abstains on 60% of CPAP infants is
  not usable, and that number should be known before anything else is claimed.
- Human inter-rater kappa, as the ceiling. The model cannot sensibly be asked to
  agree with humans better than humans agree with each other.

**Sample size.** For a kappa of 0.75 against a null of 0.60 with 80% power at
alpha 0.05, roughly 120 windows per action. With stratification, target 40 infants
per gestational age band. Confirm with a statistician against the expected marginal
prevalence of each action, which is low for nasolabial furrow and will drive the
requirement.

**Analysis note.** Report agreement, not accuracy. There is no gold standard for
neonatal pain; there is a defined coding scheme and trained humans applying it.

---

## Study 2: calibration robustness

**Question.** How sensitive is the per-infant calibration to the conditions under
which the baseline was recorded?

**Design.** Nested within Study 1. For a subset, record two baselines: one during a
quiet settled period and one within 30 minutes of routine handling.

**Endpoint.** Difference in derived PIPP-R facial band between the two calibrations
on the same procedural window.

**Why this matters.** The calibration is the load-bearing assumption of the whole
facial layer. If the derived band shifts by a point depending on when the baseline
was taken, the operational instruction "record the baseline while settled" needs to
become a hard gate with an objective criterion, not a note in the interface.

---

## Study 3: does it change anything

**Question.** Does automated facial coding change assessment behaviour or analgesic
exposure?

**Design.** Stepped-wedge or interrupted time series across the unit, following
SQUIRE 2.0, only after Studies 1 and 2 are complete and positive.

**Endpoints.**

- Proportion of scheduled pain assessments completed on time.
- Inter-rater variability in PIPP-R and N-PASS scores across nurses.
- Cumulative opioid exposure in the first 72 post-operative hours.
- Time from a score crossing threshold to a documented intervention.
- Proportion of assessments where a model suggestion was overridden, and in which
  direction. Systematic override in one direction is the most informative single
  number this study can produce.

**Balancing measures.** Assessment time per infant. Nurse-reported confidence.
Frequency of documented "score not obtainable".

---

## Building a local model

The export function produces per-window feature vectors alongside the clinician's
final item scores, with the model's suggestion and whether it was accepted recorded
separately. That is a labelled training set for exactly the feature space the
application will see in production, which is the property most published models
lack when transferred to a new site.

Sequence: accumulate exports through Study 1, train offline, export to ONNX, load
through `OnnxPainModel` with a completed model card, then validate prospectively
before `calibratedAtThisSite` is ever set to true. Feature extraction and inference
live in the same codebase precisely so that this loop is closed.

The USF-MNPAD-I dataset (45 neonates, video, audio, vital signs, nurse-labelled) is
available by written request to the principal investigators under a signed usage
agreement, and would provide a pre-training corpus. Local data would still be
required for calibration.

---

## What would make this fail honestly

Worth stating in advance, so the study is not rescued after the fact.

- Kappa below the human inter-rater ceiling by a wide margin in the under-28-week
  band. The face that is hardest to code is the one that matters most.
- Abstention rate above roughly a third in routine bedside conditions. Prongs, tape,
  eye shields and prone positioning are the norm, not the exception.
- Calibration sensitivity large enough to move the PIPP-R band.
- Systematic under-coding relative to humans, which would mean the tool
  under-reports pain and is worse than no tool.

Any of these should stop clinical deployment of the facial layer. The rules engine,
the instrument library and the protocol logic stand on their own and do not depend
on the facial layer working.
