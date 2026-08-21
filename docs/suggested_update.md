# Suggested Updates

This document captures the most useful next steps after the `v0.4.0` update.

## Recommended Next Step

The strongest next improvement is to split the large workspace orchestration in `src/App.jsx` into smaller analysis and navigation components, then add repeatable browser-level regression tests for loading, scaling, chip selection, and export flows.

Why this should be next:

- it reduces regression risk when one workspace is tuned without affecting another
- it makes the newly refined propagation and wafer-scale controls easier to test
- it prepares the project for future spectrum analysis, batch metrics, annotations, and saved view presets

## Suggested Spectrum Architecture

Recommended long-term split:

```text
src/
  components/
    spectrum/
      SpectrumViewerPanel.jsx
      SpectrumViewerAdvancedPanel.jsx
      SpectrumAnalysisControls.jsx
      SpectrumSeriesList.jsx
      SpectrumPlotSummary.jsx
  lib/
    spectrumAnalysis.js
    spectrumViewState.js
```

Benefits:

- clearer ownership between standard viewer behavior and advanced viewer behavior
- easier reuse of peak detection, zoom normalization, and export helpers
- simpler future UI-level testing for spectrum interactions

## Suggested Functional Improvements

1. Add saved presets for wavelength windows and vertical ranges in the advanced spectrum viewer.
2. Add optional tabular peak and FSR export from the advanced viewer.
3. Add on-plot region annotations and user notes for captured spectrum images.
4. Add small test fixtures for TXT and Excel spectrum uploads with known wavelength ranges.
5. Add a clearer metric toggle for peak-based summaries versus whole-trace summaries.
6. Add keyboard-safe reset actions for horizontal zoom and vertical range independently.
7. Add a dedicated user-facing explanation of dB-axis reversal in advanced spectrum mode.

## Suggested Technical Improvements

1. Split the large `src/App.jsx` orchestration file into smaller workspace and library controllers.
2. Move spectrum-specific calculations out of `InteractivePlots.jsx` into a dedicated helper module.
3. Add UI-level tests around advanced spectrum upload, wavelength zoom, and vertical range behavior.
4. Add a stable view-model layer for spectrum controls so temporary inputs and applied bounds are explicit.
5. Add a small regression checklist for spectrum export, peak detection, and axis handling.

## Suggested Product Decisions To Confirm

These decisions would remove ambiguity for the next implementation round:

1. Whether advanced spectrum metrics should use the full trace or only the visible wavelength window by default.
2. Whether spectrum images captured from the viewer should include analysis overlays by default.
3. Whether saved spectrum views should be local-only or exportable as part of reports.
4. Whether future FSR and extinction summaries belong only in the advanced viewer or also in report generation.
