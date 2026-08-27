# Suggested Updates

This document captures the most useful next steps after the `v0.5.0` update.

## Recommended Next Step

The strongest next improvement is to productionise AI Diagnostics with an authenticated, rate-limited server-side endpoint and a labelled engineering evaluation set, while continuing to split the large workspace orchestration in `src/App.jsx` into smaller testable components.

Why this should be next:

- it prevents a public deployment from consuming Gemini quota without access control
- it measures whether model explanations improve engineering decisions rather than only sounding plausible
- it reduces regression risk when AI, spectrum, or wafer workspaces are tuned independently
- it prepares the project for governed deployment beyond local development

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

1. Add authentication, an origin allow-list, request-size limits, and per-user/server-side rate limiting to the production AI endpoint.
2. Record model ID, latency, input tokens, output tokens, engineer verdict, and confirmed root cause in a governed evaluation dataset.
3. Add regression fixtures for clean traces, ripple, discontinuities, failed fits, measurement artefacts, and independently confirmed fabrication issues.
4. Split the large `src/App.jsx` orchestration file into smaller workspace and library controllers.
5. Move spectrum-specific calculations out of `InteractivePlots.jsx` into a dedicated helper module.
6. Add UI-level tests around AI logging, model selection, advanced spectrum upload, wavelength zoom, and vertical range behavior.

## Suggested Product Decisions To Confirm

These decisions would remove ambiguity for the next implementation round:

1. Whether advanced spectrum metrics should use the full trace or only the visible wavelength window by default.
2. Whether spectrum images captured from the viewer should include analysis overlays by default.
3. Whether saved spectrum views should be local-only or exportable as part of reports.
4. Whether future FSR and extinction summaries belong only in the advanced viewer or also in report generation.
5. Which wafer and customer datasets are permitted to be summarised by a free-tier external AI service.
6. Whether AI access should be limited to authenticated CORNERSTONE users in production.
7. What minimum evaluation accuracy and false-positive rate are required before AI output is included in formal reports.
