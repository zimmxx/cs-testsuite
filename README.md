# CORNERSTONE Wafer Post-Processing Suite

Unified web application for processing and analysing optical and electrical silicon photonics wafer measurements.

**Created by:** Aiman Hazim Shafizam — Research Technician, Testing and Characterisation, CORNERSTONE

This app is designed to unify two measurement routes into one analysis pipeline:

- Wafer-scale tester exports, typically from `.txt` or delimited text files
- Manual wafer measurements, typically from `.xlsx` or `.xls` spreadsheets

The app translates uploaded measurement data into a normalized internal schema, then uses that shared dataset for:

- Propagation loss analysis in `dB/cm`
- Insertion loss analysis in `dB`
- MZI heater efficiency analysis in `mW/pi`
- Wafermap visualization
- Report preview and export-ready reporting state
- PowerPoint slide generation for chip-by-chip post-processed reviews
- GitHub-hosted dataset library management
- Cross-dataset comparison for wafer/process variation studies
- Coordinate-based CD-SEM data import, wafer mapping, and overlap review against propagation-loss chips
- Dashboard views for published MPW, slot, platform, and measurement-library coverage
- Filename and manual-measurement conversion into standardized trace names
- Spectrum Viewer for flexible uploaded trace inspection
- Spectrum Viewer (Advanced) for wavelength-window zoom, vertical axis control, and trace diagnostics
- Device-aware insertion-loss characterization across all chips on the wafer
- Editable manual-conversion output filenames with corrected rib-versus-strip trace naming
- Evidence-led AI diagnostics for failed fits, spectral ripple/discontinuities, and MPW comparison

