# Wafer Post-Processing Suite
# Features Reference
# Version: v0.3.1

## Release Summary

Version `v0.3.1` is a patch release focused on stabilizing and separating the spectrum inspection workflows.

This release adds and refines:

- a restored lightweight `Spectrum Viewer` for quick ad hoc trace review
- a separate `Spectrum Viewer (Advanced)` section for richer spectrum analysis
- independent upload state for the standard and advanced spectrum workspaces
- wavelength-window zoom behavior that keeps the full trace while focusing the plot view
- corrected vertical-axis controls for both `dB` and `Watts` display modes

## Main User Interface Areas

### 1. Spectrum Viewer

Purpose:

- provide a simple place to upload and inspect one or more spectrum traces
- keep the quick inspection workflow uncluttered for ordinary use

Current capabilities:

- accepts `.txt`, `.csv`, `.xlsx`, and `.xls` spectrum uploads
- supports independent trace visibility toggles
- supports a custom figure title
- supports peak-position guide overlays
- supports PNG and HTML export from the current figure

### 2. Spectrum Viewer (Advanced)

Purpose:

- provide a more detailed analysis workspace without changing the simpler viewer behavior
- allow the user to focus on a wavelength region and refine the visible vertical range

Current capabilities:

- keeps its own uploaded traces separate from the standard spectrum viewer
- auto-fills `Start wavelength` and `Stop wavelength` from the uploaded trace range
- uses `Start wavelength` and `Stop wavelength` as horizontal zoom bounds instead of trimming away off-window data
- supports direct vertical-range control through `Loss min / max (dB)` or `Power min / max (W)` depending on the active display mode
- supports peak detection with configurable `minima` or `maxima`, spacing, and prominence
- provides summary cards for point count, detected peaks, strongest peak, average FSR, and extinction ratio

## Main Source Updates

Implemented in:

- [src/App.jsx](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\App.jsx)
- [src/components/InteractivePlots.jsx](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\components\InteractivePlots.jsx)
- [src/styles.css](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\styles.css)

## Behavior Notes

In `v0.3.1`:

- the advanced spectrum viewer no longer reuses the standard viewer upload list
- wavelength bounds now behave as plot zoom controls
- loss bounds in `dB` are mapped correctly onto the reversed y-axis
- vertical-range labels switch automatically with the selected display unit

## Current Limitations In v0.3.1

- advanced spectrum summaries currently operate on the full uploaded trace, not just the visible wavelength window
- the advanced viewer still lives inside the shared app orchestration file rather than a dedicated spectrum module
- there is not yet a dedicated export of peak tables or FSR summaries from the advanced viewer
