# Release Checklist
# Version: v0.4.0

## Completed Locally

- [x] CORNERSTONE logo exists at `public/assets/CORNERSTONE_Logo.png` and matches the supplied PNG by SHA-256 hash.
- [x] README, version history, versioning guide, feature reference, changelog, and roadmap are updated.
- [x] App development screenshots are catalogued in `Screenshot - App Development/`.
- [x] Stakeholder presentation exists at `docs/CORNERSTONE_Wafer_Post-Processing_Suite_Overview_v0.4.0.pptx` with speaker notes on all 15 slides.
- [x] Production Vite build passes locally.
- [x] Browser smoke test loads `MPW48_Slot7_Rib` and displays the expected propagation summary.
- [x] Wafer Scale Min accepts clear-and-replace keyboard input.
- [x] Reset Scale restores the dataset-derived minimum, midpoint, and maximum.
- [x] No relevant browser console warnings or errors were found in the tested flow.

## Release Gate Completed

- [x] Integrated the release onto the latest `origin/main` on 2026-08-21, retaining the newer PowerPoint wafermap aspect-ratio fix.
- [x] Kept separate dataset metadata/configuration edits and the older root-level presentation out of this release.
- [x] Staged only approved release paths; broad staging commands were not used.
- [x] Re-ran the production Vite build after integration (444 modules transformed successfully).
- [x] Repeated the dataset-load and wafer-scale keyboard/reset smoke test after integration.
- [x] Reviewed the final diff, new binary sizes, and commit scope.
- [x] Received user approval to push the validated release directly to `main`.

## Suggested Release Commit Scope

- application source changes in `src/`
- `public/assets/CORNERSTONE_Logo.png`
- `package.json`
- `.gitignore`
- `README.md`
- `docs/`
- `Screenshot - App Development/`

Dataset metadata/configuration edits, the pre-existing root-level `CORNERSTONE_Testing_App_V1.0.pptx`, and local scratch files were excluded and remain available for separate review.