Live deployment:
- [https://zimmxx.github.io/cs-testsuite/](https://zimmxx.github.io/cs-testsuite/)

## Project Goals

- Replace rigid MATLAB app workflows with a more flexible web interface
- Support multiple incoming file formats through one translation layer
- Make wafer-level analysis easier to review, share, compare, and extend
- Connect cleanroom CD-SEM measurements to optical propagation analysis at chip level
- Make GitHub-hosted measurement data easier to audit across MPW runs and platforms
- Keep the project easy to maintain locally and on GitHub
- Standardize measurement file naming for long-term dataset reuse

## Current Release

- App version: `v0.5.0`
- Release date: `2026-08-27`
- Focus: `evidence-led AI Diagnostics, controlled Gemini model selection, secure API handling, and evaluation logging`

Key updates in this release:

- new AI Diagnostics workspace for failed-fit triage, spectral anomaly screening, and MPW comparison
- deterministic local detection of ripple, oscillation, abrupt discontinuities, and high spectral roughness
- Gemini interpretation using compact diagnostic evidence rather than complete raw spectra
- four selectable Gemini models with `gemini-3.1-flash-lite` as the low-consumption default
- checked-by-default evaluation logging control with an explicit no-storage path
- server-side API-key handling for local development and a production function for server-capable hosting
- dedicated AI Diagnostics documentation covering models, quotas, data handling, deployment, and evaluation

## Tech Stack

- React 18
- Vite 5
- `xlsx` for spreadsheet parsing
- `pptxgenjs` for browser-based PowerPoint export
- GitHub Actions + GitHub Pages for deployment

## Local Development

Install dependencies:

```bash
pnpm install
```

Start the local dev server:

```bash
pnpm dev
```

Create a production build:

```bash
pnpm build
```

Preview the production build locally:

```bash
pnpm preview
```

### AI Diagnostics and Gemini

The AI Diagnostics screen always performs its chip-failure and spectral-anomaly screening locally. Gemini is an optional interpretation layer and is selected as the default provider.

See the [AI Diagnostics Intelligence Guide](docs/AI_DIAGNOSTICS.md) for the implemented model comparison, token-consumption guidance, logging and evaluation behaviour, API-key security, and the recommended production architecture.

For local development:

1. Copy `.env.example` to `.env.local`.
2. Add a free-tier Google AI Studio key as `GEMINI_API_KEY`.
3. Restart `pnpm dev`.

Never rename the key to `VITE_GEMINI_API_KEY` or commit `.env.local`; `VITE_*` values are exposed to the browser. The Vite development proxy keeps `GEMINI_API_KEY` server-side.

The GitHub Pages deployment is static and cannot hold API secrets. Same-origin deployment on a server-capable host is recommended. If the GitHub Pages frontend uses a separately hosted `functions/api/ai.js`, set `VITE_AI_API_URL` to that public endpoint during the build and add a strict CORS allow-list, preflight handling, rate limiting, and access control to the backend. Raw spectra are not sent to Gemini; the request contains compact screening metrics and flagged evidence only.

On the public GitHub Pages site, a user can paste their own masked Gemini key in AI Diagnostics and optionally remember it only in that browser. If neither a user key nor `VITE_AI_API_URL` is available, the UI gives an explicit configuration message instead of calling the non-existent `/api/ai` route and receiving a `405`. See [AI Backend Deployment](docs/AI_BACKEND_DEPLOYMENT.md) for the protected shared-key option.

## Deployment

Deployment is handled through [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).

On push to `main`, GitHub Actions:

1. Installs dependencies
2. Builds the Vite app
3. Publishes the generated `dist/` output to GitHub Pages

## Main Source Files

- [`src/App.jsx`](src/App.jsx)
  Main UI layout, tabs, sidebar, upload flow, charts, wafermap, report preview, and library integration

- [`src/styles.css`](src/styles.css)
  Visual styling, layout, typography, component appearance, and responsive rules

- [`src/lib/parsers.js`](src/lib/parsers.js)
  File parsing, column mapping, normalization, and CSV export

- [`src/lib/analysis.js`](src/lib/analysis.js)
  Metric calculations, wafer summaries, report state generation, and propagation spectrum logic

- [`src/lib/aiDiagnostics.js`](src/lib/aiDiagnostics.js)
  Deterministic spectral screening, failed-chip evidence, MPW comparison, and provider-neutral AI request payloads

- [`src/components/AiDiagnosticsPanel.jsx`](src/components/AiDiagnosticsPanel.jsx)
  AI Diagnostics interface, Gemini provider selection, chip triage, and batch-comparison workflow

- [`src/lib/manualConversion.js`](src/lib/manualConversion.js)
  Manual `.xlsx` to WST-compatible trace conversion and zip/manifest export

- [`src/lib/filenameStandardization.js`](src/lib/filenameStandardization.js)
  Shared naming rules for datasets, traces, archive exports, and filename conversion

## Documentation Index

- [AI Diagnostics Intelligence Guide](docs/AI_DIAGNOSTICS.md)
- [AI Backend Deployment](docs/AI_BACKEND_DEPLOYMENT.md)
- [Local Git and GitHub Workflow](docs/LOCAL_GIT_GITHUB_WORKFLOW.md)
- [Versioning and Documentation Guide](docs/VERSIONING_AND_DOCUMENTATION.md)
- [Dataset and Filename Standard](docs/DATASET_FILENAME_STANDARD.md)
- [Release Features: v0.5.0](docs/releases/v0.5.0/FEATURES.md)
- [Release Changelog: v0.5.0](docs/releases/v0.5.0/CHANGELOG.md)
- [Release Checklist: v0.5.0](docs/releases/v0.5.0/RELEASE_CHECKLIST.md)
- [Suggested Next Updates](docs/suggested_update.md)
- [Full Project Version History](docs/PROJECT_VERSION_HISTORY.md)
- [App Development Screenshots](Screenshot%20-%20App%20Development/README.md)
- [CORNERSTONE Presentation](docs/CORNERSTONE_Wafer_Post-Processing_Suite_Overview_v0.5.0.pptx)

## Brand Asset

The application uses [`public/assets/CORNERSTONE_Logo.png`](public/assets/CORNERSTONE_Logo.png). Keep this file in the repository so local development and GitHub Pages use the same approved logo.

## Recommended Repository Hygiene

The following local scratch/demo files are not part of the deployed app source and should be treated as legacy experiments unless you explicitly want to keep them:

- `Wafer-PostProcessing-Suite.html`
- `Wafer-PostProcessing-Suite-Offline.html`
- `Wafer-PostProcessing-Suite-Edge-Working.html`
- `Wafer-PostProcessing-Suite-Direct.html`

## Maintainer Note

When new features are added, update:

1. `README.md` for high-level user-facing changes
2. `docs/DATASET_FILENAME_STANDARD.md` if the naming convention changes
3. `docs/releases/<version>/FEATURES.md` for feature behavior
4. `docs/releases/<version>/CHANGELOG.md` for change history
5. `docs/suggested_update.md` for roadmap and architecture follow-up notes
