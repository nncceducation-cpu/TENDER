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
