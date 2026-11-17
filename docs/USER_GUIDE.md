# CORNERSTONE interface user guide

Updated 17 November 2026.

## 1. Test team — load, process, review and publish

Open the Workspace. Select a Project in the top bar, then open Dataset. Platform, Slot number, Step number and Building block filters show only values in that project's catalogue; changing an earlier filter resets later filters. Choose a result to load it. Enable Show full dataset names if you prefer the complete canonical name.

For new measurements, use the workspace upload controls. Wafer-scale tester text files and supported manual spreadsheets are translated into the shared measurement schema. Check column mappings, chip coordinates, waveguide lengths, wavelength and source type before interpreting results. Metadata and route-config.json supplied with a dataset folder restore its processing configuration. Do not assume the filename alone establishes the physical process history.

Check Dataset parameters & review. Enter a Step description such as Before cleaning, After cleaning, or After etch. Record test-team comments explaining measurements, exclusions and follow-up actions. Step number remains the controlled identifier (e.g. Step36 or Step84A); the description is separate metadata and does not change the folder naming convention.

Propagation Processing Settings are collapsed initially. Use Show settings to inspect the target wavelength, wavelength window, spectral sampling, MSE threshold and waveguide lengths. Apply & Recalculate commits changes to the analysis. Examine the fit and spectrum of each die; explain any excluded dies in test-team comments.

Under Propagation Loss Fit, select a chip and use Waveguides in fit to uncheck faulty measurements. Each chip has its own selection, and fits, MSE, spectra and wafer results recalculate immediately. Excluded traces remain visible in Transmission Spectrum with an excluded label and dashed line. Include all waveguides restores the selected chip. At least two distinct included lengths with data in the selected window are required for a fit; a chip with insufficient data stays available for review and restoration.

Save a Dataset Snapshot after reviewing exclusions, or update the loaded snapshot to retain the current review. Local projects and portable .wstpkg packages also retain the selection. Dataset metadata and analytics JSON store it as `analyticsReview.excludedWaveguideIdsByChip`, for example `{"Chip1":["WG3","WG6"],"Chip2":["WG2"]}`. Publishing that saved review retains all original traces and route lengths, and reopening the dataset restores each chip's exclusions. Excluding WG3 never renumbers WG4 or changes its physical length. Record the reason for exclusions in Test-team comments.

Propagation fit quality shows green Meets fit criteria when every included die meets the propagation fit criterion, and amber Needs fit review when at least one does not. A missing fit is not a pass. Excluded dies are outside the reviewed denominator. Not evaluated means no usable saved review is available. This reports processing quality; fabrication acceptance needs the agreed device specifications and test-team judgement.

Open Library > Dataset Snapshots and use Save Dataset Snapshot to retain the current measurements, step description, comments and review in this browser. For an existing local snapshot, Apply to Loaded Snapshot updates its metadata and review. Saving a project or exporting a .wstpkg provides another route for retaining or sharing work; browser storage should not be your only copy.

Measurement acceptance is a separate manual acceptance decision in the Workspace and Current Publish Preview. Choose Awaiting review (grey), Accepted (green), Accepted with conditions (amber), or Rejected (red), and record the reasons or outstanding issues in Test-team comments. Saving or applying the snapshot retains this approval for the publish preview. Meets fit criteria does not automatically set measurement acceptance.

Before publishing, review Project, Platform, Slot, Process step, Measurement date, Optical mode, Building block, Measurement type and Alignment mode in the publish preview. Check Step description and Test-team comments as well. The canonical name identifies the dataset; free-text descriptions are included in metadata.json and the generated README, alongside the library manifest.

Configure the GitHub owner, repository and branch in Dataset Snapshots (defaults: zimmxx/cs-testsuite, main). For writes, supply a fine-grained token with access to the target repository and Contents read/write permission. Use Publish on the reviewed local snapshot. Wait for the completion message; publishing updates traces, configuration, metadata, README and library indexes through repository commits. Refresh Library and reload the published result to verify it. If publishing fails, inspect the status and repository files before retrying because some files may already have been written.

To revise a published result, select it in the published metadata editor, change the description/comments and save metadata. To replace its processing review, load that same dataset, review the active analysis and save its current review through the published editor. Do not publish unreviewed data as an accepted fabrication result.

To change approval without uploading measurements again, open Dataset Snapshots > Published Dataset Editor, select the existing published dataset, and change Measurement acceptance and comments. Choose Save Metadata to GitHub. If that same dataset is loaded in the Workspace, the button becomes Save Metadata + Current Review to GitHub; it also saves the current fit review, exclusions and processing settings. This route writes metadata.json and the library indexes only, leaving measurement traces in their existing folder. The approval is available in Overview and restored when the dataset is loaded. Previously published datasets without this field start as Awaiting review. Newly generated dataset READMEs link to metadata.json for the latest decision; existing published READMEs are not rewritten by this metadata-only save. This JSON file and the library view hold the current acceptance; no separate review file or repeated measurement upload is needed.

