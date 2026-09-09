# MPW Database

Open **Library → MPW Database**, or `http://127.0.0.1:4173/#mpw-database`.

The first visit reads the bundled library analytics and automatically includes the 245 Excel overview records. Existing browser drafts also receive missing overview records without replacing manual edits. **Refresh database** reads the configured GitHub repository and branch directly, including the shared database when it exists. The browser retains a separate draft for each repository/branch. Refresh and upload report errors rather than presenting a fallback as a successful sync.

## Finding and reviewing measurements

- Use the project, platform, process step, slot, building block, optical mode and source filters, or search `MPW48 Slot5 Strip`.
- Master Summary covers all measurement types; the other tabs select Propagation Loss, Insertion Loss or Heater Performance.
- Each row is a distinct measurement cohort and parameter. Geometry, optical mode, source date and units remain explicit. The database does not average different records together.
- Summary-only records retain the source average. Missing values are not zero, and individual chips are never invented from an average.
- Expand a library row and choose **Load chip results** to analyse the underlying traces with the existing suite algorithms. This is deliberately on demand because raw datasets can be large. A saved chip record can subsequently be shared without downloading those raw traces again.
- Enable **Edit database** to include/exclude chips. Failed chips do not contribute. Unreviewed chips contribute only when checked; missing values never contribute. Standard deviation is the sample SD (N−1), and requires at least two values.
- Propagation uses saved fit settings and published route lengths. Database analysis is isolated from the active workspace’s settings. Its default trace convention is watts with a 10 dBm launch power, matching the existing library analytics; assumptions are recorded. For other trace conventions, publish processed records or enter reviewed values manually.
- Insertion chip loading reports measured-path peak loss in dB, with no implicit per-device or splitting-loss correction. Multi-device datasets must supply separate processed records rather than pooling components. Manual and processed records can specify corrected dB/unit values explicitly.

## Manual and historical records

**Add record** accepts summary values or a list of chip values. Supply a meaningful building block including heater width/length or MMI variant. Use distinct parameter names for Ppi, Vpi, Vpi × L and FSR, and for raw versus corrected insertion loss. Missing metadata should be labelled `Unknown`.

**Data from → Excel overview** selects the 245 automatically loaded numeric parameter records extracted from `MPW_Measurement_DATA_OVERVIEW_01_06_2026.xlsx`:

| Category | Records |
| --- | ---: |
| Propagation Loss | 64 |
| Insertion Loss | 145 |
| Heater Performance | 36 |

The import excludes the DRAFT sheet, target rows and cross-project AVERAGE rows. Identical heater values duplicated across sheets are deduplicated. Distinct values are retained with exact worksheet/cell references. Unknown MMI platforms and FSR units are labelled explicitly. No raw/corrected/absolute-corrected MMI values are combined. Importing twice does not duplicate IDs. The source workbook is never modified.

The read-only extraction can be reproduced with:

```text
python scripts/import-mpw-reference.py path/to/MPW_Measurement_DATA_OVERVIEW_01_06_2026.xlsx
```

**Import JSON** validates schema version 1 and adds IDs not already present. Existing IDs are preserved. To reconcile an existing record, use its editor; JSON import does not silently replace it.

## Exports

Choose **Current view** or **Full database**, then:

- **Export Excel** creates Master Summary, Propagation Loss, Insertion Loss and Heater Performance worksheets. Headers, column widths, wrapped text, frozen identity columns and filters support browsing. Chip detail rows are collapsed using native Excel outlines. Expand with Excel’s `+`, and change `Include (1/0)` to recalculate the mean and included count. Master Summary links to those calculations. SD/min/max are explicitly labelled export-time snapshots; they are recalculated on the website and refreshed by re-exporting. Excel changes do not sync back to the website automatically.
- **Generate PDF** produces a paginated CORNERSTONE MPW Measurement Records report with version, generation UTC timestamp, selection scope, units, chip coverage and source references.
- **Download JSON backup** preserves the entire draft, including chip reviews and update history.
- **Download update log (.md)** generates the current Markdown history, including local edits.

