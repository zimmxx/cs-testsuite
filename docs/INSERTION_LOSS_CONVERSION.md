# Manual Conversion (Advanced Insertion Loss)

Open **Library → Manual Conversion (Advanced Insertion Loss)**, or use `#manual-conversion-insertion`.

This converter is independent of the WG-only propagation converter. It reads XLSX, XLS, CSV, TSV and delimited TXT files with arbitrary names. It does not edit source files. It supports selecting individual files, filtering a parent folder by an exact subfolder name, or pasting CSV/tab-separated data.

## BORDER reference workbooks

1. Enter the dataset fields and the actual measurement date and laser output power.
2. Set **Target source subfolder** to `BORDER`, then choose a parent folder containing the chip folders. Both `Rib_Ref.xlsx` and `Strip_Ref.xlsx` are accepted. Individual file selection has no parent path, so explicitly selected files bypass the folder filter.
3. Review the suggested `IL` worksheet, wavelength/value columns, first and last data rows, units, chip identity, device label and building block. `Chip67/BORDER/Rib_Ref.xlsx` and `Strip_Ref.xlsx` are identified as rib and strip respectively. If selecting individual files without a chip in the filename, enter the chip manually.
4. Review valid points and skipped rows. Choose **Add another trace from this file** to map another worksheet, value column or sweep range. Use **transpose** for tables whose wavelengths run across a row. Header row 0 means no header; first/last data rows are independently editable.
5. Confirm the previews, then download the ZIP. Rib and strip are placed in separate canonical dataset folders.
6. Extract the ZIP. In **Upload Measurement Files**, select one folder's TXT traces together with `metadata.json` and `route-config.json`. Do not upload multiple dataset folders in one selection. The app opens Insertion Loss and restores the device labels.

## Values and output

- Insertion loss in dB: positive numbers represent attenuation; negative values remain negative gain.
- Transmission in dB: negative numbers represent attenuation; the converter negates them to obtain insertion loss.
- Measured dBm/W: insertion loss is calculated from the entered laser output power. Non-positive watts are skipped.
- Wavelength units: nm, m, µm, pm. Units and value meanings are always editable.
- Non-numeric rows are counted as skipped. Repeated wavelengths require selecting a single sweep range or separate traces.

Each trace becomes a headerless TXT file containing wavelength in nm and optical power in W. The library-compatible `Chip#_WG#.txt` output names use WG numbers as trace identities only. No propagation lengths or fitting are involved. `metadata.json` contains `measurementType: InsertionLoss`, laser power and `insertionTraceMap` to preserve device labels, building blocks and original source paths, including sheet/column/range. The checksum manifest maps original source traces to output filenames. These fields survive reloading and republishing.

The inputs can have arbitrary filenames and column layouts, but export still requires the existing library's dataset naming fields and numeric Chip identifiers. Binary OMR and unrelated formats are reported as unsupported. Repeated chips/devices in a long table can be split by row ranges; this version does not automatically group a chip or device column.

## Validation

Run `node --test scripts/test-insertion-conversion.mjs` and `pnpm build`. Tests cover arbitrary names, sheets, header offsets, CSV/TSV/TXT, transposed and headerless tables, multiple value columns, units/signs, invalid mappings, split rib/strip packages, metadata/analysis round trips and retained propagation restrictions.
