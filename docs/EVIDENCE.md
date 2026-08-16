# Evidence base

The literature review behind the design decisions in TENDER. Every claim here is
tied to a source that was read for this build, not to recollection.

---

## 1. The measurement problem

A 2022 review in *Frontiers in Pediatrics* examined thirteen neonatal pain scales
(ALPS-Neo, BPSN, CHIPPS, COMFORT-B/neo, COVERS, EDIN/EDIN6, NFCS-R, NIAPAS, NIPE,
NIPS, N-PASS, PAT, PIPP-R) and reached a conclusion that shapes this whole
application: **no existing instrument performs well across every domain.**

Four findings mattered for the build.

Behavioural and physiological indicators each fail alone. Physiological measures
"do not always correlate with other measures of pain" because level of
consciousness and medication confound them. Behavioural measures fail when
behaviour is pharmacologically suppressed.

Five scales (PIPP-R, NIPS, NFCS, N-PASS, BPSN) distinguish stress from acute pain,
but all perform less well for chronic or persistent pain in very preterm infants.
Only COMFORTneo and N-PASS differentiate pain by temporality at all. This is the
gap that matters most in a NICU, where the infants with the longest stays are the
ones whose pain is least well measured.

Inter-rater reliability is a training artefact, not a property of the scale. N-PASS
achieves high reliability when providers are adequately trained; in practice
"training was often insufficient leading to inter-rater inconsistencies".

The authors' own recommendation is AI-based continuous monitoring using objective
variables such as heart rate and facial movement.

**Design consequence.** TENDER makes the clinician choose a construct before it
offers an instrument, and ranks instruments against that construct plus gestational
age, ventilation status and any state that suppresses behaviour. It refuses to
present a single default scale for every situation, because that is the error the
review describes.

> Olsson E, Ahl H, Bengtsson K, et al. Neonatal pain assessment: do we have the
> right tools? *Front Pediatr.* 2022;10:1022751.

---

## 2. Instruments implemented

### PIPP-R

Seven indicators: three facial actions, two physiological, two contextual. Range
0-21. Interpretation: 6 or below minimal or no pain, 7 to 12 mild to moderate,
12 or above moderate to severe.

The revision's defining rule is that the contextual indicators, gestational age and
behavioural state, are scored **only if at least one physiological or facial
indicator scores above zero**. Scoring them unconditionally, as the original PIPP
did, gives a quietly sleeping 26-week infant a baseline of 6 for being asleep and
premature. This rule is implemented in `pippR.ts` and is the first thing the test
suite asserts.

The facial items are defined as proportion of observation time: none 0-9%, minimum
10-39%, moderate 40-69%, maximum 70% or more. **This is the single most important
fact in the AI design**, and section 4 explains why.

> Stevens BJ, Gibbins S, Yamada J, et al. The Premature Infant Pain Profile-Revised
> (PIPP-R): initial validation and feasibility. *Clin J Pain.* 2014;30(3):238-243.

### N-PASS

Five criteria, each scored 0 to +2 for pain and 0 to -2 for sedation, giving two
independent scores. Pain 0 to +10 before correction, sedation 0 to -10.

Reported reliability from the prolonged-pain validation: pain ICC 0.95 to 0.97,
sedation ICC 0.85 to 0.95, Cronbach's alpha 0.82 for pain and 0.87 for sedation,
correlation with PIPP 0.83 at high pain scores and 0.61 at low scores.

A prematurity correction is added to the pain score only, using the PIPP
gestational age bands. The published corrected range of 0-13 fixes the maximum
correction at +3.

An important limitation: an independent study found the sedation arm reliably
detects **oversedation** but does not discriminate between intermediate sedation
levels. TENDER states this on the instrument rather than presenting the sedation
number as if it were graded.

> Hummel P, Puchalski M, Creech SD, Weiss MG. Clinical reliability and validity of
> the N-PASS. *J Perinatol.* 2008;28(1):55-60.
>
> Hillman BA, Tabrizi MN, Gauda EB, et al. *J Perinatol.* 2015;35(2):128-131.

