# Suggested Updates

This document captures the most useful next steps after the `v0.3.0` update.

## Recommended Next Step

The strongest next improvement is to make CD-SEM a first-class published dataset type in the GitHub library, rather than an in-app-only import workflow.

Why this should be next:

- it closes the loop between cleanroom metrology and optical wafer analysis
- it removes the need to re-import the same CD-SEM files repeatedly
- it makes dashboard summaries more meaningful because both propagation and CD-SEM data can be tracked per MPW and slot

## Suggested Repository Structure

Recommended long-term structure:

```text
sample-data/
  enhanced/
    platforms/
      220nm SOI/
        MPW48/
          Slot8/
            Rib/
              propagation/
              cdsem/
              post-processed/
```

Benefits:

- easier browsing by platform, MPW, slot, and waveguide family
- cleaner separation between raw traces, CD-SEM tables, and post-processed outputs
- simpler future dashboard indexing

## Suggested Functional Improvements

1. Add GitHub publish support for CD-SEM datasets.
2. Define a shared metadata schema so propagation and CD-SEM records can be linked by platform, MPW, slot, waveguide family, and chip coordinate.
3. Add cached dashboard summary JSON so the dashboard does not need to reprocess every dataset on demand.
4. Add scatter plots and regression tools for CD-SEM versus propagation loss.
5. Add richer parameter selection for CD-SEM beyond `Si waveguide mid`, including saved presets per file format.
6. Add a combined wafer review mode that can switch between propagation, CD-SEM, overlap only, and delta overlays.
7. Add repository-side support for storing post-processed reports, wafermaps, figures, and summary markdown in a controlled subfolder.

## Suggested Technical Improvements

1. Split the large `src/App.jsx` orchestration file into smaller workspace and library controllers.
2. Add a shared dataset-loader utility for local and remote library analytics.
3. Add manifest versioning specifically for enhanced dashboard summaries.
4. Add test fixtures for CD-SEM import formats and coordinate mapping.
5. Add UI-level tests around dashboard filtering and dataset analysis triggers.

## Suggested Product Decisions To Confirm

These decisions would remove ambiguity for the next implementation round:

1. The exact CD-SEM input template to support first.
2. Whether CD-SEM files should be stored as raw source files, normalized CSV, or both.
3. Whether post-processed assets belong in the repository by default or should be generated only on demand.
4. Whether the dashboard should remain client-side only or move toward a precomputed summary index.
