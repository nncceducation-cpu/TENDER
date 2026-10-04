# Photo scoring correction 2.8.2

Repeated user-reported calm sleeping photographs were incorrectly labelled COMFORT facial tension 4/5 and 3/5. Limiting eyelid contribution did not resolve the unsupported conversion of geometric distances into muscle tension.

The production still-analysis pipeline no longer invokes the experimental geometry-to-COMFORT reader. Automatic facial assessments, alternate levels and score proposals are always unavailable. Raw geometric measurements remain separate from clinical items. The report removes tension percentages, severity chips, instrument scores and annotated score overlays. Technical landmark quality is expressly not pain confidence.

The single-image option remains available as image review without a baseline. Users can confirm observed relaxed facial muscles at 1/5; another level can be entered in the instrument form. The confirmation keeps clinician provenance and does not infer a complete pain total. Calibrated NFCS coding is unchanged. No medication rules changed.

Regression checks cover both screenshot geometries, open-eye geometry and strong geometric deviations: none may produce an automatic COMFORT item. These establish removal of false numeric claims, not automatic neonatal pain recognition. The tool still has no validated neonatal pain classifier. Historical heuristic tests are retained, but that heuristic is not called by production photo analysis.
