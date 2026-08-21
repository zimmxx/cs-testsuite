# CORNERSTONE Wafer Post-Processing Suite
# Features Reference
# Version: v0.4.0

**Created by:** Aiman Hazim Shafizam — Research Technician, Testing and Characterisation, CORNERSTONE

## Release Summary

Version `v0.4.0` is a substantial usability and analysis-workflow release. It aligns the application with CORNERSTONE branding, improves user feedback during processing, clarifies propagation-loss metrics, and makes chip-to-chip comparison practical at a standard 100% desktop browser view.

## Core Workspaces

### Propagation Loss

- wafer-average propagation loss across selected chips that pass the active fit criterion
- total measured-chip count independent of the filtered chip summary
- valid-fit, failed-fit, wafer-yield, wavelength, device, source, insertion, peak, and bandwidth summaries
- MSE-based fit quality in the chip inspector
- linked Propagation Loss Fit, Propagation Loss Spectrum, Transmission Spectrum, wafermap, and chip summary views
- dataset-derived wafermap minimum, midpoint, and maximum values
- editable scale values that may temporarily be blank while typing
- Reset Scale action that restores dataset-derived thresholds

### Insertion Loss

- device-aware insertion-loss analysis across measured chips
- peak wavelength, insertion loss at peak and at the target wavelength, 3 dB bandwidth, and spectral flatness
- wafer-level and chip-level spectrum comparison

### Heater Efficiency

- MZI heater-response analysis and phase-shift review
- wafer-level comparison of electrical and optical response metrics

## Library and Data Tools

- Dashboard for published dataset coverage
- Dataset Snapshots for saved analysis states
- Comparison across GitHub-hosted and local datasets
- Manual Conversion and Manual Conversion (Advanced)
- Filename Conversion with standardised naming
- CD-SEM coordinate import and overlap review
- Spectrum Viewer and Spectrum Viewer (Advanced)
- Wafermaps and Report Generator

## User Experience

- CORNERSTONE logo with external website link
- grouped Workspace, Library, and Settings navigation
- silicon-photonics-oriented icons for navigation and summary metrics
- startup and dataset-processing status messages
- compact, responsive analysis panels for standard desktop viewing
- theme and display preferences without operator-profile fields

## Reporting and Export

- interactive figures, PNG downloads, and saved interactive HTML where available
- report-generator workflow for consolidated outputs
- chip-by-chip PowerPoint report generation retained
- removal of duplicated post-processed file generation from the propagation panel

## Known Release Constraints

- large datasets remain dependent on browser memory and source-file size
- GitHub publication and deletion actions require appropriate repository credentials
- automated browser regression coverage should be expanded before declaring `v1.0.0`
