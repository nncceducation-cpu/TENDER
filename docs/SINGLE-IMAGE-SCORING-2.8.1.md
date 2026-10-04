# Single-image scoring and sleep correction - 2.8.1

In Static analysis, choose **Score one image without a baseline**, select one photograph, and press **Score this image**. Settled-baseline coding remains the default. The optional geometric COMFORT facial item is experimental, uncalibrated and requires manual acceptance; it is not a complete pain score or an NFCS epoch.

## Sleeping-infant regression

The user supplied a report screenshot showing eye aperture 0.013, mouth opening 0.005 and brow distance 0.271, alongside a reported calm sleeping infant. The old geometry assigned eye tension 100%, weighted tension 51.28% and facial tension 4/5, despite no mouth or brow contribution. Eyelid aperture was being mistaken for muscle contraction.

The exact displayed geometry now produces **no automatic level**. Isolated lid closure contributes no tension and cannot be offered to the instrument. Where other regions contribute, the eyelid contribution is capped at the strongest independent region. This conservative heuristic is not a validated eye-squeeze detector. No reference-band cutoffs or medication rules were changed. Quality, multiple-face and scale/reflection rejection remain in force.

The report allows **I confirm relaxed facial muscles - offer 1/5**. This explicitly records the user's observation, not a model prediction. The scoring form accepts it as clinician-derived facial tension, with other items still unscored. Sleep alone is not used to infer a complete pain total. Audit provenance distinguishes the confirmation from an automatic estimate.

The original photograph was not separately supplied, so the exact original pixels were not reprocessed. The regression uses the measurements visible in the screenshot. Real-browser testing also used the public sleeping test photo `sleeping__jpeg50.jpg`: its automatic level was withheld; manual relaxation confirmation offered level 1; COMFORTneo accepted the fully relaxed facial item without scoring the remaining items.

## Photo checks

411 JPEG cases from the existing public-media test library were rerun against the pinned model and production analysis. All completed without a thrown error. The sleeping source family has 30 variants: all automated outputs were withheld or level 2, with no 4/5 or 5/5. These are software robustness checks, not expert-labelled clinical accuracy measurements. See PHOTO-REGRESSION-2.8.1.json for per-case outputs. Rejecting a case is not detecting absence of pain.

## Instrument coverage review

TENDER calculates PIPP-R, NIPS, N-PASS, COMFORTneo, CRIES, EDIN and NFCS-P-3. WAT-1 measures withdrawal separately. The revised PIPP-R retains its zero-core contextual rule; original PIPP is not separately calculated. Its Gibbins validation PMID was corrected from 24491306 to 24491511.

BIIP (Behavioral Indicators of Infant Pain) was missing from the evidence library. Its original validation combines sleep/wake state, five facial actions and two hand actions. It is now included in the comparison and explicitly listed as not yet calculated. The complete scoring sheet and interpretation have not been verified, so no guessed BIIP calculator or automatic hand/state classifier was added. If BIPP refers to a different instrument, that identification remains unresolved.

Sources: [Holsti and Grunau 2007](https://pubmed.ncbi.nlm.nih.gov/17382473/), [Gibbins et al. 2014](https://pubmed.ncbi.nlm.nih.gov/24491511/).

## Verification

Automated regression checks cover the screenshot geometry, isolated partial/full lid closure, small independent contributions, retained multi-region proposals, withheld report outputs and clinician/model provenance. All 295 tests, typecheck, lint and production build pass. Browser checks cover the single-image option, warning, withheld sleeping image and manual relaxed-item acceptance. Existing lint and bundle-size warnings are unchanged.
