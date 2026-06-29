# MPW30 Slot 13 Rib WST Raw Data

This folder contains raw automated wafer-scale tester (WST) propagation traces for the MPW30 slot 13 rib waveguide set.

## Dataset Summary
- Source format: plain text (`.txt`)
- Files: 60 traces
- Chips: `Chip11-14`, `Chip35-40`
- Waveguides per chip: `WG1-WG6`
- Samples per file: 8001
- Wavelength span in the sample set: about `1529.6592 nm` to `1609.7017 nm`
- Data columns per file:
  1. wavelength in nm
  2. optical power in W

## Filename Pattern
`WaferMPW_30_slot13_rib_wg_ChipXX_WGY.txt`

Parsed tokens used by the app:
- Wafer or run label: `WaferMPW_30_slot13_rib_wg`
- Slot: `slot13`
- Chip: `ChipXX`
- Waveguide: `WGY`
- Waveguide family: `rib`

## App Import Behavior
The web app detects these files as `Automated WST trace` uploads when the filename contains both `ChipXX` and `WGY` and the text file contains two numeric columns.

During normalization the app derives:
- `chip_id` from `ChipXX`
- `waveguide_id` and `waveguide_index` from `WGY`
- `slot_id` from `slot13`
- `wafer_label` from the filename prefix before `ChipXX`
- `waveguide_type` from the filename tokens, such as `Slot13 Rib waveguide`
- `optical_power_dbm` from the optical power column in watts
- `loss_db` from `launch_power_dbm - optical_power_dbm`
- `relative_length_mm` from the editable WG length map in the UI

This dataset is intended as a raw-data example for developing and validating the WST propagation workflow.