### COMFORTneo

Seven items defined, six scored: the respiratory-response item for ventilated
infants, the crying item for spontaneously breathing infants. Range 6-30. A score
of 14 or above indicates distress or pain; below 9 supports considering a reduction
in opioid or sedative dose. Inter-rater ICC 0.93 across 310 paired assessments by
62 nurses.

TENDER switches the applicable item automatically from the recorded ventilation
status and records which one was used in the assessment's workings. Scoring both,
or scoring neither and summing five items, silently changes the meaning of the
total.

> van Dijk M, Roofthooft DWE, Anand KJS, et al. *Clin J Pain.* 2009;25(7):607-616.

### EDIN

Five behavioural items scored 0-3 over a prolonged observation window: facial
activity, body movements, quality of sleep, quality of contact with caregivers,
consolability. Range 0-15. A score above 6 indicates marked prolonged pain.

> Debillon T, Zupan V, Ravault N, et al. *Arch Dis Child Fetal Neonatal Ed.*
> 2001;85(1):F36-F41.

### NIPS

Six behavioural indicators, range 0-7, observed over one minute. A score above 2
indicates possible pain. Validated for acute procedural pain. It carries no
gestational age correction, which is why the scale selector down-ranks it below
32 weeks.

> Lawrence J, Alcock D, McGrath P, et al. *Neonatal Netw.* 1993;12(6):59-66.

### WAT-1

Eleven items across four observation sources, total 0-12. Three from the previous
12-hour record (loose stools, vomiting, temperature above 37.8 °C), five from a
2-minute pre-stimulus observation (state, tremor, sweating, uncoordinated movement,
yawning or sneezing), two from a 1-minute stimulus (startle to touch, muscle tone),
and one timed recovery item scored 0, 1 or 2.

That last structure is the reason v1's free-number entry was inadequate: the
recovery item requires the infant to be handled and timed. A remembered integer
cannot encode whether that happened.

> Franck LS, Harris SK, Soetenga DJ, et al. *Pediatr Crit Care Med.*
> 2008;9(6):573-580.
>
> Franck LS, Scoppettuolo LA, Wypij D, Curley MAQ. *Pain.* 2012;153(1):142-148.

### NFCS

Seven facial actions coded present or absent second by second and summed across the
epoch: brow bulge, eye squeeze, nasolabial furrow, open lips, vertical mouth
stretch, horizontal mouth stretch, taut tongue. Over a 10-second epoch the 7-action
version runs 0-70; the restricted 3-action constellation (NFCS-P-3: brow bulge, eye
squeeze, nasolabial furrow) runs 0-30.

A 2023 study in *Pain* using time-locked EEG established a clinical threshold of
**9 out of 30** on NFCS-P-3 separating clinically significant from subclinical
pain-related facial activity, and reported something that belongs in any honest AI
pain tool: there was **no significant difference in total cortical power** between
the high and low facial-activity groups. What differed were cortical microstate
patterns. The authors conclude that facial activity relates to *how* the brain
processes a stimulus, not simply to the degree of activation.

**Design consequence.** An absent facial response is not evidence of absent
nociception. TENDER prints this caveat on the NFCS instrument and never lets a low
facial score, on its own, support withholding analgesia.

> Grunau RVE, Craig KD. *Pain.* 1987;28(3):395-410.
>
> Peters JWB, Koot HM, Grunau RE, et al. *Clin J Pain.* 2003;19(6):353-363.
>
> Clinical thresholds in pain-related facial activity linked to differences in
> cortical network activation in neonates. *Pain.* 2023.

---

## 3. State of the art in automated neonatal pain assessment

### Multimodal deep learning

The most substantial open work is the University of South Florida group's
multimodal spatio-temporal system, trained on **USF-MNPAD-I**: 45 neonates,
30 to 41 weeks gestation, recorded at Tampa General Hospital, with video, audio and
vital signs, labelled by two trained nurses. Nine neonates in the postoperative
subset were monitored for three hours after surgery; 36 were recorded during
procedural pain (heel lance, immunisation).