### Electrical Analysis — DC heater sweeps

Open Workspace > Electrical Analysis and use Upload Electrical Files or Upload Electrical Folder. Each .txt or .csv file contains two columns: applied voltage in **V**, measured current in **A**. For example, `WaferThox_Wafer1_test1_Chip4_D2.txt` identifies run `WaferThox_Wafer1_test1`, chip `Chip4` and device `D2`. The complete prefix keeps different wafers and tests separate. Uploads add devices; uploading the same run/chip/device again replaces that sweep and reports the replacement. Malformed rows are counted with their original source line numbers. Source acquisition order, repeated voltages and sweep reversals are preserved.

Select the run, chip and device to inspect. Compare the devices on one chip, the selected device alone or all devices in a run. The I–V curve displays current in mA, while the source data and exports retain amperes. Further plots show point resistance V/I in ohms, electrical power V×I in mW and current residuals against the selected device's fit. Open Fit settings to select a voltage interval and fit either `I = I₀ + G×V` (default, free current offset) or `I = G×V` (forced through zero). These fit settings apply to all loaded sweeps. The plotted fit line uses only that interval; the raw curves always retain the complete sweep. Fitted resistance is `1/G`, and can differ from point V/I for nonlinear traces or a nonzero fitted offset. Centred R² and current RMSE describe the fit, not fabrication acceptance.

The wafermap uses the same selected wafer template as the optical workspace. It maps fitted resistance or peak measured power for the selected **device ID** across chips, avoiding an average of unlike devices. Click a measured chip to inspect it. Unmapped chips remain in the table and chip selector. Verify the wafer template before interpreting locations; the filename supplies the chip number, not a physical coordinate.

Use Save electrical workspace locally to retain source sweeps, fit settings, selected device and notes in this browser. Export project JSON creates a portable electrical project containing the full original source text; Import project JSON replaces the current electrical workspace. Export summary CSV includes every loaded run's device metrics, fit interval and review flags. Export points CSV includes all measured V/I values, derived resistance and power, fit inclusion and residuals. Electrical projects currently use this dedicated save/export workflow, separate from optical Dataset Snapshots, .wstpkg packages and GitHub dataset publication.

This is a two-terminal measurement, so measured resistance includes probe, contact and lead contributions as well as the heater. Do not infer intrinsic heater resistance, temperature, safe operating limits, compliance or optical phase-shift efficiency from these files alone. Power retains the recorded V×I sign; check instrument conventions if it is negative. V/I is unavailable when |I| is at or below 10⁻¹² A or voltage is near zero. A positive fitted resistance is reported only for conductance above 10⁻¹² S. Local negative current/voltage slopes, invalid rows and sweep reversals are review flags, not automatic pass/fail decisions. Record known compliance limits, contact observations and follow-up checks in Electrical measurement notes.

## 2. Cleanroom team — see results and process context

Start in Library > Overview. Filter by project and processing result. Each card identifies the wafer slot, platform, process step and building block, then shows the recorded step description, reviewed die count and test-team comments. There may be several measurements for one wafer at different process steps; compare like-for-like conditions.

Select Inspect dataset for detailed Workspace results. Return to Overview to see the active wafer's die result tiles. Green means an accepted propagation fit; red means a failed or unavailable fit; grey identifies exclusions. Existing catalogue data without a saved review remains Not evaluated until it is loaded and reviewed. Ask the test team for interpretation of red results before drawing conclusions about fabrication.

Use the glossary below to understand units and measurements. CD-SEM Data provides dimensional measurements and its own user-set tolerance; it is separate from the propagation fit verdict.

## 3. PDK team — compare and reuse measurements

Load datasets for the same platform, optical mode and building block. Check step descriptions to separate before/after processing conditions. Use Comparison or MPW Comparison to investigate variation. Keep wavelength, fit threshold, route settings and exclusions comparable and record differences.

Review die-level spectra and fits before using wafer averages. Fit yield is not automatically device yield. A successful fit can still give a loss outside a design specification. Use Report Generator for reporting and .wstpkg exports for portable measurement snapshots. Published GitHub folders retain traces and configuration for reproducibility; record the branch/commit used when importing results into a PDK review.

## Local app and source documentation

For local development, run the Vite dev script with host 127.0.0.1 and port 5173, then open http://127.0.0.1:5173/. Keep the server running while inspecting. The local app can read the shared GitHub catalogue; editing local code does not itself publish code or documentation.

This guide and MEASUREMENT_GLOSSARY.md are repository source documents and appear directly in Help. To publish app/documentation changes, commit these files to the application's repository and follow docs/LOCAL_GIT_GITHUB_WORKFLOW.md. Dataset Publish uploads measurements, not application source files.


Propagation fit quality uses Meets fit criteria (green), Needs fit review (amber), and Not evaluated (grey). These labels describe the automatic MSE fit assessment of included dies. Chip Summary Table and die tiles retain Pass/Fail for individual fit outcomes. Measurement acceptance is a separate manual decision that also covers transmission and future heater/electrical measurements.
