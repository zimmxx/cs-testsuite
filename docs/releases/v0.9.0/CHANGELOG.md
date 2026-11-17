# v0.9.0 change log

Prepared 17 November 2026; pending review and merge.

## Added

- Propagation ANOVA workspace: saved-review/current/CSV chip groups, selectable Welch/classical tests, group distributions, variance diagnostic, Holm pairwise comparisons, classical effect sizes and CSV/JSON exports.
- ANOVA independence/overlap validation, retained processing provenance and numerical regression fixtures checked against published references and analytic probabilities.
- Electrical Analysis workspace with filename-aware DC sweep parsing, I–V/resistance/power/residual plots, device summaries and chip-linked wafermaps.
- Searchable custom comparisons, optional graphs, paginated tables, explicit CSV export scopes, local persistence and portable project JSON.
- Per-device electrical fit overrides and all-device settings, preserving original measurements.
- Per-chip propagation waveguide exclusions with stable identifiers and lengths, two-decimal display and collapsed review controls.
- Accepted-chip propagation mean, sample SD, SEM and 95% Student's t CI, with chip-distribution/error-bar plot and method-labelled CSV export.
- Regression coverage for electrical calculations, view filtering, persistence and propagation review round trips; pull-request validation workflow.

## Changed

- Propagation fitting and comparison honour stored waveguide selections. Raw transmission traces and WG1 summary metrics remain available independently of fit exclusions.
- Chips without usable propagation fits remain available for review and restoration.
- Dataset metadata, library indexes, portable snapshots and analytics rebuilding preserve waveguide exclusions.
- Electrical legends remain interactive with large comparison sets; side legends scroll instead of occupying the plot area.
- README, user guide, glossary and in-app release links document the revised workflows and limitations.

The branch also incorporates current `main`, including insertion-conversion updates and published measurement datasets; these are retained rather than replaced.
