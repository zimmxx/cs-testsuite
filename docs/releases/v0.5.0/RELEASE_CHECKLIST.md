# Release Checklist
# Version: v0.5.0

## Completed Locally

- [x] Package and current-release documentation use `v0.5.0`.
- [x] AI Diagnostics feature, changelog, architecture, model, quota, API-key, logging, and evaluation guidance are documented.
- [x] `.env.local` remains ignored and no Gemini-like API-key pattern is present in tracked files.
- [x] In-app Help links point to the `v0.5.0` release documents.
- [x] Stakeholder presentation exists at `docs/CORNERSTONE_Wafer_Post-Processing_Suite_Overview_v0.5.0.pptx` and every slide is rendered and reviewed.
- [x] Production Vite build passes locally.
- [x] AI Diagnostics renders without a framework error overlay.
- [x] The model selector contains all four allowed Gemini models.
- [x] Save to Gemini logs for evaluation is checked by default and toggles correctly.
- [x] Harmless stored and non-stored API checks return the expected storage status.
- [x] No relevant browser console warnings or errors are present in the tested flow.
- [x] Static production build does not call the unavailable GitHub Pages `/api/ai` route when no backend URL is configured.
- [x] Separate-backend CORS preflight and missing-secret responses have been verified locally.

## Release Gate Still Required

- [ ] Review the final diff and binary sizes.
- [ ] Confirm the production hosting and secret-management approach.
- [ ] Deploy the protected backend and set GitHub repository variable `VITE_AI_API_URL` to its HTTPS URL.
- [ ] Confirm data-governance approval for external AI processing.
- [ ] Commit only approved application, documentation, screenshot, and presentation paths.
- [ ] Receive approval before pushing `v0.5.0` to `main`.
