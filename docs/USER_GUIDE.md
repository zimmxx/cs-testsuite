# CORNERSTONE interface user guide

Updated 30 September 2026.

## 1. Test team — load, process, review and publish

Open the Workspace. Select a Project in the top bar, then open Dataset. Platform, Slot number, Step number and Building block filters show only values in that project's catalogue; changing an earlier filter resets later filters. Choose a result to load it. Enable Show full dataset names if you prefer the complete canonical name.

For new measurements, use the workspace upload controls. Wafer-scale tester text files and supported manual spreadsheets are translated into the shared measurement schema. Check column mappings, chip coordinates, waveguide lengths, wavelength and source type before interpreting results. Metadata and route-config.json supplied with a dataset folder restore its processing configuration. Do not assume the filename alone establishes the physical process history.

Check Dataset parameters & review. Enter a Step description such as Before cleaning, After cleaning, or After etch. Record test-team comments explaining measurements, exclusions and follow-up actions. Step number remains the controlled identifier (e.g. Step36 or Step84A); the description is separate metadata and does not change the folder naming convention.

Propagation Processing Settings are collapsed initially. Use Show settings to inspect the target wavelength, wavelength window, spectral sampling, MSE threshold and waveguide lengths. Apply & Recalculate commits changes to the analysis. Examine the fit and spectrum of each die; explain any excluded dies in test-team comments.

Propagation fit quality shows green Meets fit criteria when every included die meets the propagation fit criterion, and amber Needs fit review when at least one does not. A missing fit is not a pass. Excluded dies are outside the reviewed denominator. Not evaluated means no usable saved review is available. This reports processing quality; fabrication acceptance needs the agreed device specifications and test-team judgement.

Open Library > Dataset Snapshots and use Save Dataset Snapshot to retain the current measurements, step description, comments and review in this browser. For an existing local snapshot, Apply to Loaded Snapshot updates its metadata and review. Saving a project or exporting a .wstpkg provides another route for retaining or sharing work; browser storage should not be your only copy.

Measurement acceptance is a separate manual acceptance decision in the Workspace and Current Publish Preview. Choose Awaiting review (grey), Accepted (green), Accepted with conditions (amber), or Rejected (red), and record the reasons or outstanding issues in Test-team comments. Saving or applying the snapshot retains this approval for the publish preview. Meets fit criteria does not automatically set measurement acceptance.

Before publishing, review Project, Platform, Slot, Process step, Measurement date, Optical mode, Building block, Measurement type and Alignment mode in the publish preview. Check Step description and Test-team comments as well. The canonical name identifies the dataset; free-text descriptions are included in metadata.json and the generated README, alongside the library manifest.

Configure the GitHub owner, repository and branch in Dataset Snapshots (defaults: zimmxx/cs-testsuite, main). For writes, supply a fine-grained token with access to the target repository and Contents read/write permission. Use Publish on the reviewed local snapshot. Wait for the completion message; publishing updates traces, configuration, metadata, README and library indexes through repository commits. Refresh Library and reload the published result to verify it. If publishing fails, inspect the status and repository files before retrying because some files may already have been written.

To revise a published result, select it in the published metadata editor, change the description/comments and save metadata. To replace its processing review, load that same dataset, review the active analysis and save its current review through the published editor. Do not publish unreviewed data as an accepted fabrication result.

To change approval without uploading measurements again, open Dataset Snapshots > Published Dataset Editor, select the existing published dataset, and change Measurement acceptance and comments. Choose Save Metadata to GitHub. If that same dataset is loaded in the Workspace, the button becomes Save Metadata + Current Review to GitHub; it also saves the current fit review, exclusions and processing settings. This route writes metadata.json and the library indexes only, leaving measurement traces in their existing folder. The approval is available in Overview and restored when the dataset is loaded. Previously published datasets without this field start as Awaiting review. Newly generated dataset READMEs link to metadata.json for the latest decision; existing published READMEs are not rewritten by this metadata-only save. This JSON file and the library view hold the current acceptance; no separate review file or repeated measurement upload is needed.

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
