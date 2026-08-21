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

- App version: `v0.4.0`
- Release date: `2026-08-21`
- Focus: `CORNERSTONE-branded interface, clearer processing feedback, propagation-analysis refinements, and compact wafermap comparison workflow`

Key updates in this release:

- CORNERSTONE logo in the application shell, linked to the CORNERSTONE website
- startup, dataset-loading, completion, and error feedback for long-running actions
- corrected propagation summary metrics, including all measured chips and wafer-average propagation loss
- MSE-based fit-quality reporting and simplified propagation summary cards
- compact propagation-fit, propagation-spectrum, transmission-spectrum, and wafermap layout for 100% browser view
- professional wafermap colour scaling with dataset-derived values, editable inputs, and reset-to-data controls
- reorganised Workspace and Library navigation, simplified display settings, and consistent silicon-photonics icons

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

- [`src/lib/manualConversion.js`](src/lib/manualConversion.js)
  Manual `.xlsx` to WST-compatible trace conversion and zip/manifest export

- [`src/lib/filenameStandardization.js`](src/lib/filenameStandardization.js)
  Shared naming rules for datasets, traces, archive exports, and filename conversion

## Documentation Index

- [Local Git and GitHub Workflow](docs/LOCAL_GIT_GITHUB_WORKFLOW.md)
- [Versioning and Documentation Guide](docs/VERSIONING_AND_DOCUMENTATION.md)
- [Dataset and Filename Standard](docs/DATASET_FILENAME_STANDARD.md)
- [Release Features: v0.4.0](docs/releases/v0.4.0/FEATURES.md)
- [Release Changelog: v0.4.0](docs/releases/v0.4.0/CHANGELOG.md)
- [Release Checklist: v0.4.0](docs/releases/v0.4.0/RELEASE_CHECKLIST.md)
- [Suggested Next Updates](docs/suggested_update.md)
- [Full Project Version History](docs/PROJECT_VERSION_HISTORY.md)
- [App Development Screenshots](Screenshot%20-%20App%20Development/README.md)
- [CORNERSTONE Presentation](docs/CORNERSTONE_Wafer_Post-Processing_Suite_Overview_v0.4.0.pptx)

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
