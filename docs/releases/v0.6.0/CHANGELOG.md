# Changelog — v0.6.0

Prepared 2026-09-09. Status: pending PR review and merge.

## Added

- MPW Database and MPW Comparison Library sections, including direct URL hashes.
- Summary and chip-level editing, manual records, browser draft persistence and on-demand library analysis.
- 245 historical Excel overview records and a reproducible read-only extraction script.
- Four-sheet styled Excel exports with collapsed chip details and formulas.
- Tabular landscape PDF exports with repeated headings and source-reference appendix.
- GitHub refresh/publication, JSON backups, version snapshots and Markdown update history.
- Comparison filters, multi-project selection, record inclusion controls and an accessible SVG chart.
- Focused regression tests and a database operating guide.

## Fixed

- Process-step and other child filters now follow the selected project and parent filters.
- Excel overview records load automatically rather than requiring a separate manual import in each browser.
- Missing, failed and excluded chip values do not contribute to means or become zero; edited records survive refresh.

## Changed

- App package version 0.5.0 → 0.6.0, with updated README, Help links, project history and roadmap.
- Database revisions remain independent of the app version.

## Validation and limitations

See [release checklist](RELEASE_CHECKLIST.md). No shared measurement database is published by this application-code release. Real publication permissions and native Excel recalculation remain follow-up checks.
