# TENDER 2.7.0 release verification

Performed 3 October 2026 on Windows, Node 24.19.0 and Edge with the real pinned
MediaPipe face landmarker. This is software robustness testing, not clinical
validation. No photo has an expert pain label, and no accuracy, sensitivity,
specificity or AUC is claimed. Software release status does not imply readiness
for patient care.

## Automated matrix

All 275 tests in 11 files passed, including these bounded stress cases:

| Matrix | Coverage | Result |
| --- | --- | --- |
| Legal instrument inputs | 81,800 combinations across all eight instruments, spontaneous breathing and invasive ventilation, at the stated synthetic patient context | Finite totals and defined bands throughout |
| Facial geometry | 9,471 eye/mouth/brow combinations, each at 512 and 2048 pixels | Finite, bounded, scale-invariant measurements |
| Audio tones | 12 frequencies, three amplitudes, three sample rates: 108 cases | In-band tones within 3%; tested out-of-band tones declined |
| Temporal summaries | 30 duration/rate combinations, 84,040 frames in total; 1–600 seconds and 1–60 fps | Identical per-second sums |
| Missing/invalid pain with withdrawal | 156 combinations of exposure, WAT-1 and absent/nonfinite N-PASS | High withdrawal retained; no reassuring continue headline with outstanding pain assessment |
| Malformed inputs | Empty/nonfinite landmarks, invalid dimensions and pose, invalid timestamps, quality, durations, calibration and clip ranges | Abstention or explicit rejection |

The audio cases use 80, 120, 180, 250, 310, 350, 450, 600, 700, 800, 1000 and
1200 Hz; amplitudes 0.01, 0.1 and 1; sample rates 16, 44.1 and 48 kHz. They are
pure-tone bench tests, not a source-separation or neonatal cry accuracy study.
The existing harmonic, noise and direction tests also pass.

`npm ci` was executed during the preceding local verification; dependencies did
not change for this release. `npm run verify` passed with typechecking, lint,
275 tests and a production build. Existing non-blocking warnings concern a
Fast Refresh export and bundle size. GitHub CI independently installs from the
lockfile, runs verification and builds the public configuration with pinned model
assets before merge.

## Public-photo checks

Sources and attribution:

- [Elene crying](https://commons.wikimedia.org/wiki/File:Elene_crying.jpg),
  Jotermin, own work, CC BY-SA 4.0. Original SHA-256:
  `6d2cc895b0b59f357a1adf65a8db7722892e61854ad3516f3d4454419baec7c4`.
- [Sleeping baby](https://commons.wikimedia.org/wiki/File:Sleeping_baby_(6410829477).jpg),
  Toshiyuki IMAI / matsuyuki, CC BY-SA 2.0. Original SHA-256:
  `961e5c0127404713ae3d2b8944874de4dc73c0cae587b7cea51fe390d709f065`.

Images stayed in an ignored local test directory. Neither originals nor altered
photos are published with the app. `scripts/prepare-stress-photos.py` reproduces
the transformations with Pillow: maximum dimension 1200; quarter-size; brightness
0.12; Gaussian blur radius 10; rotation 45 degrees; mirror; and EXIF-normalised
orientation. The crying original has EXIF orientation 6, so both the as-encoded
raster and upright raster were checked. A blank 800×600 image is the negative
control. These unrelated images were **not** declared a time sequence or used to
establish an infant baseline.

| Case | Crying photo | Sleeping photo |
| --- | --- | --- |
| As-encoded, resized raster | No face detected | Level 2–3 boundary; no single-level proposal |
| Quarter-size | No face detected | Face detected, quality 0.30; no level |
| Dark | No face detected | No face detected |
| Blurred | No face detected | No face detected |
| Rotated 45° | No face detected | No face detected |
| Mirrored | Level 2, quality 0.64, small/off-axis warnings | Level 3, quality 1.00 |
| EXIF-normalised upright | No face detected | Level 2–3 boundary; no single-level proposal |

Blank control: no face, no level. All fifteen input cases now appear explicitly
in the report. Ten withhold a geometric level; five display a geometric reading.
These are observed software outputs, not correct clinical labels. In particular,
the sleeping photo can display tension and the mirrored crying photo can display
normal tone. The detector also changes whether it finds a face after mirroring.
Those failures prevent any claim that this layer establishes or excludes pain.
No thresholds were tuned to fit these two photographs.

## Repairs triggered by testing

- Finite, complete landmarks and positive image dimensions are required before
  quality assessment and geometry. Invalid pose matrices are declined.
- Malformed summaries and calibration settings cannot produce facial suggestions
  or a facial index contribution. Invalid pain/withdrawal numbers count as
  outstanding assessments.
- Frames outside the requested half-open window are excluded; clip sampling no
  longer includes the ending instant as an extra second. Invalid clip ranges and
  frame rates are rejected before seeking or inference.
- A 1200 Hz tone at 16 kHz was reported as 400 Hz. Higher-order period aliases
  are now declined in addition to the existing octave guard.
- No-face images no longer disappear from a mixed report. Low-quality cases
  show their actual rejection reasons. Exposure/contrast limitations are visible.
- Unstable geometric readings retain their range and cannot propose one definite
  level. The annotated-image caption carries the same range as the screen.
  Every still reading states the sleep/blink/cry/pain ambiguity. Browser automation
  could not confirm the final image download, so download completion is not claimed.

No dose or clinical threshold changed. The site displays **2.7.0 · research use**
and a **Research software release. Not for patient care.** notice.

## Limits

The legal-input enumeration is exhaustive for the instruments' option lattice
and the two specified ventilation contexts; it is not an exhaustive test of all
patient contexts, devices or possible media. Hardware camera/microphone capture,
cross-browser performance, real neonatal video decoding, labelled patient data,
clinical calibration and regulatory review remain outside this verification.
The ONNX model slot ships no trained weights. Exposure and contrast are not
measured by the landmark quality gate. Public photos cannot close those gaps.
