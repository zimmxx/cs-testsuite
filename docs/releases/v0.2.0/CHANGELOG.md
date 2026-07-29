# Changelog
# Version: v0.2.0

## Added

- Spectrum Viewer workspace for ad hoc spectrum inspection
- Excel insertion-loss support using the `IL` worksheet
- automatic input-unit defaults for Spectrum Viewer uploads
- transmission-spectrum overlay controls with per-trace visibility
- device-aware insertion-loss analysis for `Grating Couplers`, `MMI`, and `Other Device`
- grating-coupler wafer characterization using `WG1` or the shortest propagation reference trace
- insertion metrics for peak wavelength, insertion loss at peak, insertion loss at `1550 nm`, `3 dB` bandwidth, and spectral flatness
- chip-by-chip insertion performance table
- wafer-wide variation overlay for insertion spectra

## Changed

- repurposed the insertion-loss workspace into a building-block characterization tool across all chips
- kept Spectrum Viewer as the flexible workspace for arbitrary uploaded device traces
- improved insertion figures so users can inspect both a selected chip and wafer-wide variation in one workflow
- refined overlay layout and figure sizing for better visual review
- removed unnecessary per-trace inspect buttons from the insertion overlay view

## Fixed

- corrected Spectrum Viewer Excel parsing when wavelength and IL columns come from the `IL` worksheet
- fixed insertion-spectrum dB display orientation to follow positive-loss convention
- fixed automatic input-unit selection for Excel versus text uploads
- fixed stale chip-selector references that caused runtime crashes in the updated insertion workspace
- fixed overlay figure sizing so the all-chip spectrum can render at a practical width

## Documentation

- added release notes for `v0.2.0`
- updated app and README version references to the new release
- recorded the current development milestone in project version history
