# Public media robustness library

This is a software test library, not a training set or a clinical validation dataset. Source captions describe scenes; they are not expert pain labels. The original media are not bundled into the public TENDER website.

`MEDIA-LIBRARY-2.8.0.json` records the 14 photographs and two original clips, source pages, authors, selected licenses, downloaded URLs, file sizes and SHA-256 hashes. Three photos use official Wikimedia thumbnails after original downloads were throttled. Older infants are deliberate robustness examples outside the neonatal population. Derivatives retain the source license; no author endorses TENDER.

## Cases

Each photo produces 29 variants: a base image with EXIF orientation applied and maximum dimension 1200 pixels, reflection, grayscale, four sizes, five brightness settings, four Gaussian blur radii, six rotations, four half-frame occlusions and three JPEG quality settings. Four blank/noise controls, two damaged files and three duplicated-face composites bring the photo matrix to 415 files.

Two real clips supply 88 extracted expression-phase frames at 2 frames per second. These frames are correlated observations from two recordings, not 88 additional infants. Ten 5-second derived clips test reflection, darkening, blur, rotation and low resolution. They are derivatives, not additional original videos.

## Reproduce

1. Install the project's dependencies, stage its pinned model and start the local development server. The scripts are listed in `package.json`.
2. With Python and Pillow available, run `python tools/prepare-media-cases.py`. Add `--download` to obtain missing public originals. Downloads stop on HTTP 429 rather than bypassing the host's rate limit. Add `--ffmpeg` followed by an official FFmpeg executable path to create clip frames and variants. A changed source hash stops processing for review.
3. Open `/tools/photo-bench.html` on the local development server. Select the files from `node_modules/.stress-assets/expanded` and run the benchmark. Repeat with `clip-frames`. The mixed-batch button tests good and damaged inputs in the same production call.
4. Open `/tools/clip-bench.html` and select the original clips and the WebM conversion of the OGV clip. It performs passes at 4, 15 and 4 fps: both 4 fps passes cover the full recording; the 15 fps pass covers up to the first ten seconds. It reuses the service to test repeated analysis, with production code resetting the tracker for each pass. `/tools/clip-variants-bench.html` samples the ten derivatives at 4 fps.
5. Save the results text. All three browser benches import the production analysis modules and use the pinned local model. They are development pages excluded from the production build. No camera, microphone, remote inference or media upload is required.

Bench output distinguishes detection, quality rejection, inconsistent measurements and processing errors. It cannot establish sensitivity, specificity, clinical pain accuracy, fairness or suitability for patient care. In particular, exposure, blur and obstruction remain unmeasured quality dimensions; detecting a face does not validate those dimensions. No clinical thresholds or medication rules are tuned to these public images.
