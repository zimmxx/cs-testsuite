# Features — v0.6.0

Prepared 2026-09-09. Status: pending PR review and merge.

## MPW Database

Open Library → MPW Database. Browse propagation loss, insertion loss and heater performance by platform, project, process step, slot, building block and optical mode. Child dropdowns follow their parent selections. Data from selects GitHub library, Excel overview, manual entries or all sources.

The bundled workbook contributes 245 records (64 propagation, 145 insertion, 36 heater), automatically loaded into new and existing browser drafts. Each source reference identifies its worksheet/cell. Unknown metadata is labelled; different parameter conventions and units remain separate.

Edit summary values or individual chips and include/exclude chips from the mean. Failed chips and missing values do not contribute. Manual records allow legacy measurements without raw files in the GitHub library. Local drafts are stored per repository/branch; chip traces are processed on demand.

## Exports and shared records

Excel contains Master Summary, Propagation Loss, Insertion Loss and Heater Performance worksheets. Component worksheets have collapsed chip rows and mean/count formulas. PDF contains landscape summary/component tables, repeated headers, source references, database version and generation date.

Refresh checks the configured GitHub repository. Upload writes a database JSON, README, version snapshot and Markdown update log in one Git commit, with conflict checks. The initial database revision is V1.0; it is separate from app v0.6.0. Repository write permissions are required.

## MPW Comparison

Open Library → MPW Comparison. Choose several projects and filter the shared draft by source, component, platform, step, slot, waveguide type, building block and mode. The table contains record averages; row checkboxes change only the comparison selection.

The chart displays one parameter/unit at a time. X axis supports MPW run, step, slot or platform. Colour and shape can distinguish waveguide family, mode, run or platform. Select or keyboard-focus a point to inspect its identity. Missing averages are omitted; records are never pooled into an average of averages.

## Boundaries

Historical summaries do not contain invented chip measurements. Library and workbook cohorts can overlap and need review. Existing spelling differences in platform/mode metadata remain visible. Native Excel recalculation and real GitHub publication require follow-up verification; automated publication tests use mocked GitHub responses. Local browser drafts are not shared until uploaded.

See [the operating guide](../../MPW_DATABASE.md).
