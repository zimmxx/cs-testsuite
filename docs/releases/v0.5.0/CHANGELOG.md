# Changelog
# Version: v0.5.0

**Release prepared by:** Aiman Hazim Shafizam — Research Technician, Testing and Characterisation, CORNERSTONE

## Added

- AI Diagnostics workspace and Intelligence navigation group
- deterministic transmission-spectrum anomaly screening
- failed-fit, anomaly, and severity summaries at wafer and chip level
- selectable Gemini 3.1 Flash-Lite, 3.5 Flash-Lite, 3.6 Flash, and 3.7 Flash models
- compact AI evidence payload and cautious silicon-photonics interpretation prompt
- MPW batch-selection and comparison workflow using GitHub-library analytics
- checked-by-default Gemini logging control for evaluation
- local Vite Gemini proxy and server-side deployment function
- `.env.example` for safe configuration
- AI Diagnostics Intelligence Guide
- revised `v0.5.0` stakeholder presentation and release documentation

## Changed

- bumped the application package version from `0.4.0` to `0.5.0`
- updated in-app Help links to the `v0.5.0` feature guide and changelog
- updated the README current-release summary and documentation index
- updated the project history, versioning guide, and suggested roadmap
- reserved higher-consumption Flash models for optional escalation while keeping 3.1 Flash-Lite as the default

## Security and Data Handling

- Gemini credentials remain server-side and are not exposed through `VITE_*` variables
- `.env.local` remains excluded from Git
- complete raw spectra are excluded from Gemini requests
- model requests are restricted by a server-side allow-list
- unchecked background interactions request deletion after polling completes

## Validation

- production Vite build
- local browser smoke test at `http://127.0.0.1:5173/`
- AI Diagnostics page identity, rendered-content, model-selection, and logging-toggle checks
- harmless stored and non-stored Gemini request checks
- documentation link and version-consistency audit
- full-slide render, layout, placeholder, and template-fidelity checks for the revised presentation
