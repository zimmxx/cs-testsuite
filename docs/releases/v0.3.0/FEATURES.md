# Wafer Post-Processing Suite
# Features Reference
# Version: v0.3.0

## Release Summary

Version `v0.3.0` is a feature expansion release focused on linking cleanroom metrology with wafer-test analysis and improving visibility of published GitHub datasets.

This release adds:

- a new `CD-SEM Data` library section for importing coordinate-based metrology files
- automatic `(Column, Row)` to wafer-chip mapping using the active wafer template
- overlap review between CD-SEM measurements and propagation-loss chips
- a new `Dashboard` library section for filtering and summarizing published GitHub datasets
- on-demand propagation analytics for published GitHub library folders

## Main User Interface Areas

### 1. CD-SEM Data

Purpose:

- import CD-SEM measurement tables from the cleanroom team
- map coordinate-based measurements onto the same wafer layout used for optical review
- inspect whether CD-SEM variation appears to track propagation-loss behavior for overlapping chips

Current capabilities:

- accepts `.txt`, `.csv`, `.xlsx`, and `.xls` input files
- detects `chip`, `column`, and `row` style fields where possible
- auto-detects numeric CD-SEM parameter columns and chooses a likely `Si waveguide mid` style field when present
- maps `(Column, Row)` values onto the active wafer template
- renders a CD-SEM wafermap
- exports the mapped result table as CSV
- exports the wafermap as SVG
- reports overlap count and simple correlation against the currently loaded propagation-loss wafer

### 2. Dashboard

Purpose:

- give users one place to review everything currently published to the GitHub measurement-data library
- make it easier to inspect MPW coverage, platform coverage, and slot-level dataset availability

Current capabilities:

- reads the published GitHub manifest already used by the app dataset library
- filters by platform and project / MPW
- displays dataset-count summary cards
- shows compact visual summaries for platform coverage, active MPW runs, and measurement types
- computes average propagation loss, yield, and measured-chip counts for filtered GitHub datasets on demand
- allows quick loading of a selected published dataset back into the main workspace

## Main Source Additions

Implemented in:

- [src/components/CdSemLibraryPanel.jsx](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\components\CdSemLibraryPanel.jsx)
- [src/components/DatasetDashboardPanel.jsx](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\components\DatasetDashboardPanel.jsx)
- [src/lib/cdsem.js](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\lib\cdsem.js)
- [src/App.jsx](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\App.jsx)

## Dataset Model Notes

In `v0.3.0`:

- CD-SEM data is currently imported for review inside the app and mapped to wafer coordinates, but it is not yet published through the GitHub dataset package flow
- the dashboard uses the existing published manifest structure and does not yet require a new server-side index
- the current implementation is designed to prepare for a future shared storage structure where propagation and CD-SEM data can live under the same MPW and slot hierarchy

## Current Limitations In v0.3.0

- CD-SEM publishing to GitHub is not yet implemented
- correlation review is currently a lightweight overlap-and-trend view rather than a full statistical workflow
- dashboard analytics are calculated on demand from published trace files and are not yet cached into a dedicated enhanced manifest
- there is not yet a unified folder convention for storing propagation and CD-SEM outputs together in the repository
