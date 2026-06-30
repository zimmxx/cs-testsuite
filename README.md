# Wafer Post-Processing Suite

Web-based post-processing dashboard for wafer-scale silicon photonics measurements.

This app is designed to unify two measurement routes into one analysis pipeline:

- Wafer-scale tester exports, typically from `.txt` or delimited text files
- Manual wafer measurements, typically from `.xlsx` or `.xls` spreadsheets

The app translates uploaded measurement data into a normalized internal schema, then uses that shared dataset for:

- Propagation loss analysis in `dB/cm`
- Insertion loss analysis in `dB`
- MZI heater efficiency analysis in `mW/pi`
- Wafermap visualization
- Report preview and export-ready reporting state

Live deployment:
- [https://zimmxx.github.io/cs-testsuite/](https://zimmxx.github.io/cs-testsuite/)

## Project Goals

- Replace rigid MATLAB app workflows with a more flexible web interface
- Support multiple incoming file formats through one translation layer
- Make wafer-level analysis easier to review, share, and extend
- Keep the project easy to maintain locally and on GitHub

## Tech Stack

- React 18
- Vite 5
- `xlsx` for spreadsheet parsing
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

Deployment is handled through:

- [.github/workflows/deploy-pages.yml](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\.github\workflows\deploy-pages.yml)

On push to `main`, GitHub Actions:

1. Installs dependencies
2. Builds the Vite app
3. Publishes the generated `dist/` output to GitHub Pages

## Main Source Files

- [src/App.jsx](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\App.jsx)
  Main UI layout, tabs, sidebar, upload flow, charts, wafermap, report preview

- [src/styles.css](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\styles.css)
  Visual styling, layout, typography, component appearance, responsive rules

- [src/lib/parsers.js](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\lib\parsers.js)
  File parsing, column mapping, normalization, CSV export

- [src/lib/analysis.js](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\lib\analysis.js)
  Metric calculations, wafer summaries, report state generation

- [index.html](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\index.html)
  Vite app entry HTML

## Documentation Index

- [Local Git And GitHub Workflow](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\docs\LOCAL_GIT_GITHUB_WORKFLOW.md)
- [Versioning And Documentation Guide](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\docs\VERSIONING_AND_DOCUMENTATION.md)
- [Release Features: v0.1.0](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\docs\releases\v0.1.0\FEATURES.md)
- [Release Changelog: v0.1.0](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\docs\releases\v0.1.0\CHANGELOG.md)
- [Full Project Version History](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\docs\PROJECT_VERSION_HISTORY.md)

## Recommended Repository Hygiene

The following local scratch/demo files are not part of the deployed app source and should be treated as legacy experiments unless you explicitly want to keep them:

- `Wafer-PostProcessing-Suite.html`
- `Wafer-PostProcessing-Suite-Offline.html`
- `Wafer-PostProcessing-Suite-Edge-Working.html`
- `Wafer-PostProcessing-Suite-Direct.html`

## Maintainer Note

When new features are added, update:

1. `README.md` for high-level user-facing changes
2. `docs/releases/<version>/FEATURES.md` for feature behavior
3. `docs/releases/<version>/CHANGELOG.md` for change history