Architecture: bilinear VGG-16 streams plus LSTM for face, VGG-16 plus LSTM on body
regions, VGG-16 on cry spectrograms, combined by unweighted majority voting.

Reported performance:

| Modality | Accuracy | AUC |
| --- | --- | --- |
| Face | 69.5% | 0.82 |
| Body | 70.5% | 0.78 |
| Sound | 79.6% | 0.87 |
| Fusion | 79.4% | 0.90 |

Two observations shaped the TENDER design. Fusion gained about 6 percentage points
of accuracy over the best single modality, so multimodality is worth the
engineering. And **sound outperformed face** as a single modality, which is not the
intuition most people bring to this problem.

> Salekin MS, Zamzmi G, Goldgof D, et al. Multimodal spatio-temporal deep learning
> approach for neonatal postoperative pain assessment. *Comput Biol Med.*
> 2021;129:104150. arXiv:2012.02175
>
> USF-MNPAD-I dataset: access by written request to the principal investigators,
> case-by-case, under a signed usage agreement.

### Commercial facial analysis against expert raters

A 2024 *Scientific Reports* study ran FaceReader 9 with the baby face model against
46 healthcare professionals (29 nurses, 17 physicians) on 42 ten-second clips from
14 term neonates under three conditions: non-noxious thermal, short noxious (heel
prick), prolonged noxious (pressure for blood collection).

Correlations with expert VAS ratings were high: arousal r = 0.84, valence r = 0.86,
both p ≤ 0.001. Eleven facial action units were identified as relevant. Mean expert
VAS was 2.3, 4.1 and 5.0 across the three conditions.

The limitations are as informative as the results. Fourteen infants. Video only,
never tested live. Healthy term infants only, so nothing about preterm or
pathological faces. Proprietary algorithm, so no operational inspection. And
performance degraded with variations in angle and lighting.

**Design consequence.** TENDER's frame quality gate computes head yaw and pitch from
the facial transformation matrix and downweights or abstains beyond about 30
degrees, because pose sensitivity is the failure mode the literature reports most
consistently.

> Comparative analysis of artificial intelligence and expert assessments in
> detecting neonatal procedural pain. *Sci Rep.* 2024;14. doi:10.1038/s41598-024-71278-6

### PFECIC, and why it is not a neonatal framework

The predecessor tool DeepRelief built its prompt around the **PFECIC** dataset
(Pain Facial Expression of Critically Ill Children), describing itself as a
neonatal assistant "enhanced by the PFECIC framework".

The dataset is sound work. It comprises 53 critically ill Chinese children aged
**1 to 18 years**, collected in the PICU and CICU of Children's Hospital of Fudan
University between December 2022 and January 2023, across seven painful
procedures: nebulisation suction, tracheal suction, surgical debridement or
dressing change, peripheral venous catheterisation, arterial catheterisation,
intramuscular or subcutaneous injection, and urinary catheterisation. It contains
119 videos and 6,951 annotated images, triple-annotated by six nurses from the
hospital pain management team. A Swin Transformer trained on it reached 88.3%
accuracy, 88.3% precision, 88.7% recall and an F1 of 88.5%.

It contains no neonates, and the paper says so.

Two things follow. The 88.3% figure has no bearing on a neonatal tool, and it has
no bearing at all on a general-purpose language model that was not trained on the
dataset. And the labelling instrument PFECIC used is not novel: it is the
five-level facial tension item of the **COMFORT behaviour scale**, which TENDER
already implements with the same anchors as `facial_tension` in COMFORTneo,
validated in neonates from 24 to 42 weeks.

The useful thing to take from PFECIC is therefore not its framework but its
finding about occlusion. Its exclusion criterion was more than one third of the
face covered, and it retained children partially obscured by oxygen tubes,
nasogastric tubes and endotracheal tubes, noting this as a limitation. That is the
ordinary condition of a NICU face, and it is why TENDER's on-device coder gates on
face fraction and head pose, and why the cloud assessor is asked to report
occlusion and to abstain past roughly a third.

