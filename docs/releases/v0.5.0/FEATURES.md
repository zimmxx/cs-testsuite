# CORNERSTONE Wafer Post-Processing Suite
# Features Reference
# Version: v0.5.0

**Created by:** Aiman Hazim Shafizam — Research Technician, Testing and Characterisation, CORNERSTONE

## Release Summary

Version `v0.5.0` adds an evidence-led intelligence layer to the existing wafer-analysis workflow. Deterministic screening remains local and visible, while Gemini is used only as an optional interpretation layer over compact diagnostic evidence.

## AI Diagnostics Workspace

- failed-chip identification using the active propagation-fit MSE criterion
- local screening of transmission spectra for ripple or oscillation
- abrupt-discontinuity and high-spectral-roughness indicators
- explicit hypotheses with measurement and process-verification caveats
- comparison of selected GitHub-library datasets by MPW, slot, average propagation loss, yield, and measured-chip count
- four engineering-question presets plus editable free-text questions
- compact evidence payloads that exclude complete raw spectra

## Implemented Models

- `gemini-3.1-flash-lite` — default low-consumption model with a 900-token application output limit
- `gemini-3.5-flash-lite` — shortest configured response with a 700-token output limit
- `gemini-3.6-flash` — balanced background model with a 900-token output limit
- `gemini-3.7-flash` — highest-capability option with a 1,400-token output limit

The server validates every requested model against an allow-list. Unsupported model names fall back to the default.

## Logging and Evaluation

- **Save to Gemini logs for evaluation** is enabled by default
- Lite-model requests use `store: false` when logging is disabled
- background-model requests use temporary storage for polling and request deletion after completion when logging is disabled
- saved interactions may be reviewed in Google AI Studio and curated into an evaluation dataset
- saved logs do not automatically train or fine-tune Gemini

## API and Security Architecture

- local development reads `GEMINI_API_KEY` from `.env.local`
- the Vite development proxy keeps the key out of React/browser code
- `functions/api/ai.js` provides the server-side production handler for a server-capable host
- `.env.local` and `.env.*.local` remain ignored by Git
- the empty `.env.example` template is safe to commit
- GitHub Pages cannot securely contain an API key because it is a static host

## Existing Analysis and Library Features

All `v0.4.0` capabilities remain available, including:

- propagation-loss, insertion-loss, and heater-efficiency analysis
- linked spectra, fit inspector, wafermap, and chip selection
- dataset-derived editable wafermap scaling
- GitHub-library dashboard, snapshots, comparison, and conversion tools
- CD-SEM overlap review
- standard and advanced spectrum viewers
- PowerPoint, Word, PDF, PNG, HTML, and figure-generation workflows where supported

## Engineering Limitations

- AI explanations are advisory and require engineering verification
- spectral appearance alone cannot prove sidewall roughness, lithography, etch, contamination, or another fabrication root cause
- free-tier availability is controlled by per-project model quotas
- free-tier data terms and institutional rules must be reviewed before restricted data is submitted
- public deployment still requires authentication, rate limiting, origin controls, and a server-side secret store
