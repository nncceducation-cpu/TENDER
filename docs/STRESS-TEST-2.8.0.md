# TENDER 2.8.0 — expanded public-media robustness tests

Date: 3 October 2026. This report describes software robustness checks. It does not establish clinical accuracy or suitability for patient care. No clinical thresholds, medication doses or protocol eligibility rules were changed in this release.

## Library and method

The library contains 14 source photographs and two source recordings. Source descriptions include crying, sleeping, smiling, yawning, premature infants, CPAP, ventilation and phototherapy. An 8.5-week-old photo and a seven-week-old clip are deliberate examples outside the neonatal population. Source descriptions are not pain ground truth.

The final browser matrix processed 503 image files: 415 photo cases (29 variants per source photo plus nine negative/ambiguity controls) and 88 frames extracted from the clips at 2 fps. Transformed cases and correlated video frames are not additional infants.

Clip checks include both original formats, a WebM conversion of the OGV recording and ten five-second transformed clips. Original-content passes use 4 fps over the full recording, 15 fps over up to ten seconds, then 4 fps over the full recording again. Derived clips use 4 fps. Original OGV rejection is an expected browser-format outcome; its converted video supplies the actual frame test.

The browser benches import the production modules and use the pinned local MediaPipe model. No remote inference, camera or microphone is involved. Source URLs, authors, licenses and downloaded-file SHA-256 hashes are in [the library manifest](MEDIA-LIBRARY-2.8.0.json). The task model remains pinned to SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.

## Findings and repairs

- **Repeated clip analysis:** restarting a sampling counter on a reused VIDEO detector caused timestamp mismatch errors and poisoned subsequent passes. The service now maintains increasing timestamps within a detector lifetime. Offline passes also start with fresh tracking state so a new clip does not inherit another clip's tracking or inference errors.
- **Unsupported video:** the browser exposed a duration for the OGV recording but zero video dimensions. Sending that element to the model caused a zero-size ROI error. Sampling now rejects recordings without decodable video frames before inference, with an MP4/WebM explanation. It also checks dimensions after each seek.
- **Stalled seek:** cancellation previously ran only between frames. Seeking now has a ten-second timeout, responds to cancellation during the wait and removes its event handlers. An already decoded frame at the requested time does not wait for an event that might never fire.
- **Multiple faces:** the detector previously requested one face, silently selecting a person from a two-face composite. Both detector modes now request up to two faces. Quality, cropping, geometry and action extraction reject ambiguity; raw activations are unavailable rather than attributed to the first person. The previously scored `meek__two-faces.jpg` is now rejected with an explicit explanation.
- **Damaged image batches:** decoding one damaged file previously rejected the whole call. Each damaged image now receives its own unavailable result; good images before and after it retain their original indexes.
- **Unverified resampling:** a failed second-scale reading could still be labelled stable. Failure now withholds the level. A measured second scale with a different level still reports a boundary and offers no single-level proposal.
- **Reflection:** the original sleeping photo read level 3 while its reflection read level 2; the yawning photo read 5 while its reflection read 4. The new reflected-crop check withholds measurements it cannot reproduce. Both original/reflected sleeping and yawning cases were withheld in the final run.
- **Duplicate filenames:** image overlays previously looked up the last matching filename. They now use the original image index. Regression tests preserve good/damaged/good ordering, including identical filenames.
- **Coverage denominator:** rounded estimates could undercount a partial final sampling interval. Estimated and actual samples now agree; a 0.6-second interval at 4 fps contains three samples, not two.

## Observed image results

| Outcome | Photo matrix before | Photo matrix after | Extracted clip frames after |
|---|---:|---:|---:|
| No face detected | 201 | 195 | 25 |
| Face found, level withheld | 87 | 161 | 55 |
| Stable measured level | 116 | 58 | 8 |
| Boundary reading, single-level proposal withheld | 9 | 1 | 0 |
| Processing exception | 2 | 0 | 0 |
| Total | 415 | 415 | 88 |

The final photo matrix had 20 reflection failures and 40 unsuccessful secondary-scale checks. All blank/noise, damaged-file and two-face controls produced no facial level. All returned quality values were finite and inside 0–1. No returned level had quality below the existing 0.45 gate. These are robustness invariants, not accuracy estimates. The greater number of withheld readings is intentional; detection alone cannot support a measurement that fails a reproducibility check.

The actual React screen was also exercised with a usable public photo, a corrupt file and a two-face image in one batch. It displayed the usable photo's report and separate reasons for withholding the other two. This verifies the production screen in addition to the module benches.

The final clip matrix completed 19 passes over 13 files derived from two original recordings: six successful original-content passes, ten successful transformed-clip passes and three expected OGV format rejections. The successful passes attempted 854 frame samples. None produced a detector graph error. The OGV recording was rejected before inference with the requested format explanation.

Repeatability is not exact: the active-sleep clip's two full 4 fps passes yielded 106/86 and 107/87 detected/usable frames despite fresh tracking state. The converted Moro clip yielded 14/8 in both full passes. This residual one-frame difference is recorded, not hidden or interpreted as clinical agreement. The library cannot determine whether frame selection, detector numerics or their interaction explains it.

Full per-case outputs and clip pass results are preserved in [the bench results](MEDIA-BENCH-RESULTS-2.8.0.json). [Reproduction instructions](MEDIA-TESTING.md) and development bench pages are committed. The local downloadable library additionally preserves originals, derivatives, expression-phase frames, before/after exports and an attributed gallery. Media-host HTTP 429 responses stopped further acquisition; failed downloads are not counted as tested files.

## Verification and limits

The local verification suite passes: typecheck, lint, 289 tests and production build. It includes the existing 81,800 legal score combinations, 9,471 synthetic geometry combinations and cry-signal matrices, plus new regressions for media ambiguity, corruption, reflection, timestamps, tracking resets, partial sampling intervals and cancellation. Existing nonblocking warnings remain for the Gauge module's development refresh exports and the application bundle size.

The library has no independently labelled clinical pain scores, so no sensitivity, specificity, AUC or accuracy is reported. It has no sufficient representation to establish fairness by gestational age, skin tone, respiratory support or site. Exposure, contrast, blur and obstruction are not measured quality dimensions; face detection and a quality value of 1 do not validate them. The application now explicitly requests review of sharpness and visibility. Difficult equipment-obscured and oblique faces frequently yielded no usable level.

This release is live research software. Clinical validation remains outstanding. The public media were used for testing, not model training; no clinical cutoff was fitted to these photographs.