> Construction and validation of a pain facial expressions dataset for critically
> ill children. *Sci Rep.* 2025;15. doi:10.1038/s41598-025-02247-w

### What changed in 2025 and 2026

The review above was written against work up to 2024. A re-check in August 2026
found six things worth recording. Two of them bear directly on whether TENDER's
central design choices were the right ones, and both landed in TENDER's favour.

**The adult field is maturing and has left neonates behind.** A 2025 systematic
review of AI facial-expression pain assessment covered 25 studies published between
2015 and 2025 and *explicitly excluded neonatal and paediatric populations*. The
barriers it names for the adult work are the same ones that block the neonatal
work: small non-representative samples, no external validation, heterogeneous
annotation schemes, and reported performance without confidence intervals. A review
that has to exclude infants to find a coherent body of evidence is a statement
about how thin the neonatal evidence still is.

**Real-world deployment has been attempted at scale, and the cost was a pair of
hands.** An AI pain assessment system was run against 232 newborns during routine
blood sampling with NIPS as the reference. It reached 88.79% agreement on the pain
score (kappa 0.92), 95.25% on the pain grade (kappa 0.90), and r = 0.95 against
nurse scoring. Specificity for severe pain was 87.84%, and the authors attribute
the shortfall to using face without cry, which is the USF finding arrived at from
the other direction. The operational detail matters more than the numbers: the
study required an additional nurse to hold the camera. A tool that costs a pair of
hands during a procedure has not solved the problem it set out to solve, and this
is the argument for a fixed cot-side mount rather than a handheld device.

#### The state of the art now predicts an instrument, not a pain label

**SSS-TT** (El Othmani and Ouersighni, *Applied Intelligence* 2026) combines masked
autoencoder pretraining with a vision transformer and temporal convolutional
network over one-second windows, and trains with an ordinal regression objective,
CORAL loss, aligned to **NIPS levels 0 to 3**. On iCOPE, 1000 infants with
subject-level splits and five-fold cross-validation, it reports 84.6% ± 0.7%
accuracy and a quadratic weighted kappa of 0.82. Masked-autoencoder pretraining cut
annotation requirements by roughly three quarters, which is the practical finding
for anyone contemplating a local model.

**PANDIA** (*PLOS Digital Health* 2026) goes further in the same direction and is
the more consequential paper for TENDER. It projects face, cry and physiological
inputs onto **12 named clinical concepts**, fuses them with a graph network, and
runs a symbolic rule engine over the result to produce a human-readable
explanation with an uncertainty estimate. It maps NIPS, COMFORT-B and PIPP-R onto a
single four-level ordinal scheme rather than inventing a score. And it **adapts to
the individual infant**, using meta-learning over 5 to 20 labelled examples, which
buys 3.2 to 4.7 percentage points of accuracy over the non-personalised model.
Evaluated across 2847 infants in four datasets including 490 newly collected across
four African hospitals, it reports 87.3% accuracy, quadratic weighted kappa 0.847,
and a 92.1% clinician acceptance rate for its explanations.

Three of TENDER's load-bearing decisions appear in that description. Predict the
levels of an instrument clinicians already use, rather than a novel score. Route
the prediction through named clinical concepts a clinician can inspect and reject,
rather than an opaque number. And **normalise to the individual infant**, which is
what TENDER's per-infant baseline calibration does by a cruder mechanism: PANDIA
adapts learned weights from labelled examples, TENDER takes a median and a robust
spread from a settled recording and thresholds against that. Both are answers to the
same problem, which is that a resting neonatal face is not a fixed thing.

The reservations are unchanged and PANDIA states one of them plainly: a **7.5%
out-of-distribution generalisation gap** on unseen datasets, retrospective
validation only, and no prospective trial. iCOPE is not publicly available.
Subject-level splits inside one dataset are not external validation. And nothing in
either paper says anything about a 26-week infant on CPAP with tape across the
nasolabial fold. This is precisely why no trained weights ship in this repository.

#### Touchless and contactless monitoring

