# Changelog
# Version: v0.3.1

## Added

- added a separate `Spectrum Viewer (Advanced)` library section
- added advanced wavelength-window zoom and vertical-range controls for spectrum review
- added automatic start/stop wavelength defaults based on uploaded trace ranges
- added advanced spectrum summary cards for peak detection, strongest peak, average FSR, and extinction ratio
- added `v0.3.1` release documentation

## Changed

- restored the simpler original `Spectrum Viewer` as the default quick-inspection workflow
- updated advanced wavelength bounds to zoom the x-axis view instead of removing off-window trace points
- updated advanced vertical controls to use dynamic `Loss (dB)` or `Power (W)` labels based on the selected display mode
- updated top-level documentation and in-app links to point to `v0.3.1`
- updated the app version in `package.json` to `0.3.1`

## Fixed

- fixed advanced spectrum uploads so they no longer appear in the standard spectrum viewer
- fixed the advanced spectrum state loop that could lock navigation after upload
- fixed the advanced `Loss min` and `Loss max` behavior for reversed `dB` axes
- fixed advanced PNG export sizing so saved figures follow the current figure dimensions more closely

## Documentation

- updated `README.md` to reflect the `v0.3.1` release focus
- updated the project version history for the `2026-08-17` patch release
- updated the versioning guide and roadmap notes for the spectrum workflow changes
