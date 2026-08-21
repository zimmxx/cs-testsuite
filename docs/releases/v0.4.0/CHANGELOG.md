# Changelog
# Version: v0.4.0

## Added

- CORNERSTONE logo asset and external website link
- startup, loading, success, and error notifications for dataset operations
- meaningful navigation and summary-card icons for silicon photonics workflows
- dataset-derived wafermap scale values and Reset Scale action
- development screenshot archive and CORNERSTONE stakeholder presentation

## Changed

- updated the application description to “Unified processing and analysis for silicon photonics wafer measurements.”
- reorganised the sidebar into Workspace, Library, and Settings groups
- changed Measured Chips to count all measured chips in the dataset
- changed Avg Propagation Loss to the filtered wafer-average result
- changed fit-quality terminology from RMSE/R2-oriented summaries to MSE where fit quality is presented
- renamed the loss-trace panel to Transmission Spectrum
- moved wafermap controls below the wafermap
- compacted the analysis layout for 100% desktop browser view
- simplified settings to theme and display preferences
- updated documentation links and package version to `v0.4.0`

## Removed

- duplicate Workspace Snapshot navigation
- fit R2 summary card from wafer-level propagation analysis
- file-translator status and report-preview panels from analysis workspaces
- duplicate Generate Post-Processed Files action from Propagation Loss
- operator name and operator role settings

## Fixed

- wafer-scale number fields now allow users to clear and replace values by typing
- empty scale inputs preserve the previous visual scale until a valid value is entered or reset
- propagation panels no longer leave the previous large blank region beneath the fit chart
- summary metrics and panel titles now match their actual analysis meaning

## Validation

- production Vite build
- local browser smoke test at `http://127.0.0.1:5173/`
- bundled dataset load using `MPW48_Slot7_Rib`
- wafer-scale clear, replace, and Reset Scale interaction
- console error and warning check