**Depth cameras, two sites, and a transfer penalty worth noting.** A multi-centre
study placed an Intel RealSense D415 depth camera around the beds of 61 neonates at
two level III units, in Los Angeles and Utah, and classified motion from depth
difference frames with a random forest. Pooled, it reports 93.8% sensitivity, 92.2%
specificity and an AUC of 0.984. The number that matters more is the cross-site
one: trained on the Los Angeles data and tested on Utah, **specificity fell from
92.2% to 81.5%**. That is a simple binary motion task, not a pain judgement, and it
still lost ten points crossing between two units in the same country. Any claim
that a pain model trained elsewhere will work at ACH has to answer that number.

Depth is a channel TENDER does not use and could not use from a browser, but it is
the likeliest route by which body movement, a PIPP-R and N-PASS item that facial
landmarks cannot reach, eventually becomes automatable.

**Contact sensors are a real alternative to vision.** Flexible wireless biosensors
on the chest and dorsal foot, carrying accelerometer, gyroscope, heart rate,
respiratory rate and acoustic channels, were used to build a Clinical Sensor Pain
Scale and an Automated Sensor Pain Scale in 32 late preterm and term infants during
phlebotomy. Against N-PASS the clinical version reached an ICC of 0.95 and 95%
absolute agreement, and the automated version was statistically equivalent to
N-PASS with a Bland-Altman mean difference of -0.016. Small, single centre, and
untested in hypotonic infants, but it points at a route that does not require the
face to be visible, which in a prone infant on CPAP is most of the time.

**And the field is saying so out loud.** A 2026 *Pediatric Research* commentary,
"Beyond the face", argues that facial coding alone is insufficient and that
physiological and behavioural channels have to be integrated, noting that current
NICU pain monitoring remains intermittent spot checks rather than continuous
observation. It offers no new data, but it is a statement of where the field
believes the problem now sits.

> El Othmani O, Ouersighni R. SSS-TT: self-supervised sequential spatio-temporal
> transformers with adaptive multimodal fusion for automated neonatal pain
> assessment. *Appl Intell.* 2026;56:220. doi:10.1007/s10489-026-07233-x
>
> PANDIA: personalized neuro-symbolic multimodal fusion for interpretable neonatal
> pain assessment. *PLOS Digit Health.* 2026. doi:10.1371/journal.pdig.0001442
>
> Touchless monitoring of neonatal activity: a multi-center study. *Pediatr Res.*
> 2025. doi:10.1038/s41390-025-04294-5
>
> Beyond the face: advancing multimodal AI for neonatal pain assessment.
> *Pediatr Res.* 2026. doi:10.1038/s41390-026-04888-7
>
> Continuous wireless sensor monitoring with applied diagnostics: Clinical Sensor
> Pain Scale and Automated Sensor Pain Scale in the NICU. PMC12658508.
>
> Artificial intelligence based pain assessment technology in clinical application
> of real-world neonatal blood sampling. PMC9406884.

### Physiological indices

The NIPE monitor (Newborn Infant Parasympathetic Evaluation) derives an index from
high-frequency heart rate variability as a proxy for parasympathetic tone. A
systematic review in the *Journal of Pediatric Surgery* covers its use during
surgery and interventional procedures, and further work has examined analgosedation
adequacy in mechanically ventilated infants.

It is not implemented in TENDER, for a practical reason: it requires beat-to-beat
ECG access that a browser application on a NICU workstation does not have. The
`PhysiologicFeatures` interface reserves an `rmssd` field so that a future monitor
integration has somewhere to land.

> Newborn and Infant Parasympathetic Evaluation (NIPE) monitor for assessing pain
> during surgery and interventional procedures: a systematic review.
> *J Pediatr Surg.* 2024.

---

## 4. Why TENDER puts computer vision where it does

The published models predict a pain label. TENDER does not, and the reason is
methodological rather than cautious.

PIPP-R's three facial items are **not clinician impressions**. They are defined
operationally as the proportion of the observation window during which brow bulge,
eye squeeze and nasolabial furrow are present, banded at 0-9, 10-39, 40-69 and 70
percent or more. NFCS is defined the same way, as per-second binary coding summed
across an epoch.

