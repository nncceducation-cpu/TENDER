# Instrument licences

To be completed locally before clinical deployment. Each instrument implemented in
`src/data/scales/` is listed with what needs to be on file.

| Instrument | Rights holder | What is required | Status |
| --- | --- | --- | --- |
| NIPS | Lawrence et al. / Neonatal Network | Attribution; confirm reproduction terms for the anchor text | **Not confirmed** |
| PIPP-R | Stevens, Gibbins et al. | Permission for use and reproduction; a licence exists for some commercial contexts | **Not confirmed** |
| N-PASS | P. Hummel, Loyola University | Copyrighted. Anchor text in this repository is abbreviated bedside prompting, not the licensed table. Obtain the licensed copy and replace the `anchor` strings in `src/data/scales/npass.ts` | **Not confirmed** |
| COMFORTneo | van Dijk et al., Erasmus MC | Registration via comfortassessment.nl | **Not confirmed** |
| EDIN | Debillon et al. | Attribution; published in ADC F&N | **Not confirmed** |
| NFCS | Grunau & Craig | Attribution; coding manual and training are separate | **Not confirmed** |
| WAT-1 | Franck, Curley et al. | Free for non-commercial clinical and research use with attribution and registration through the authors | **Not confirmed** |

## Also record

- MediaPipe face landmarker model: Apache 2.0, pinned by SHA-256 in
  `scripts/fetch-models.mjs`.
- `@mediapipe/tasks-vision`, `onnxruntime-web`: check licences in `node_modules`
  before distribution.
- The application itself has no licence yet. Add one.

## Why this file exists

Anchor text in this repository was written for bedside prompting and is not a
substitute for a licensed copy of any instrument. Where the wording differs from
the licensed table, the licensed table governs, and the code should be edited to
match it.
