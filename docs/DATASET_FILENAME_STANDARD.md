# Dataset And Filename Standard

This guide defines the recommended naming convention for measurement datasets, converted trace files, and GitHub library folders used by the Wafer Post-Processing Suite.

## Why This Standard Exists

A consistent naming pattern makes it much easier to:

- compare slots, wafers, and waveguide types in the Comparison library
- identify manual versus WST-derived traces at a glance
- keep GitHub-hosted measurement folders organized
- generate predictable archive names from the Manual Conversion and Filename Conversion tools

## Standard Dataset Base Name

Use this base structure whenever possible:

```text
MPW##_Platform_Slot##_WaveguideDescriptor_MeasurementType_Mode
```

Example:

```text
MPW30_220nmSOI_Slot3_StripWaveguide_PropagationLoss_WST
```

## Required Tokens

### 1. MPW batch

Format:

```text
MPW30
MPW46
```

### 2. Platform

Recommended examples:

```text
220nmSOI
340nmSOI
SiN
```

### 3. Slot

Format:

```text
Slot3
Slot5
Slot13
```

### 4. Waveguide descriptor

Recommended controlled values:

```text
StripWaveguide
RibWaveguide
SlotWaveguide
Waveguide
```

### 5. Measurement type

Recommended controlled values:

```text
PropagationLoss
InsertionLoss
HeaterEfficiency
```

### 6. Mode

Recommended controlled values:

```text
WST
Manual
Measurement
```

Use `WST` for automated wafer-scale tester trace files and `Manual` for folder-based manual measurement conversions.

## Standard Trace Filename

Use this full file naming pattern for converted traces:

```text
MPW##_Platform_Slot##_WaveguideDescriptor_MeasurementType_Mode_Chip##_WG#.txt
```

Example:

```text
MPW46_220nmSOI_Slot5_StripWaveguide_PropagationLoss_Manual_Chip3_WG1.txt
```

## Standard Archive Name

Converted zip archives should use:

```text
MPW##_Platform_Slot##_WaveguideDescriptor_MeasurementType_Mode_converted_DDMMYYYY.zip
```

Example:

```text
MPW46_220nmSOI_Slot5_StripWaveguide_PropagationLoss_Manual_converted_06072026.zip
```

## GitHub Measurement Library Folder Guidance

When saving a dataset to the GitHub measurement-data library:

- keep one folder per dataset family
- include a `README.md` summary in the folder
- keep all trace files inside that dataset folder
- use the same dataset base name in project notes, saved dataset labels, and exported archives where practical

## Recommended Examples

### Automated WST propagation dataset

```text
MPW30_220nmSOI_Slot13_RibWaveguide_PropagationLoss_WST
```

Trace file example:

```text
MPW30_220nmSOI_Slot13_RibWaveguide_PropagationLoss_WST_Chip11_WG1.txt
```

### Manual propagation dataset

```text
MPW46_220nmSOI_Slot5_StripWaveguide_PropagationLoss_Manual
```

Trace file example:

```text
MPW46_220nmSOI_Slot5_StripWaveguide_PropagationLoss_Manual_Chip3_WG4.txt
```

## Using The App Tools

### Manual Measurement - Conversion

This converts `WG*.xlsx` files into standardized WST-compatible traces and now exports a zip archive using the standard dataset base name.

### Filename Conversion

This renames uploaded files or folder contents into the standard pattern. If the app cannot detect a token, edit the extracted fields before downloading the renamed archive.

### Comparison

The Comparison library depends on consistent dataset naming so users can quickly compare MPW batches, slot numbers, modes, and waveguide families across the GitHub-hosted measurement library.
