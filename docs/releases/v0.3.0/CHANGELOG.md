# Changelog
# Version: v0.3.0

## Added

- added a new `CD-SEM Data` library section
- added coordinate-based CD-SEM import support for `.txt`, `.csv`, `.xlsx`, and `.xls`
- added wafer-template mapping from `Column` and `Row` to chip positions
- added CD-SEM wafermap export as SVG and mapped-data export as CSV
- added overlap review between CD-SEM values and propagation-loss chips
- added a new `Dashboard` library section for GitHub library coverage review
- added on-demand analytics for published GitHub datasets from the dashboard
- added release notes for `v0.3.0`
- added `docs/suggested_update.md` for roadmap follow-up

## Changed

- updated the app sidebar to include `CD-SEM Data` and `Dashboard`
- updated top-level documentation links to point to `v0.3.0`
- updated the app version in `package.json` to `0.3.0`
- updated the in-app documentation references to the latest release notes

## Fixed

- reduced duplication between GitHub dataset loading and dashboard analysis by reusing a shared bundled-dataset loader path

## Documentation

- updated `README.md` to reflect the new library sections and release state
- updated the project versioning guide and version history for the `2026-08-13` feature release
