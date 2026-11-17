# v0.9.0 release checklist

Prepared 17 November 2026.

- [x] Regression command passes: 68 tests (ANOVA, dataset adapters, electrical, view/persistence, propagation, statistics, insertion conversion and MPW database).
- [x] Production build completes. Existing large-chunk and mixed static/dynamic `xlsx` import warnings remain.
- [ ] PR validation workflow passes against current `main`.
- [x] Propagation review: synthetic browser check verified middle-WG exclusion, unchanged successor ID/length and chip isolation; save/package round trips covered by regression tests.
- [x] Propagation statistics: browser check with 2/4/6 dB/cm confirms n=3, mean=4, SD=2, SEM=1.155 and 95% CI; single-chip selection reports unavailable spread/CI. Empty cases and t critical values covered by tests.
- [x] ANOVA: browser check verified synthetic Welch/classical results, pairwise table, distribution chart, group-toggle result invalidation, repeated chip/wafer blocking, report CSV and project JSON download, and JSON restoration with fresh acknowledgement. Regression checks cover a published SciPy classical fixture, hand-calculated Welch F/df, analytic F tails, Holm, JSON/CSV validation and saved chip/waveguide/MSE selection.
- [x] Electrical review: supplied sweeps and the saved 81-device workspace were checked; custom search/selection, legend toggling/isolation and per-device fit isolation verified.
- [x] Electrical persistence and exports: local save/reload and JSON/CSV round trips checked; export scopes verified against 2 comparison curves, 4 filtered devices and all 81 loaded devices.
- [ ] Verify Help renders the updated user guide and glossary; release links resolve after merge.
- [x] Source diff excludes measurement uploads, local exports, generated build output and the unrelated folder-renaming utility. Existing published data and audit code match `origin/main`.
- [ ] Review and merge through GitHub; merging `main` triggers the existing Pages deployment.

Validation evidence and any remaining limitations are recorded in the pull request. Unchecked items require reviewer or CI confirmation before release.

## Existing library audit findings

The read-only WST library audit on the inherited `main` data reports 1,385 errors and 13 warnings across 36 folders / 1,307 traces. Findings include library index counts, checksums/sizes, missing or inconsistent metadata/configuration, and index membership. The public library files and audit script are unchanged by this PR, so this is recorded as an existing data/catalog issue rather than repaired by changing measurements during a source-code update. On Windows, investigate checkout line-ending effects when reviewing checksum/size differences. The feature tests/build pass; the broader library audit is not clean. Keep the PR in draft until the reviewer accepts this boundary or the library is repaired separately.
