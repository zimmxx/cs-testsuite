# DEV_MIT_SOI220nmPassive_Slot18_Step11_1550nm_TE_RIB_Waveguide_PropagationLoss_OperatorAlign
This folder contains GitHub-hosted measurement traces for DEV_MIT.
## Dataset Summary
- Project: DEV_MIT
- Wafer: Slot18
- Platform: SOI220nmPassive
- Building block: RIB_Waveguide
- PDKMonitor building block: SOI220nm_1550nm_TE_RIB_Waveguide
- Optical mode: 1550nm_TE
- Alignment mode: OperatorAlign
- Measurement type: PropagationLoss
- Waveguide type: Rib
- Process step: Step11
- Step description: Not recorded
- Test-team comments: 10 chips are measured across the wafer.  Chip 61 (Die1) has an issue with WG6 with noticable line pass through the waveguide to chip62.
- Latest measurement acceptance and test-team comments: [metadata.json](metadata.json) (updated through the Published Dataset Editor)
- Measurement date: 2026-10-26
- Published date: 2026-10-29
- Files: 60
- Chips: Chip13, Chip35, Chip38, Chip41, Chip45, Chip51, Chip57, Chip61, Chip67, Chip89
- Waveguides: WG1, WG2, WG3, WG4, WG5, WG6
- Metadata: metadata.json
- Route config: route-config.json
- Filename manifest: filename-manifest.csv
- Publisher: CORNERSTONE
- License: Pending
- Normalized rows: 1080060
- Wavelength span: 1530.000 nm to 1620.000 nm
- Notes: PFAS
## Filename Pattern
Each trace uses `Chip#_WG#.txt`. The filename manifest maps every original filename to its published trace filename and SHA-256 checksum.
Each trace is a headerless, tab-delimited, two-column text file:
1. wavelength in nm
2. optical power in W
This folder was prepared for the Wafer Post-Processing Suite GitHub measurement-data library.