## GitHub persistence and versioning

Use the existing GitHub settings in **Dataset Snapshots**. A token needs Contents write access to the intended repository. Enter an editor name and an update note, then choose **Upload database to GitHub**. The first publication is V1.0; subsequent publications increment the minor version.

One atomic commit writes:

```text
public/mpw-database/database.json          Current shared database
public/mpw-database/README.md              Current Markdown update log
public/mpw-database/versions/V1.0.json     Immutable version snapshot
public/mpw-database/history/V1.0.md        Version-specific update record
```

These shared files are created by the upload action. `reference-records.json` is the optional workbook import, separate from the shared database. Tokens are never included in database files, exported backups, reports or Markdown logs. The recorded editor name is an attribution field; the GitHub commit identity supplies the authenticated repository audit trail.

Before writing, the uploader reads the database at a pinned branch commit and compares its file SHA against the last refreshed version. It creates the four files together and advances the branch without force. Concurrent changes reject the upload. A stale local draft remains intact. **Load shared version** downloads the previous draft as a backup before replacing the browser copy; reconcile conflicting entries explicitly in the editor.

The publisher uses the documented [GitHub references API](https://docs.github.com/en/rest/git/refs): the singular `git/ref` endpoint reads the branch, while `git/refs` updates it.

Each local mutation records a timestamp, editor and action in JSON history. A Markdown file is materialised on export and for each published version. The browser cannot continuously write files into a repository without an explicit upload action.

## Processed-data contract

Library analytics entries may contain `processedRecords`, an array of database records. This supports independently processed propagation, insertion and heater results with explicit parameters, units and chips. Without it, the adapter reads `propagationAverage`, `insertionAverage` or `heaterEfficiencyAverage` from `analyticsSummary`. Absent metrics remain blank. Coupling-loss records are not silently treated as per-unit MMI insertion loss.

Example record:

```json
{
  "id": "mpw48-step31-slot5-strip-propagation-1550te",
  "project": "MPW48",
  "platform": "SOI220nmPassive",
  "step": "Step31",
  "slot": "Slot5",
  "buildingBlock": "STRIP_Waveguide",
  "opticalMode": "1550nm_TE",
  "metric": "propagation",
  "parameter": "Propagation loss",
  "unit": "dB/cm",
  "date": "2026-08-06",
  "method": "OperatorAlign",
  "source": "library",
  "sourceRef": "sample-data/wst/<dataset-folder>",
  "summaryValue": null,
  "chips": [
    { "id": "Chip2", "value": 2.491, "status": "passed", "included": true, "reason": "Reviewed fit" }
  ]
}
```

## Validation

```text
node --test --test-isolation=none scripts/test-mpw-database.mjs
node node_modules/vite/bin/vite.js build
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort
```

Tests cover zero/missing/failed/excluded chips, refresh preservation, historical extraction, workbook formulas and outlines, PDF pagination, atomic publication and stale-version rejection. GitHub writes are tested against mocked responses, so validation does not publish test data to the real repository.

## Comparison and tabular reports

**Library → MPW Comparison** (`#mpw-comparison`) reads the same browser draft. Choose multiple projects, platform, process step, slot, waveguide family, building block and optical mode. The table contains one average per record. Unchecking a row excludes it only from the comparison. Reload database reads the latest saved draft; use MPW Database to refresh from GitHub.

The chart shows one parameter/unit at a time, with MPW run, step, slot or platform on the x axis. Colour and shape distinguish waveguide family, optical mode, run or platform. Select or keyboard-focus a point to see its measurement identity. Horizontal offsets improve visibility and carry no numeric meaning. Records are never pooled into an average of averages; missing values are omitted.

Database filters cascade in platform → project → step → slot → building block → optical mode order, constrained by source and component. Changing a parent clears its child selections. Data from supports All, GitHub library, Excel overview and Manual entries.

PDF exports use landscape Master Summary and component tables, repeated headers, version/date/page footers and a source-reference appendix. Current-view exports respect the source selector and all filters.
