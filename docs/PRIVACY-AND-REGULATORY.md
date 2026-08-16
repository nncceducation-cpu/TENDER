# Privacy and regulatory position

Written for the protocol owner and whoever takes this to the research ethics board
and to Alberta Health Services information management. It states a position; it is
not legal or regulatory advice, and it has not been reviewed by anyone qualified to
give either.

---

## 1. What the application handles

| Data | Where it lives | How long |
| --- | --- | --- |
| Camera frames | Browser memory, GPU or WASM buffer | Duration of the capture window |
| Audio samples | Browser memory | Duration of the capture window |
| Facial landmarks and blendshapes | Browser memory | Per frame, discarded after coding |
| Coded action counts and proportions | Browser memory | Session |
| Scale scores, bands, workings | Browser memory | Session |
| Local identifier (bed or study code) | Browser memory | Session |
| Audit log | Browser memory | Session |

Nothing is written to `localStorage`, `sessionStorage`, IndexedDB, cookies or the
file system. Nothing is transmitted. There is no server, no analytics and no
telemetry. Closing the tab destroys the session, deliberately.

The previous version wrote the full patient record, including allergies, current
medications and past medical history, to `localStorage` under a fixed key. That is
the single change with the largest privacy consequence.

## 2. Alberta Health Information Act

Continuous video of an identifiable infant in a NICU is health information about an
identifiable individual, and the infant's parent or guardian is the one who can
consent to its collection.

The design choice that follows is architectural rather than procedural: because the
pixels never leave the device and are never persisted, the collection that occurs
is transient processing rather than a recording. Whether an REB accepts that
framing is their decision, and the framing should be put to them explicitly rather
than assumed. Two questions to take to them:

1. Does transient, non-recorded, on-device video processing constitute collection of
   health information requiring consent, and if so, at what point in the workflow
   should that consent be sought?
2. Does the export function, which contains coded scores and a local identifier but
   no name, MRN or date of birth, constitute de-identified information for the
   purpose of secondary research use?

If validation work is planned, video **will** need to be recorded so that human
coders can score the same epochs. That is a different collection with a different
consent requirement, and it should be scoped as a separate protocol rather than
folded into clinical use.

## 3. FDA: is this a device?

Section 520(o)(1)(E) of the FD&C Act exempts software meeting four criteria. FDA's
guidance was revised in 2026; the criteria are:

1. Not intended to acquire, process or analyse a medical image, or a signal from an
   in vitro diagnostic device, **or a pattern or signal from a signal acquisition
   system**.
2. Intended to display, analyse or print medical information about a patient.
3. Intended to support or provide recommendations to a healthcare professional
   about prevention, diagnosis or treatment.
4. Intended to enable the professional to **independently review the basis** for the
   recommendations, so that it is not the intent that they rely primarily on them.

All four must be met.

### The rules engine

Plausibly non-device. It displays medical information, supports recommendations, and
the entire application is built so that the basis is reviewable: every total prints
its workings, every threshold names its source, every instrument carries its
validation population and its caveats, and every conversion states the ratios used.
The 2026 revision also relaxed the earlier expectation that a tool present multiple
options, permitting a singular recommendation where clinically appropriate, which
fits a protocol-driven taper.

The area to watch is criterion 4 and time-critical use. The 2026 revision moved the
time-critical consideration into criterion 4, on the reasoning that a decision made
under time pressure cannot be independently reviewed. FDA has not defined
time-critical. Routine q3h scoring is clearly not; a rescue-dose prompt during an
acute deterioration is arguable.

### The camera-based component

**Very likely a device function.** Criterion 1 excludes software intended to acquire,
process or analyse a medical image or a pattern from a signal acquisition system.
Facial video processed to extract clinical action units is difficult to
characterise as anything else.

The practical consequences:

- The facial coding layer should be treated as **investigational** and used under an
  approved research protocol, not as routine clinical software, until a regulatory
  path is settled.
- It should not be the sole basis of a dosing decision, which is why the application
  never auto-commits a suggestion and always records whether an item was
  clinician-scored or model-accepted.
- If it later becomes a product, the pathway is Software as a Medical Device, with
  the associated quality system, clinical evaluation and post-market surveillance.

### Health Canada

Health Canada's SaMD framework broadly parallels FDA's risk classification. A tool
influencing analgesic dosing in neonates would not sit at the lowest class. Class
determination should be sought formally before any use beyond a research protocol.

## 4. Model transparency

Every model in the application carries a model card (`ModelCard` in
`src/ai/painModel.ts`) recording what it was trained on, in which populations,
what performance has been measured, its known limitations, and whether it has been
calibrated at this site. The shipped `TransparentIndex` states plainly that it is
unvalidated and that no sensitivity, specificity or AUC is claimed, because none has
been measured. `calibratedAtThisSite` defaults to false and the interface makes that
impossible to hide from the user.

No trained weights ship with this repository. That is deliberate: a model whose
0.90 AUC was measured on 45 infants at one centre has no established transfer to
another, and shipping it would invite exactly the reliance criterion 4 is meant to
prevent.

## 5. Instrument licensing

Before clinical deployment, record the unit's licence or registration for each
instrument in `docs/INSTRUMENT_LICENCES.md`. N-PASS in particular is copyrighted
(P. Hummel, Loyola University) and the anchor text in this repository is
abbreviated bedside prompting, not the licensed table.

## 6. Security posture

- No authentication, because there is nothing stored to protect. Access control is
  whatever controls the workstation.
- No network calls at runtime. Model assets are served from the application's own
  origin, staged by `npm run fetch:models`, and pinned by SHA-256.
- Camera and microphone require an explicit click each time. There is no persistent
  capture and no background mode.
- The audit log is hash-chained so that an edited export is detectable, and
  `AuditLog.verify()` returns the index of the first tampered entry.
- Serve over HTTPS. `getUserMedia` requires a secure context, and on a hospital
  network the application should be served from an internal origin rather than a
  public one.

## 7. Open questions to resolve before any patient use

1. REB position on transient on-device video processing, per section 2.
2. Whether the facial layer is disabled entirely for routine clinical use and
   enabled only under a research protocol.
3. The clinical decisions listed in `REVIEW_FLAGS`, in particular the fentanyl
   equianalgesic ratio and the breakthrough dose conflict.
4. Instrument licences.
5. Whether AHS information management requires a privacy impact assessment for a
   browser tool that neither stores nor transmits.

## Sources

- [FDA revised CDS software guidance, five key takeaways](https://www.cov.com/news-and-insights/insights/2026/01/5-key-takeaways-from-fdas-revised-clinical-decision-support-cds-software-guidance)
- [FDA clinical decision support software FAQs](https://www.fda.gov/medical-devices/software-medical-device-samd/clinical-decision-support-software-frequently-asked-questions-faqs)
