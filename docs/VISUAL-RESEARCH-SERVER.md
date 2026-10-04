# Visual research review setup

TENDER remains accessible from its GitHub Pages address. The optional visual review needs a server because a public browser build cannot keep an OpenAI API key secret.

Create a Render Blueprint from this repository's `render.yaml`, using the main branch. Enter OPENAI_API_KEY only in Render's private environment settings. Set OPENAI_MODEL to a vision-capable OpenAI model that supports the Responses API and structured JSON output. Set DEMO_ACCESS_TOKEN to a private demo access code; enter that code, not the API key, in TENDER. Node 24 is required. The service starts with `node server/visual-server.mjs`. `/health` reports readiness without secrets.

In TENDER's Images screen, expand “Connect your visual server”, enter the HTTPS Render service address and demo access code, choose a public or authorized photo, then press Send. Selection alone never transmits. Browser access codes live in component memory and are not included in exports. Changing screens clears connection fields. Images are relayed to OpenAI with `store:false`; this does not imply zero provider retention. Do not use identifiable clinical images without the relevant approvals and provider agreement.

The server enforces an allowed browser origin, demo token, payload limit, two simultaneous reviews, timeout and response consistency checks. It does not write photos to disk. Errors and uncertain or obscured faces never become a zero score. Hosting platform operational logs and provider retention are separate from application storage.

The free Render service may sleep when idle. Open and warm it before presenting. A conference demo needs reliable internet and a functioning provider account; test the actual demo computer before presenting.

The output is an investigational description and provisional COMFORT facial tension item (1–5), not a full COMFORTneo score or pain diagnosis. Photo scoring does not measure sustained behavior. No neonatal clinical accuracy claim is established by these software tests.

CSV and session JSON retain image SHA-256, sample filename, timestamp, model and prompt versions, exact model response text, observations, provisional item, reviewer item, latency and failures. Images are not embedded in those research records. Retain authorized originals separately to connect them through the hash. Raw model output is not raw physiological or muscle-activity data. A reviewer rating entered while seeing model output is not blinded ground truth. Clinical validation requires independently labelled data and a prespecified analysis.

Run `npm run verify` for the browser and contract tests and `node --test server/visual-server.test.mjs` for backend integration tests with simulated provider responses. Neither test suite sends photos to OpenAI or establishes clinical performance.
