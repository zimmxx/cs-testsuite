# Changelog — v0.8.0

Prepared 2026-09-23. Status: pending PR review and merge.

## Added

- Multi-file CD-SEM import and comparison of matched chip sites across etch runs.
- Side-by-side CD-SEM and propagation-loss wafermaps with independent display modes, overlays and editable colour scales.
- Design-width-relative colouring for `waveguide_mid_nm`, with run design width and dose shown after import.
- Explicit unavailable-parameter reporting in etch-run comparisons and optional tolerance-based pass/fail filtering.
- CD-SEM metadata-column detection so batch, dose, etch step and design width are not treated as measurement parameters.

## Changed

- CD-SEM state and imported runs remain available while switching to another workspace in the same app session.
- App package version changed from `0.7.0` to `0.8.0`.

## Data handling

- No cleanroom measurement files or imported measurement records are included in this application-code release.
- Step 5 source data has a `waveguide_mid_nm` column with blank values; the comparison reports the parameter as unavailable where it was not measured.
