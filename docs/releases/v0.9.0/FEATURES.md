# v0.9.0 feature guide

Prepared 17 November 2026. Proposed release; deployment follows review and merge into `main`.

## Per-chip propagation waveguide review

In Propagation Loss, choose a chip and expand **Waveguides in fit** (collapsed by default). Each checkbox controls that waveguide's inclusion in the selected chip's propagation fit at every wavelength. The assigned length is displayed to two decimal places; calculation precision is preserved. Excluding WG3 leaves WG4 named WG4 with its original length.

Fits, MSE, propagation spectra and wafer-level results recalculate immediately. Chips with fewer than two distinct usable lengths remain selectable with an unavailable fit. **Include all waveguides** restores the chip. Original transmission traces remain visible, and excluded traces use a dashed line and an exclusion label. Raw WG1 transmission summary metrics remain independent of propagation fit selection.

Save or update a Dataset Snapshot to retain the review. Local projects, portable `.wstpkg` packages, published metadata, library indexes and analytics rebuilding retain `analyticsReview.excludedWaveguideIdsByChip`, for example:

```json
{"Chip4": ["WG3", "WG6"], "Chip6": ["WG2"]}
```

Waveguide exclusions affect the fit within a chip; chip exclusions separately control wafer summaries. Record the reason for exclusions in test-team comments. Original traces are preserved when preparing a dataset for GitHub publication.

## Accepted-chip propagation statistics

The propagation workspace reports the arithmetic mean, sample SD, SEM and two-sided 95% Student's t confidence interval for included chips passing the current MSE criteria with finite loss values. A collapsible distribution plot shows chip values and the wafer mean with a CI error bar. A CSV records statistics, inclusion rule, method and chip IDs/values. Empty/single-chip selections report unavailable spread/CI; the error bar is not an invented uncertainty for each chip. The CI assumes independent representative measurements; spatial correlation may make it too narrow.

## Electrical Analysis workspace

Upload `.txt`/`.csv` files ending in `_Chip#_D#`, for example `WaferThox_Wafer1_test1_Chip4_D2.txt`. The two columns are applied voltage in **V** and measured current in **A**. The filename prefix identifies the run, and chip/device IDs remain separate. Uploading the same run/chip/device replaces that device's sweep; other runs remain separate. Malformed rows are reported, and acquisition order is retained.

- **Inspect and compare:** focus one device, compare devices on one chip, choose individual curves, or display the entire run. Search by chip number(s), device or filename; filter by device ID and review flags.
- **Choose graphs:** I–V and power are initially shown. Enable resistance or residuals, fitted lines, sample markers, or the fitted voltage interval. Device details and wafermaps are optional.
- **Use figure legends:** single-click hides/shows a curve in that figure; double-click isolates it. Small comparisons use top legends; more than eight measured curves use scrollable side legends. Legend visibility is independent of fits, the comparison set and CSV selection.
- **Fit explicitly:** expand Fit settings, select one device or all loaded devices, and choose voltage bounds and an offset or forced-origin model. Editing all-device settings replaces individual overrides. Changes do not alter original samples.
- **Read results:** fitted resistance, median V/I, current offset, centred R², current RMSE, peak sampled power and review flags. The summary table is paginated and offers additional columns. The wafermap compares one device ID across all chips using the current optical workspace template; curve filters do not exclude map cells.
- **Save and export:** Save electrical workspace locally retains sources, selection, graph preferences, fit overrides and notes. Project JSON contains complete source text and restores the workspace. CSV export scope is explicit: comparison curves, all matching devices, or every loaded device. Point CSV always retains original samples and fit-inclusion flags.

## Meaning of electrical results

The default fit is `I = I₀ + G × V`, with conductance `G` in siemens (A/V) and resistance `Rfit = 1/G` in ohms. A forced-origin fit uses `I = G × V`. Point resistance `V/I` need not equal the fitted resistance when the response is nonlinear or the fitted current offset is nonzero. Power is `V × I` in watts, displayed as milliwatts.

This two-terminal measurement includes heater, contact, probe and lead resistance. Neither a linear fit nor a negative local slope establishes a device pass/fail verdict or physical cause. These files do not establish temperature, safe operating limits, compliance settings or optical phase-shift efficiency.

## Current limits

- Electrical projects use dedicated local saves and JSON; optical Dataset Snapshots, `.wstpkg`, GitHub dataset publishing and optical report generation are separate workflows.
- Browser storage is not a backup; export project JSON before moving laptops or clearing browser data. Wafermap coordinates follow the currently selected shared template, so verify that template after restoring on another browser.
- Figure legend toggles are figure-local and are not a stored measurement exclusion. A selected-device residual graph follows the inspection selection even if the comparison set contains other devices.
- All-device fits use every sample in the voltage bounds, including both directions of a returning sweep. Split directions into separate files if separate fits are required.
- Interactive graphs use the app's existing Plotly CDN dependency and require it to be reachable.

See the [user guide](../../USER_GUIDE.md) and [measurement glossary](../../MEASUREMENT_GLOSSARY.md).
