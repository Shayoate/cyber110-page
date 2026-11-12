# Validation

Checked in Chromium with Playwright:

- Empty input validation and focus.
- All ten dimensions and all fifty rubric anchors.
- Explicitly labeled illustrative example ratings.
- Editing scores and notes, including human-review flags.
- CSV and JSON downloads and their contents.
- Exclusion of the full email from exports (short evidence quotes are included).
- Invalidation of old ratings when the email changes.
- Manual scoring without a model download.
- Clearing the email and displayed results.
- Desktop and 390-pixel mobile layouts, with no horizontal overflow.
- No uncaught page errors in the tested UI flows.

Core rubric checks covered missing ratings, invalid scores, confidence capping, exact-quote filtering, prompt data separation, and CSV formatting. AI integration was tested using a simulated engine response to exercise model initialization options, prompt submission, result rendering, and validation. Simulated responses are test fixtures and do not establish model accuracy.

Actual model inference was not tested: the available headless Chromium exposed WebGPU but returned no GPU adapter. Real-world performance, download time, score quality, and GPU compatibility therefore remain unverified. This limitation does not affect the manual review workflow.

The WebLLM package version and chosen model entry were checked against the published package. No real business-study data or paid API was used. The site has not been published to GitHub Pages; deployment requires uploading the static files to a repository and enabling Pages as described in README.md.