No human at a bedside can measure the proportion of thirty seconds during which a
nasolabial furrow was present while also holding an infant and watching a monitor.
A per-second coder can, exactly.

So the model performs the coding the instrument already specifies, and hands the
result to the clinician as a proposed band with the measured proportion attached.
The instrument stays the published, validated instrument. The clinician stays the
scorer. The automation replaces the part of the task that was always being
approximated.

This also sidesteps the central problem with deploying the published models: their
0.90 AUC was measured on 45 infants at one centre, and there is no basis for
assuming it transfers. A tool that automates a defined measurement makes a claim
that can be checked directly, by comparing its coding against a trained human
coder, which is a study a single unit can actually run.

### Calibration to the individual infant

Two problems make absolute thresholds untrustworthy. The blendshape head in a
general-purpose face landmarker is trained overwhelmingly on adult and older-child
faces, and neonatal proportions differ, with preterm faces differing again. And
NFCS is defined relative to the infant's own resting face.

Both have the same answer. TENDER records a settled baseline epoch for each infant,
computes the median and a robust standard deviation (median absolute deviation
scaled by 1.4826) for each action, and codes an action present when activation
exceeds that infant's own baseline by k robust SDs, defaulting to 3. Without a
baseline the extractor codes nothing rather than guessing.

The 2026 literature converged on the same requirement from a different direction.
PANDIA's per-infant meta-learned adaptation buys 3.2 to 4.7 percentage points of
accuracy over its own non-personalised model, which is a large fraction of the
margin between a research result and a usable one. Their mechanism is learned
weights updated from 5 to 20 labelled examples; TENDER's is a median and a robust
spread from a settled recording, needing no labels at all. The mechanisms are not
comparable in sophistication. The premise behind them is the same, and it is the
premise this application is built on: there is no such thing as a resting neonatal
face in general, only this infant's.

### When no settled reference exists

Calibration against the infant's own resting face is the strongest option and it
is not always available. A procedure clip may start mid-handling; a unit may have
one photograph and no calm one.

Two weaker routes are offered, both labelled as weaker.

The material can reference itself: the median across everything supplied stands
in for the resting face, with the median absolute deviation for its spread. This
is the same robust estimator applied to a different window, and its weakness is
directional. If the infant was distressed throughout, the median is a distressed
face, thresholds sit too high, and actions go uncoded. The failure is toward
under-reporting pain, which is stated wherever a self-referenced reading appears
and travels with it into the export.

With no reference at all, a single photograph is read from geometry rather than
from blendshape activations, and the distinction is the whole argument.

A blendshape score is the output of a classifier head trained overwhelmingly on
adult faces. An absolute cut-off on it makes a claim about how that model behaves
on a 27-week infant, and nothing supports such a claim. Distances between
landmarks are different in kind: they measure the photograph. Expressed as a
fraction of interocular distance, the standard anthropometric normaliser and the
measure on a face least changed by expression, they remove camera distance and
most of face size. What remains varies between individuals, but far less than a
raw blendshape score does.

Three regions are read, and they are not equally trustworthy. Eye aperture and
lip separation are close to unambiguous, since an aperture near zero is a closed
or squeezed eye whoever the face belongs to. Brow-to-eye distance is the weakest,
because resting brow height genuinely differs between infants, so it carries about
a third of the weight of the other two and is labelled weak on screen.

The result is a level on the COMFORT behaviour facial tension scale, the same item
COMFORTneo uses. It never reaches level 1, because total relaxation is an absence
and a single frame cannot separate a relaxed face from a blink. It is uncalibrated,
not comparable between infants or sessions, and never fills a scale item on its
own. The reference bands live in one exported constant, `RELAXED_REFERENCE`, so
they can be argued with in one place; Study 2 of the validation plan is where they
would be tested.

