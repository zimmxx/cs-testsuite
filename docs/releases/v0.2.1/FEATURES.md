# Wafer Post-Processing Suite
# Features Reference
# Version: v0.2.1

## Release Summary

Version `v0.2.1` is a focused patch release for the manual-measurement conversion workflow.

This release adds:

- correct `RIB`, `STRIP`, and explicit waveguide-folder detection during manual conversion
- editable output filenames before saving converted traces
- consistent filename overrides across single-file download, ZIP export, and manifest export

## Main User Interface Areas

### 1. Manual Measurement - Conversion

Purpose:

- translate nested manual measurement Excel folders such as `MPW46/SLOT5/Chip3/STRIP/WG1.xlsx` into WST-compatible traces
- let users inspect and adjust output trace names before export

Current capabilities:

- drag folder upload from Edge or Chrome with subfolder awareness
- automatic detection of `Slot`, `Chip`, and `WG` identifiers from folder structure
- improved waveguide-family detection for `RIB`, `STRIP`, and explicit waveguide folder names
- editable output filename field for every converted workbook
- individual trace download using the edited filename
- ZIP export using the edited filenames
- manifest export using the edited filenames

## File Translation Layer

Implemented in:
- [src/lib/manualConversion.js](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\lib\manualConversion.js)

Notable `v0.2.1` updates:

- narrowed folder-token matching so slot identifiers like `SLOT7` are not misread as the waveguide family
- preserved correct rib-versus-strip naming in converted trace outputs

## Manual Conversion Panel

Implemented in:
- [src/components/ManualConversionPanel.jsx](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\components\ManualConversionPanel.jsx)

Notable `v0.2.1` updates:

- added inline filename editing for converted outputs
- applied edited filenames to download, ZIP, and manifest flows
- kept a safe fallback filename when the edited field is left blank

## Current Limitations In v0.2.1

- manual conversion still depends on recognizable folder tokens for the best automatic metadata extraction
- ambiguous project roots without `MPW` naming still fall back to `MPWUNDEFINED`
- filename editing is currently per converted file rather than using a bulk rename rule
