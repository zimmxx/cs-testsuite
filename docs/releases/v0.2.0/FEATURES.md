# Wafer Post-Processing Suite
# Features Reference
# Version: v0.2.0

## Release Summary

Version `v0.2.0` expands the suite from a baseline wafer-analysis dashboard into a more practical silicon-photonics post-processing tool for insertion-loss characterization and spectrum review.

This release adds:

- a dedicated `Spectrum Viewer` workspace for rapid trace inspection
- improved Excel insertion-loss parsing from the `IL` worksheet
- automatic unit handling for Spectrum Viewer uploads
- a device-aware insertion-loss workflow across all chips on the wafer
- grating-coupler characterization derived from `WG1` or the shortest propagation reference trace
- richer insertion metrics such as peak wavelength, insertion loss at peak, insertion loss at `1550 nm`, `3 dB` bandwidth, and spectral flatness
- chip-by-chip insertion performance tables
- wafer-wide variation overlays for insertion spectra with per-trace show/hide controls

## Main User Interface Areas

### 1. Sidebar Navigation

Implemented in:
- [src/App.jsx](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\App.jsx)
- [src/styles.css](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\styles.css)

Current sections:

- Workspace
  - Propagation Loss
  - Insertion Loss
  - Heater Efficiency
- Library
  - Projects
  - Datasets
  - Manual Conversion
  - Comparison
  - Spectrum Viewer
  - Filename Conversion
  - Wafermaps
  - Settings
  - Audit Log
  - Help

### 2. Propagation Loss Tab

Purpose:

- fit transmission versus relative length
- estimate propagation loss in `dB/cm`
- inspect chip-level propagation spectra and raw loss spectra

Current outputs:

- KPI card for mean propagation loss
- interactive propagation fit plot
- fit results panel
- propagation loss spectrum with MSE tracking
- loss spectrum overlay by waveguide length
- post-processed file export support

### 3. Insertion Loss Tab

Purpose:

- characterize one silicon-photonics building block across all chips on the wafer
- support device-specific insertion-loss review rather than a simple per-block average

Current device modes:

- `Grating Couplers`
- `MMI`
- `Other Device`

Current outputs:

- device selector and metric selector
- chip-aware comparison panel
- device-specific inspector panel
- single-chip transmission spectrum
- wafer-wide variation overlay with show/hide controls
- chip-by-chip insertion performance table
- wafermap support using the selected insertion metric

Current grating-coupler workflow:

- uses `WG1` or the shortest propagation reference trace as the grating-coupler pair reference
- treats that short propagation structure as the best estimate of coupled grating performance on each chip

Current insertion metrics:

- insertion loss at peak
- insertion loss at `1550 nm`
- peak wavelength
- `3 dB` bandwidth
- spectral flatness

### 4. Spectrum Viewer

Purpose:

- give users a flexible figure workspace for ad hoc device inspection without forcing the data into a wafer-analysis building-block flow

Current capabilities:

- drag-and-drop upload for `.txt`, `.csv`, `.xlsx`, and `.xls`
- automatic population into an interactive figure
- visibility toggles per uploaded trace
- display in `dB / dBm` or `Watts (W)`
- Excel parsing from the `IL` worksheet with wavelength in metres and IL in dB
- automatic unit defaulting for Excel versus text-based uploads

### 5. Heater Efficiency Tab

Purpose:

- estimate MZI heater efficiency in `mW/pi`

Current outputs:

- heater efficiency wafer metric
- heater KPI summaries
- chip-level inspector view

### 6. Datasets Library

Purpose:

- save browser snapshots of normalized workspaces
- load bundled or GitHub-hosted measurement datasets
- optionally publish selected snapshots into the shared GitHub measurement-data library

### 7. Manual Measurement - Conversion

Purpose:

- translate nested manual measurement Excel folders such as `MPW46/SLOT5/Chip3/STRIP/WG1.xlsx` into WST-compatible traces

### 8. Comparison Library

Purpose:

- compare two or more wafer datasets across MPW runs, slots, modes, or waveguide families

### 9. Filename Conversion

Purpose:

- standardize trace and dataset filenames before they are saved to GitHub

### 10. Wafermaps

Purpose:

- create reusable wafermap templates for different chip populations and notch orientations

### 11. Report Preview

Purpose:

- present an export-ready summary of wafer quality

## File Translation Layer

Implemented in:
- [src/lib/parsers.js](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\lib\parsers.js)

Notable `v0.2.0` updates:

- improved spreadsheet handling for insertion-loss review files
- dedicated spectrum-file parsing for the Spectrum Viewer
- better support for dB-versus-watts trace handling

## Analysis Layer

Implemented in:
- [src/lib/analysis.js](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\lib\analysis.js)

Notable `v0.2.0` updates:

- richer insertion-loss summarization from spectral traces
- device profiles for grating couplers, MMI, and other devices
- wafer-wide chip aggregation for insertion metrics
- grating-coupler extraction from propagation reference traces

## Current Limitations In v0.2.0

- MMI analysis currently focuses on robust spectral metrics and does not yet estimate FSR automatically
- comparison still focuses on wafer-level summaries rather than mirroring every workspace figure
- GitHub publish still requires a correctly scoped fine-grained personal access token
- report export is still oriented to HTML, JSON, PowerPoint, and generated post-processed files rather than a final engineering PDF flow

## Priority Upgrade Ideas For Later Versions

- conditional FSR extraction for periodic MMI spectra
- more device-specific insertion analysis templates for splitters, ring devices, and other building blocks
- richer comparison plots for insertion and heater families
- stronger final-report export formats such as PDF
