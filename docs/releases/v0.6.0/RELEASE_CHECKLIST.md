# Release checklist — v0.6.0

Prepared 2026-09-09. Status: pending PR review and merge.

- [x] Package version, README, Help links and release documentation updated.
- [x] Focused database regression suite: 11 tests passed.
- [x] Production Vite build passed (existing bundle-size and xlsx import warnings).
- [x] Local browser checked at http://127.0.0.1:4173/.
- [x] MPW48 step choices limited to Step31/Step31x; MPW46 adds Step36 in comparison.
- [x] Excel overview selector exposes all 245 records.
- [x] Comparison chart axes, grouping and point details checked; no browser console errors observed.
- [x] PDF generated and rendered for visual inspection; tabular layout verified.
- [x] Excel workbook structure, formulas, styling and collapsed outlines checked programmatically.
- [x] GitHub atomic publication and concurrent-edit protection tested with mocked responses.
- [ ] User reviews and merges release PR.
- [ ] Deployment succeeds after merge and production smoke check is completed.
- [ ] First real shared database upload is verified with repository permissions.
- [ ] Export formulas are verified by recalculation in native Excel.

Reproduce focused checks:

```sh
node --test --test-isolation=none scripts/test-mpw-database.mjs
node node_modules/vite/bin/vite.js build
```

Browser drafts and downloaded exports are not part of the source-code release.
