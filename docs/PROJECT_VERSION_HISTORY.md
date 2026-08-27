# Project Version History

This file tracks the development history of the Wafer Post-Processing Suite from the beginning of the project, including major updates, upgrades, and deployment milestones.

**Created and maintained by:** Aiman Hazim Shafizam — Research Technician, Testing and Characterisation, CORNERSTONE

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
- Improved the app's usability for demonstration and verification.

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

### 2026-07-06

#### Current working-tree upgrade
- Added a new `Comparison` library page that can load multiple GitHub or local datasets and compare wafer-level propagation, insertion, and heater metrics side by side.
- Added a new `Filename Conversion` library page to standardize uploaded measurement filenames before saving them into the GitHub measurement-data library.
- Upgraded the manual-measurement conversion workflow so exported traces, manifests, and zip archives follow the standardized dataset naming pattern.
- Added a dedicated dataset and filename standard document to guide future measurement storage and GitHub library population.

### 2026-07-29

#### Current working-tree upgrade
- Added the new `Spectrum Viewer` workspace for flexible spectrum inspection from TXT, CSV, and Excel uploads.
- Upgraded insertion-loss analysis so the workspace can characterize one building block across all chips, especially grating couplers using `WG1` or the shortest propagation reference trace.
- Added richer insertion metrics such as peak wavelength, insertion loss at peak, insertion loss at `1550 nm`, `3 dB` bandwidth, and spectral flatness.
- Added a wafer-wide insertion-spectrum variation overlay with per-trace show/hide controls.
- Improved Excel parsing and unit handling for insertion-loss review workflows.

### 2026-08-11

#### `39c98ca` Fix manual conversion filenames
- Fixed manual-conversion waveguide-family detection so `RIB` folders no longer inherit strip-style output names.
- Prevented slot identifiers such as `SLOT7` from being mistaken for the waveguide-family folder token.
- Added editable output filenames in the `Manual Conversion` results table.
- Applied edited filenames consistently to individual downloads, ZIP export, and manifest export.

### 2026-08-13

#### Current working-tree upgrade
- Added a new `CD-SEM Data` library section for importing coordinate-based cleanroom metrology files.
- Added chip-coordinate mapping from `Column` and `Row` values onto the active wafer template.
- Added overlap review and simple correlation inspection between CD-SEM values and propagation-loss chips.
- Added a new `Dashboard` library section to review published GitHub datasets by platform and MPW.
- Added on-demand propagation analytics for published GitHub datasets loaded from the measurement manifest.

### 2026-08-17

#### Current working-tree upgrade
- Split the spectrum workflow into `Spectrum Viewer` and `Spectrum Viewer (Advanced)` so quick inspection and detailed analysis no longer compete in one panel.
- Restored the original lightweight spectrum viewer behavior for ordinary uploads and visibility toggles.
- Added advanced wavelength-window zoom and vertical axis controls for the advanced viewer, including corrected dB-axis handling for loss bounds.
- Refined advanced spectrum upload behavior so the advanced viewer keeps its own traces and no longer locks the library navigation after upload.

### 2026-08-20 to 2026-08-21

#### `v0.4.0` CORNERSTONE interface and propagation-workspace upgrade
- Added the CORNERSTONE logo to the application shell and linked it to the CORNERSTONE website.
- Added visible startup, dataset-loading, success, and failure feedback so users can distinguish processing time from an unresponsive interface.
- Reorganised the sidebar into focused Workspace, Library, and Settings groups; removed the duplicate Workspace Snapshot entry and simplified user settings.
- Corrected propagation summary semantics so Measured Chips includes every measured chip and Avg Propagation Loss represents the filtered wafer average.
- Replaced R2-focused summary content with MSE fit-quality reporting and retained detailed MSE values in the fit inspector.
- Added silicon-photonics-oriented icons to summary metrics and navigation without decorative icon borders.
- Reworked the propagation workspace so Propagation Loss Fit, Propagation Loss Spectrum, Transmission Spectrum, and the wafermap can be compared within a 100% desktop view.
- Moved wafermap controls below the map, redesigned the colour scale, populated min/mid/max from the active chip data, and added editable empty states plus Reset Scale.
- Removed duplicated post-processed export actions from the propagation workspace while preserving report-generator export capability.
- Added a visual development archive and a presentation-ready overview for CORNERSTONE technical and non-technical stakeholders.

### 2026-08-27

#### `v0.5.0` AI Diagnostics intelligence and Gemini integration
- Added an AI Diagnostics workspace for failed-fit triage, transmission-spectrum anomaly screening, and comparison of GitHub-library MPW datasets.
- Added deterministic local indicators for oscillation or ripple, abrupt discontinuities, high spectral roughness, and combined high-loss/roughness cases.
- Added four selectable Gemini models with `gemini-3.1-flash-lite` as the default and application-level output limits for consumption control.
- Added a server-side local proxy and deployment function so `GEMINI_API_KEY` is never required in browser code.
- Added a checked-by-default Gemini logging option for later evaluation-dataset curation, with explicit no-storage and cleanup behaviour when disabled.
- Added AI model, quota, logging, data-governance, API-key, and production-deployment documentation.
- Revised the CORNERSTONE stakeholder presentation and release documentation for the `v0.5.0` local release candidate.

## Current Development State

Latest recorded working-tree update:
- Date: `2026-08-27`
- Version: `v0.5.0`
- Theme: `evidence-led AI Diagnostics, controlled Gemini use, and secure deployment preparation`

## How To Extend This File

When a new update is made:
1. Add the calendar date section if it does not already exist.
2. Add the commit hash and commit title when the change is committed.
3. Summarize the major user-facing or technical upgrades in 2 to 5 bullet points.
4. Keep this file as the full project-level history, while keeping release-specific notes inside:
   - `docs/releases/<version>/FEATURES.md`
   - `docs/releases/<version>/CHANGELOG.md`
