# Wafer Post-Processing Suite
# Features Reference
# Version: v0.1.0

## Release Summary

Version `v0.1.0` is the first documented web-based release of the Wafer Post-Processing Suite.

It now provides:

- a multi-panel dashboard UI
- upload support for `.txt`, `.csv`, `.xlsx`, and `.xls`
- normalization of different source formats into one shared dataset
- propagation loss, insertion loss, and heater efficiency analysis
- wafermap visualization
- report preview and export state generation
- manual measurement conversion into WST-compatible traces
- standardized filename conversion for dataset preparation
- a GitHub-backed measurement dataset library
- cross-dataset comparison for wafer/process variation review

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
  - Propagation Loss
  - Insertion Loss
  - Heater Efficiency
- Library
  - Projects
  - Datasets
  - Manual Conversion
  - Comparison
  - Filename Conversion
  - Wafermaps
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

### 3. Propagation Loss Tab

Purpose:

- fit transmission versus relative length
- estimate propagation loss in `dB/cm`
- review wavelength-dependent propagation variation using interval-based linear fits

Current outputs:

- KPI card for mean propagation loss
- interactive plot of transmission versus relative length
- fit results panel
- propagation spectrum with wavelength interval analysis and MSE tracking
- wafermap metric mode support
- transmission spectrum overlay by waveguide length

Formula logic:

- implemented in [src/lib/analysis.js](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\lib\analysis.js)
- uses a linear regression on propagation rows

### 4. Insertion Loss Tab

Purpose:

- estimate insertion loss of building blocks in `dB`

Current outputs:

- insertion loss metric grouping by chip and block
- wafermap summary per die
- chip-level inspector view

Current logic:

- averages insertion loss by block
- falls back to absolute transmission when direct insertion loss is not available

### 5. Heater Efficiency Tab

Purpose:

- estimate MZI heater efficiency in `mW/pi`

Current outputs:

- heater efficiency wafer metric
- heater KPI summaries
- chip-level inspector view

Current logic:

- prefers direct `pi_power_mw`
- can derive heater power from current and voltage when needed

### 6. Datasets Library

Purpose:

- save browser snapshots of normalized workspaces
- load bundled or GitHub-hosted measurement datasets
- optionally publish selected snapshots into the shared GitHub measurement-data library

Current capabilities:

- GitHub token storage in browser-local settings
- GitHub library refresh
- dataset snapshot save/load/delete
- GitHub publish status badges

### 7. Manual Measurement - Conversion

Purpose:

- translate nested manual measurement Excel folders such as `MPW46/SLOT5/Chip3/STRIP/WG1.xlsx` into WST-compatible traces

Current capabilities:

- reads `WG*.xlsx` or `WG*.xls`
- detects wavelength and IL columns
- converts IL + launch power into optical power in watts
- exports trace files as `.txt` or `.csv`
- exports standardized zip and manifest names

### 8. Comparison Library

Purpose:

- compare two or more wafer datasets across MPW runs, slots, modes, or waveguide families

Current capabilities:

- loads datasets from the GitHub library or saved local snapshots
- compares propagation yield, average propagation loss, insertion loss, peak wavelength, and bandwidth
- shows side-by-side wafermaps using a shared colour scale
- helps review fabrication/process variation across silicon photonics datasets

### 9. Filename Conversion

Purpose:

- standardize trace and dataset filenames before they are saved to GitHub

Current capabilities:

- detects tokens such as `MPW`, `Slot`, `Chip`, `WG`, measurement mode, and waveguide family
- lets the user correct missing chip/WG fields
- exports a renamed archive and manifest using the standard dataset naming rule

### 10. Wafermaps

Purpose:

- create reusable wafermap templates for different chip populations and notch orientations

Current capabilities:

- built-in bottom-notch reference template
- custom center-filled wafer template generation
- reusable template save/load/delete workflow

### 11. Report Preview

Purpose:

- present an export-ready summary of wafer quality

Current capabilities:

- report preview card
- summary statistics
- highlight lists
- HTML and JSON report export state generation

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

## Naming Standard Layer

Implemented in:
- [src/lib/filenameStandardization.js](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\src\lib\filenameStandardization.js)
- [docs/DATASET_FILENAME_STANDARD.md](C:\Users\ahs2u23\OneDrive - University of Southampton\Documents\CORNERSTONE Testing App\docs\DATASET_FILENAME_STANDARD.md)

Purpose:

- keep converted traces, dataset labels, and archives consistent
- make GitHub dataset folders easier to compare and maintain
- prepare future datasets for the Comparison library

## Current Limitations In v0.1.0

- comparison currently focuses on wafer-level summaries and wafermaps rather than every possible figure from the main workspace
- GitHub publish still requires a correctly scoped fine-grained personal access token
- filename conversion helps standardize naming but still depends on the user correcting missing metadata when source folders are ambiguous
- report export is currently HTML/JSON oriented rather than a final PDF engineering report

## Priority Upgrade Ideas For Later Versions

- richer comparison plots for every metric family
- manual authoring/import of wafermap templates from uploaded template files
- stronger report export formats such as PDF
- deeper insertion/heater visualization sets
- comparison-aware statistical tolerancing across MPW batches
