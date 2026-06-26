# Wafer Post-Processing Suite
# Features Reference
# Version: v0.1.0

## Release Summary

Version `v0.1.0` is the first documented web-based release of the Wafer Post-Processing Suite.

It provides:

- a multi-panel dashboard UI
- upload support for `.txt`, `.csv`, `.xlsx`, and `.xls`
- normalization of different source formats into one shared dataset
- propagation loss, insertion loss, and heater efficiency analysis
- wafermap visualization
- report preview and export state generation

## Main User Interface Areas

### 1. Sidebar Navigation

Implemented in:
- [src/App.jsx](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\App.jsx)
- [src/styles.css](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\styles.css)

Purpose:

- gives a dashboard-like application feel
- provides main navigation categories
- separates workspace functions from library/settings functions

Current sections:

- Workspace
  - Intake
  - Propagation Loss
  - Insertion Loss
  - Heater Efficiency
  - Wafermap
  - Report
- Library
  - Projects
  - Datasets
  - Settings
  - Audit Log
  - Help

### 2. Top Filter Bar

Purpose:

- lets the user define project, wafer, and date context
- contains the upload entry point

Current controls:

- Project selector
- Wafer selector
- Date selector
- Upload Measurement Files button

### 3. Intake Tab

Purpose:

- acts as the translation and mapping workspace
- lets incoming source columns be mapped into the canonical analysis schema

Current capabilities:

- auto-detect some common column names
- show editable mapping fields
- define a default metric family when source data does not specify it

### 4. Propagation Loss Tab

Purpose:

- fit transmission versus relative length
- estimate propagation loss in `dB/cm`

Current outputs:

- KPI card for mean propagation loss
- plot of transmission versus relative length
- fit results panel
- wafermap metric mode support

Formula logic:

- implemented in [src/lib/analysis.js](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\lib\analysis.js)
- uses a linear regression on propagation rows

### 5. Insertion Loss Tab

Purpose:

- estimate insertion loss of building blocks in `dB`

Current outputs:

- insertion loss metric grouping by chip and block
- wafermap summary per die

Current logic:

- averages insertion loss by block
- falls back to absolute transmission when direct insertion loss is not available

### 6. Heater Efficiency Tab

Purpose:

- estimate MZI heater efficiency in `mW/pi`

Current outputs:

- heater efficiency wafer metric
- heater KPI summaries

Current logic:

- prefers direct `pi_power_mw`
- can derive heater power from current and voltage when needed

### 7. Wafermap Tab

Purpose:

- show die-level metric values spatially

Current capabilities:

- metric switching between propagation, insertion, and heater
- die selection highlighting
- color scale display

Current rendering:

- simplified circular wafer representation
- grid-based die positioning

### 8. Report Tab

Purpose:

- present an export-ready summary of wafer quality

Current capabilities:

- report preview card
- summary statistics
- highlight lists
- export state generation

Current export behavior:

- report state is generated in the app
- export is currently JSON-oriented rather than a final formatted PDF report

## File Translation Layer

Implemented in:
- [src/lib/parsers.js](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\lib\parsers.js)

Supported source formats:

- `.txt`
- `.csv`
- `.xlsx`
- `.xls`

Core translation functions:

- `readFileRows(...)`
- `inferColumnMap(...)`
- `buildNormalizedRows(...)`
- `normalizedRowsToCsv(...)`

Canonical normalized fields:

- `source_name`
- `source_type`
- `chip_id`
- `die_x`
- `die_y`
- `metric_family`
- `block_name`
- `waveguide_type`
- `wavelength_nm`
- `relative_length_mm`
- `transmission_db`
- `insertion_loss_db`
- `heater_power_mw`
- `pi_power_mw`
- `phase_shift_pi`
- `current_ma`
- `voltage_v`

## Dataset Table

Purpose:

- show normalized rows in a reviewable table
- give a quick inspection layer before export or reporting

Current capabilities:

- row search
- CSV export
- basic metric lookup by chip

## File Translator Status

Purpose:

- provide feedback after upload and normalization
- show source name and source type
- summarize total rows and matched/unmatched device counts

## Current Limitations In v0.1.0

- report export is not yet a polished final report generator
- plot support is strongest for propagation loss at present
- wafermap is currently a stylized grid approximation, not a fabrication-accurate die mask
- multiple uploaded source files are not yet merged through a full dataset management workflow
- project, wafer, and date selectors are currently UI-driven rather than backed by persistent storage

## Priority Upgrade Ideas For Later Versions

- true multi-file intake and merge logic
- saved projects and datasets
- stronger report export formats such as PDF
- richer insertion/heater visualizations
- persistent settings and audit history
- more advanced wafer exclusion and pass/fail overlays
