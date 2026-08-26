# PDKMonitor nested test-data workflow

**Owner:** Aiman Hazim Shafizam (CORNERSTONE)

**Prepared:** 2026-08-26

**Status:** Use after PDKMonitor can preserve nested Tests folders during GitHub publish and fetch.

## Purpose

This checklist covers loading the MPW48 strip-waveguide propagation-loss data
into the existing PDKMonitor building block:

`SOI220nm_1550nm_TE_STRIP_Waveguide`

The short trace names (`Chip#_WG#.txt`) remain the standard. Dataset identity
comes from the folder hierarchy and the accompanying metadata/configuration
files.

## Important safeguards

- Treat `cs-testsuite/public/sample-data/wst` as the source of truth.
- Do not rename the current short trace files.
- Do not publish anything to `cornerstone-uos/PDKMonitor`.
- Do not use **Direct commit** while validating the repaired feature.
- Test the complete publish-and-fetch round trip in a fork or review branch
  before publishing to a shared repository.
- Do not remove the empty `Files` folder if PDKMonitor requires it internally.

## Required PDKMonitor folder structure

Create this hierarchy in the building block's **Tests** tab:

```text
Tests
├── Files                         (may remain empty)
└── MPW48
    ├── Slot5_Step31
    ├── Slot7_Step31
    ├── Slot8_Step31
    └── Slot9_Step31
```

Do not place the slot files directly in `MPW48`. Each slot must retain its own
configuration and metadata.

## Dataset upload map

Upload every file from each source directory into the matching PDKMonitor
subfolder.

| PDKMonitor destination | Local source directory | TXT traces | Total files |
|---|---|---:|---:|
| `MPW48/Slot5_Step31` | `public/sample-data/wst/MPW48_SOI220nmPassive_Slot5_Step31_1550nm_TE_STRIP_Waveguide_PropagationLoss_OperatorAlign` | 40 | 45 |
| `MPW48/Slot7_Step31` | `public/sample-data/wst/MPW48_SOI220nmPassive_Slot7_Step31_1550nm_TE_STRIP_Waveguide_PropagationLoss_OperatorAlign` | 40 | 45 |
| `MPW48/Slot8_Step31` | `public/sample-data/wst/MPW48_SOI220nmPassive_Slot8_Step31_1550nm_TE_STRIP_Waveguide_PropagationLoss_OperatorAlign` | 40 | 45 |
| `MPW48/Slot9_Step31` | `public/sample-data/wst/MPW48_SOI220nmPassive_Slot9_Step31_1550nm_TE_STRIP_Waveguide_PropagationLoss_OperatorAlign` | 50 | 55 |

Each dataset directory should contribute these five supporting files in
addition to its TXT traces:

- `metadata.json`
- `route-config.json`
- `waveguide-config.json`
- `filename-manifest.csv`
- `README.md`

The four slot folders should contain **190 files in total**.

## Upload procedure

1. Open `SOI220nm_1550nm_TE_STRIP_Waveguide` in PDKMonitor.
2. Open the **Tests** tab.
3. Create the top-level folder `MPW48`.
4. Inside `MPW48`, create `Slot5_Step31`, `Slot7_Step31`, `Slot8_Step31`, and
   `Slot9_Step31`.
5. Open one slot folder.
6. Select **Add files** and upload all files from its mapped local directory.
7. Wait for parsing to finish before starting the next slot.
8. Confirm the expected file count for that slot.
9. Confirm `route-config.json`, `waveguide-config.json`, and `metadata.json` are
   visible alongside the trace files.
10. Repeat for the remaining slots.

## Analysis scripts

Add or update these scripts in the building block's **Scripts** tab:

- `plot_transmission_Aiman_W_v1`
- `plot_transmission_Aiman_dB_v1`
- `plot_multi_transmission_Aiman_v1`
- `plot_prop_loss_fit_Aiman_v1`
- `plot_prop_loss_spectrum_Aiman_v1`