The cloud assessor remains the stronger instrument for a single photograph, since
COMFORT facial tension is a judgement about one moment and a multimodal model
brings context that geometry does not. The geometric reading is what is available
when no key is configured, which on the public deployment is always.

### Where the model abstains

Honest failure is a feature. TENDER declines to produce a number when:

- No baseline exists for this infant.
- Fewer than about a third of the window's seconds were usable.
- The face is smaller than 18% of the frame, or turned more than 30 degrees.
- Audio SNR is too low to attribute a cry to this infant rather than the next cot.
- The action is `taut_tongue`, for which no signal exists in a general face
  landmarker. Any 7-action NFCS total is therefore reported as incomplete and is
  never offered as a score.

---

## 5. Regulatory position

See `PRIVACY-AND-REGULATORY.md`. The short version: the rules engine plausibly sits
inside the FDA's non-device CDS carve-out, and the camera-based component almost
certainly does not, because the first statutory criterion excludes software
intended to acquire, process or analyse a medical image or a signal from a signal
acquisition system.

---

## Sources

- [Neonatal pain assessment: do we have the right tools? — Front Pediatr 2022](https://www.frontiersin.org/journals/pediatrics/articles/10.3389/fped.2022.1022751/full)
- [Clinical thresholds in pain-related facial activity linked to cortical network activation — Pain 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10108588/)
- [Multimodal spatio-temporal deep learning for neonatal postoperative pain — arXiv 2012.02175](https://arxiv.org/pdf/2012.02175)
- [USF-MNPAD-I dataset](https://rpal.cse.usf.edu/project_neonatal_pain/dataset.html)
- [AI versus expert assessment in neonatal procedural pain — Sci Rep 2024](https://www.nature.com/articles/s41598-024-71278-6)
- [COMFORTneo validation](https://scispace.com/pdf/comfortneo-scale-a-reliable-and-valid-instrument-to-measure-3cjh57m1.pdf)
- [N-PASS clinical reliability and validity — Hummel 2008](https://portaldeboaspraticas.iff.fiocruz.br/wp-content/uploads/2017/09/Humell-2008-NPASS.pdf)
- [PIPP scoring table](https://meetinstrumentenzorg.nl/wp-content/uploads/instrumenten/PIPP-meetinstr.pdf)
- [WAT-1 instrument](https://cdn-links.lww.com/permalink/ccx/a/ccx_1_1_2020_10_12_bouajram_20-00155_sdc3.pdf)
- [NIPE monitor systematic review — J Pediatr Surg](https://www.sciencedirect.com/science/article/pii/S0022346823007406)
- [EDIN scale, prolonged pain in preterm infants](https://www.e-cep.org/journal/view.php?number=20125553464)
- [NIPS and N-PASS scoring tables](https://healthcare.ascension.org/-/media/project/ascension/healthcare/markets/wisconsin/ministry-health-care/pain-assessment--tools.pdf)
- [PFECIC: pain facial expressions dataset for critically ill children — Sci Rep 2025](https://www.nature.com/articles/s41598-025-02247-w)
- [SSS-TT: self-supervised sequential spatio-temporal transformers for neonatal pain — Appl Intell 2026](https://link.springer.com/article/10.1007/s10489-026-07233-x)
- [PANDIA: personalized neuro-symbolic multimodal fusion for interpretable neonatal pain assessment — PLOS Digit Health 2026](https://journals.plos.org/digitalhealth/article?id=10.1371%2Fjournal.pdig.0001442)
- [Touchless monitoring of neonatal activity: a multi-center study — Pediatr Res 2025](https://www.nature.com/articles/s41390-025-04294-5)
- [Beyond the face: advancing multimodal AI for neonatal pain assessment — Pediatr Res 2026](https://www.nature.com/articles/s41390-026-04888-7)
- [Continuous wireless sensor monitoring: Clinical and Automated Sensor Pain Scales in the NICU](https://pmc.ncbi.nlm.nih.gov/articles/PMC12658508/)
- [AI-based pain assessment in real-world neonatal blood sampling](https://pmc.ncbi.nlm.nih.gov/articles/PMC9406884/)
