# Features — v0.8.0

Prepared 2026-09-23. Status: pending PR review and merge.

## CD-SEM import and etch-run comparison

Open Library → CD-SEM Data and import one or more `.txt`, `.csv`, `.xlsx` or `.xls` files with chip coordinates. The imported runs remain selectable during the current app session, including when you navigate to another workspace and return. Choose a run and a numeric measurement parameter to render its wafermap. Design width (nm) and dose (mJ) are displayed from the selected file when those columns are present.

Use the run comparison table to choose a parameter and compare its value at the selected chip across imported etch runs. If a run does not include that measurement column, the table says **Parameter unavailable in this run**; if the column exists but that chip has no value, it says **Site not measured**.

## Wafermap controls and colouring

The CD-SEM wafermap and the propagation-loss reference map sit side by side. Each map has independent controls for showing all, measured, passed or failed chips; displaying chip IDs, values or no overlay; and setting minimum, midpoint and maximum colour-scale limits.

When `waveguide_mid_nm` is selected and design width is available, the CD-SEM map colours sites by `abs(waveguide_mid_nm − design_width_nm)`: values closer to the target are green and larger deviations are red. Cell labels continue to show the measured value. Pass/fail filtering for CD-SEM requires an explicitly entered tolerance in nm; this value is a user-selected view threshold, not a cleanroom specification.

## Data availability

The checked step-5 export includes the `waveguide_mid_nm` header, but every value in that column is blank. The application therefore identifies the parameter as unavailable for that run. Step-18 data includes midpoint values and a design width, allowing target-relative colouring. Imported source records stay in browser memory for the current session and are not written to the GitHub measurement library by this feature.