### Run on one trace

Open an individual `Chip#_WG#.txt` test card and run:

- `plot_transmission_Aiman_W_v1` for optical power in watts.
- `plot_transmission_Aiman_dB_v1` for peak-normalised transmission in dB.

### Run over one slot folder

Open a `Slot#_Step#` folder and use **Run script over folder** for:

- `plot_multi_transmission_Aiman_v1` — one transmission panel per chip, with
  WG legends and an inverted Loss (dB) axis at 5 dB intervals.
- `plot_prop_loss_fit_Aiman_v1` — propagation-loss fit, MSE, R², 95%
  confidence bounds, pass/fail status, yield, and average loss.
- `plot_prop_loss_spectrum_Aiman_v1` — propagation loss and MSE versus
  wavelength for every chip.

Never run the propagation scripts over the parent `MPW48` folder. Each slot
has its own route configuration and must be analysed independently.

## Basic validation

For every slot, check that:

- all expected traces are listed;
- the script output says it read `route-config.json`;
- the reported route lengths match that slot's configuration;
- the plotted chip count matches `metadata.json`;
- no file is reported as replaced because another slot used the same short
  filename;
- the figure opens successfully and the diagnostic text is complete.

Known reference for `Slot5_Step31`:

- 40 traces
- 10 chips
- route lengths: `0, 5, 10, 15 mm`
- 10/10 passing
- yield: `100%`
- average propagation loss: `2.418330 dB/cm`

## Configuration checks requiring attention

Before treating every result as final, review these existing metadata issues:

- `Slot7_Step31` contains WG1-WG4 traces and its route configuration defines
  four routes, but `metadata.json` currently reports `waveguideCount: 6`.
- `Slot9_Step31` contains WG1-WG5 traces, but its current `route-config.json`
  defines lengths only for WG1-WG4. The propagation scripts will ignore WG5
  until its route length is confirmed and added.

Do not guess missing route lengths.

## Acceptance test for the repaired subfolder feature

Before trusting GitHub publishing, verify all of the following in a fork or
temporary review branch:

1. The Uploaded Folders directory recursively displays all four slot folders.
2. `MPW48` reports the files contained below it rather than `(0)`.
3. **Download all (zip)** contains the complete hierarchy and all 190 files.
4. The publish preview reports 190 test files.
5. Published paths retain the hierarchy, for example:

   ```text
   tests/SOI220nm_1550nm_TE_STRIP_Waveguide/MPW48/Slot5_Step31/Chip2_WG1.txt
   ```

6. `Chip2_WG1.txt` from different slots exists at separate paths and neither
   file replaces the other.
7. Fetching the GitHub parent folder recreates `MPW48/Slot#_Step#` rather than
   flattening everything into `Files`.
8. The file counts and SHA-256 checksums still match the cs-testsuite source.
9. The three folder-level scripts reproduce the pre-publish results after the
   GitHub round trip.

If any check fails, stop and continue using cs-testsuite as the source of truth.

## Publishing safeguards after the fix

1. Confirm the intended destination repository and path with the maintainer.
2. Never select the `myslice` preset when it points to
   `cornerstone-uos/PDKMonitor`.
3. Remove every publish row except **Test results** unless the other sections
   are intentionally being updated.
4. Confirm that the preview shows nested relative paths and 190 test files.
5. Choose **Open Pull Request**, not **Direct commit**.
6. Review the complete diff before merging.
7. Confirm that no new or duplicate building block is created.

## Symptoms that the repair is incomplete

- `MPW48 (0)` appears in the Uploaded Folders directory.
- The publish window reports `Test results (0 files)`.
- All fetched files appear inside `Files`.
- Slot folders disappear after a fetch.
- PDKMonitor says it replaced an existing `Chip#_WG#.txt` from another slot.
- A propagation script reads the wrong route configuration.

Do not publish when any of these symptoms are present.
