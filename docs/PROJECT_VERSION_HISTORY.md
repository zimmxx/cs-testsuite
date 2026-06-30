# Project Version History

This file tracks the development history of the Wafer Post-Processing Suite from the beginning of the project, including major updates, upgrades, and deployment milestones.

## Timeline

### 2026-06-25

#### `f3b2f22` Initial commit
- Created the initial repository structure for the wafer post-processing application.
- Established the starting point for the web-based silicon photonics post-processing workflow.

#### `f594124` Add test connection file
- Added an early repository test file to verify setup and GitHub connectivity.

### 2026-06-26

#### `21b631e` Build wafer post-processing dashboard and GitHub Pages deployment
- Created the first web dashboard version of the Wafer Post-Processing Suite.
- Added the initial GitHub Pages deployment workflow.
- Replaced the idea of a MATLAB-only interface with a browser-based UI.

#### `b33d7fd` Fix GitHub Pages workflow to use pnpm
- Updated the deployment pipeline to use `pnpm` consistently.

#### `b24a3e2` Fix pnpm setup order in Pages workflow
- Corrected GitHub Actions setup order for package manager configuration.

#### `444b415` Fix pnpm workspace configuration for Pages build
- Repaired workspace-related configuration so the Pages build could proceed correctly.

#### `fe4f425` Remove duplicate pnpm version pin
- Cleaned up duplicated `pnpm` version configuration in the deployment workflow.

#### `e3168de` Add project documentation and local workflow guides
- Added project README improvements.
- Added local Git and GitHub workflow guidance.
- Added versioned documentation structure for future upgrades.

#### `3ea5fb4` Add working library sections to wafer dashboard
- Added working library pages and navigation sections such as Projects, Datasets, Settings, Audit Log, and Help.
- Improved the app structure beyond the original static dashboard.

#### `3b4ce71` Fix Help tab runtime crash
- Fixed the Help page behavior so it no longer opened as a broken or blank view.

#### `8238a03` Add propagation trace workflow for WST data
- Added propagation-loss workflow support for automated wafer-scale tester trace data.
- Began supporting tester TXT ingestion and processing in the unified app pipeline.

### 2026-06-29

#### `cc28cc4` Add MATLAB-inspired wafer analysis workflow
- Brought MATLAB App Designer concepts into the web app.
- Expanded the suite with MATLAB-inspired analysis flow, figures, and reporting ideas.
- Improved the photonics analysis direction for propagation, insertion, and heater metrics.

#### `ec2a376` Add MPW30 slot13 rib WST sample dataset
- Added a real bundled WST example dataset for MPW30 Slot13 Rib measurements.
- Enabled in-app testing against representative silicon photonics wafer data.

#### `de1038c` Add bundled WST sample loader
- Added a sample dataset loader so GitHub-hosted raw traces could be loaded directly into the UI.
- Improved the app’s usability for demonstration and verification.

### 2026-06-30

#### `a339be9` Improve wafer analysis UI and diagnostics
- Improved the dashboard presentation and the wafer-analysis workflow.
- Added better diagnostics and data-summary behavior for silicon photonics measurement review.

#### `bb9edd0` Fix wafermap chip mapping and dataset preview
- Improved wafermap chip-to-location mapping.
- Improved normalized dataset preview behavior so users could inspect more meaningful chip data in the UI.

#### `d37bcb0` Fix wafermap orientation and notch placement
- Corrected wafer orientation so the notch placement matched the required physical wafer view.
- Fixed bottom-notch wafer presentation logic.

#### `3026ed3` Improve wafermap template rendering and spectral propagation analysis
- Added the full 101-chip wafer template rendering approach.
- Kept all wafer positions visible, including chips without measurement values.
- Added interval-based propagation spectrum analysis with propagation loss and MSE support.
- Improved chip selection and wafer-template display behavior.

#### `37e4d52` Improve startup flow and interactive analysis charts
- Removed demo-filled startup behavior so the workspace could begin empty.
- Removed duplicate Wafermap and Report workspace tabs.
- Switched the key analysis figures to interactive browser-native charts.
- Added hover values, zoom, pan, autoscale, PNG export, and open-figure support.
- Renamed the transmission plot section to **Transmission Spectrum**.

#### `528328e` Refine spectrum layout and remove intake workspace
- Reworked the propagation spectrum and transmission spectrum layout.
- Fixed the interactive figure popup flow.
- Removed the Intake workspace from the active app flow.
- Simplified the UI so the remaining tabs focus on the main post-processing tasks.

## Current Development State

Latest recorded application update:
- `528328e` on `2026-06-30`
- Title: `Refine spectrum layout and remove intake workspace`

## How To Extend This File

When a new update is made:
1. Add the calendar date section if it does not already exist.
2. Add the commit hash and commit title.
3. Summarize the major user-facing or technical upgrades in 2 to 5 bullet points.
4. Keep this file as the full project-level history, while keeping release-specific notes inside:
   - `docs/releases/<version>/FEATURES.md`
   - `docs/releases/<version>/CHANGELOG.md`
